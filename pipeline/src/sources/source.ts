// The interface every catalog source implements (adapted from legacy retailer-provider.ts). The run
// driver owns the lifecycle; a source only says what to fetch and how to read what came back:
//
//   plan → fetch (polite HTTP client) → storeRaw → parse(raw) → validate → upsert
//
// `parse` sees only the stored raw response, never live state, so it can re-run from Storage
// without fetching again (CLAUDE.md "Raw data"). Generic code never branches on a source key.
import type { RecordKind, RunMode, ValidateOptions } from '@sarvis/core';

import type { HttpClient } from '../http/client.ts';
import type { Logger } from '../log.ts';
import type { RawInput } from '../raw/store.ts';

/** What a source can do. The driver checks these instead of asking which source it is. */
export interface SourceCapabilities {
  /** Supports `mode = 'delta'` (only records changed since the last run). */
  supportsDelta: boolean;
  /**
   * How many days back a delta run can see (OFF: its index lists the last 14 days). `--mode auto`
   * runs `full` instead of `delta` once the last clean full or delta run is older than this less a
   * day, because the files in between are gone from the index (P6.1).
   */
  deltaWindowDays?: number;
  /**
   * A full run sees every record the source has, so records missing from a clean full run may be
   * marked inactive. False for lookups and searches, which only ever see part of the source.
   */
  supportsDeactivation: boolean;
  /** Prices are per store, so `verifyContext` must prove the store before anything is written. */
  storeSpecificPricing: boolean;
  /**
   * `email`: the source's terms ask for a contact email in the User-Agent (OFF, SEC EDGAR), so the
   * run needs `PIPELINE_CONTACT_EMAIL`. Default `url`: the repo URL only (D-015). `email_only`:
   * the email without the repo URL, for a host that refuses a URL in the User-Agent (SEC, D-074).
   */
  contact?: 'url' | 'email' | 'email_only';
  /**
   * The source applies `sampleSize` itself, counting its own unit (Wikidata: matched brands, not
   * the companies and edges each one brings), so the driver doesn't stop at that many records.
   */
  samplesItself?: boolean;
  /**
   * A run fetches only what changed since the stored state (Wikipedia: pages whose revision id
   * moved), so a full run that finds nothing new returning 0 records isn't a broken source. The
   * driver skips the "previously N, now 0" check for it.
   */
  changesOnly?: boolean;
}

/**
 * A documented API path that the host's robots.txt disallows for crawlers (D-065, owner-approved
 * 2026-11-03). Requests under `prefix` skip the robots check only; the rate limit, User-Agent and
 * 429 handling still apply. Every exemption is listed in SOURCES.md with the operator's own docs.
 */
export interface RobotsExemption {
  /** An absolute URL prefix, e.g. `https://query.wikidata.org/sparql`. */
  prefix: string;
  /** The operator's documentation for programmatic use of this endpoint. */
  docs: string;
}

/** The `sources` row fields the driver and sources need. */
export interface SourceRow {
  id: string;
  key: string;
  verdict: 'use' | 'manual_only' | 'avoid';
  enabled: boolean;
  rate_limit_per_sec: number;
}

export interface SourceRunContext {
  runId: string;
  source: SourceRow;
  mode: RunMode;
  /** The record cap for a sample (or sampled dry) run; null means every record. */
  sampleSize: number | null;
  http: HttpClient;
  signal: AbortSignal;
  log: Logger;
  /**
   * Which of `urls` an earlier `completed` run of this source, job and mode already stored, by
   * the raw objects' `request_url`. A delta source uses it to skip files it has imported.
   */
  storedRequestUrls(urls: string[]): Promise<Set<string>>;
}

/** A bulk file the run read. A DownloadResult fits; a sample streamed from the URL has no hash. */
export interface DumpInfo {
  url: string;
  sha256?: string | null;
  fetchedAt: string;
}

/** Something the source wants on the run's event log (e.g. how many rows a filter dropped). */
export interface SourceEvent {
  severity: 'info' | 'warn';
  eventType: string;
  message: string;
  details?: Record<string, unknown>;
}

/** One fetch: the response to store, and any further steps it revealed (the next page). */
export interface FetchResult<Step> {
  response: RawInput;
  next?: Step[];
  /** Recorded on the run as `dump_url`, `dump_sha256` and `dump_fetched_at`; the last one wins. */
  dump?: DumpInfo;
  /** Written as `ingestion_run_events` (within the run's event cap). */
  events?: SourceEvent[];
  /**
   * The response is a control query that yields no records (Wikipedia's revision check), so it
   * isn't stored. `parse` still sees it, with `rawObjectId` null.
   */
  skipRaw?: boolean;
}

/** A stored response as `parse` sees it. The same shape whether it came from a fetch or Storage. */
export interface RawPayload {
  /** Null in a dry run, where nothing is stored. */
  rawObjectId: string | null;
  body: string;
  contentType: string;
  requestUrl: string | null;
  httpStatus: number | null;
  headers: Record<string, string>;
  fetchedAt: string;
}

/** Unvalidated records of one kind. */
export interface RecordBatch {
  kind: RecordKind;
  records: unknown[];
}

export interface ParseResult {
  /** Unvalidated records of the source's `recordKind`. */
  records: unknown[];
  /**
   * Batches of other kinds, validated and written after `records`, in this order. A source that
   * reads several tables (legacy-import) uses them, so one stored file can feed several tables.
   */
  batches?: RecordBatch[];
  /** How many records the source says exist in total, when the response tells us (capped pagination). */
  expectedTotal?: number | null;
}

export interface Source<K extends RecordKind = RecordKind, Step = unknown> {
  /** The `sources.key` this implements. */
  readonly key: string;
  /** `ingestion_runs.job`, e.g. `off-import`. */
  readonly job: string;
  /** `ingestion_runs.job_version`; bump it when parsing changes. */
  readonly version: string;
  readonly recordKind: K;
  readonly capabilities: SourceCapabilities;
  /** Extra milliseconds between fetches, on top of the HTTP client's per-host limit. */
  readonly politenessDelayMs?: number;
  /** Documented API endpoints that robots.txt disallows (D-065). */
  readonly robotsExemptions?: readonly RobotsExemption[];
  /** The HTTP timeout per request, when the source's queries can take longer than the default. */
  readonly timeoutMs?: number;
  /**
   * 429 handling when the host documents short throttles (HttpClientOptions): the longest
   * Retry-After waited for, and the wait when a 429 has no Retry-After.
   */
  readonly throttle?: { maxRetryAfterMs: number; missingRetryAfterMs: number };
  /**
   * Writer rejection reasons (`RejectedRecord.reason`) this source expects, e.g. a price for a
   * product the catalog doesn't have yet. Those records are counted in an info event named after
   * the reason, and in `skipped` on the run_finished event, instead of making the run
   * `completed_with_errors`.
   */
  readonly expectedRejections?: readonly string[];

  /** Cheap check of static configuration. Throws ConfigurationError. */
  validateConfiguration?(): Promise<void> | void;
  /**
   * Prove that live responses are for the right context (the expected store, region or language)
   * before anything is written. Throw to fail the run rather than import the wrong data.
   */
  verifyContext?(ctx: SourceRunContext): Promise<void>;
  /** The first steps: pages, files or queries. */
  plan(ctx: SourceRunContext): Promise<Step[]> | Step[];
  fetch(step: Step, ctx: SourceRunContext): Promise<FetchResult<Step>>;
  parse(raw: RawPayload): ParseResult;
  /** Price bounds and the unit parser for validateBatch. */
  validateOptions?(): ValidateOptions;
  /** Release long-lived resources. */
  dispose?(): Promise<void>;
}
