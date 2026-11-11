// The pipeline command line (PLAN P2.17). From the repo root:
//
//   npm run pipeline -- run <source> [--sample N] [--dry-run] [--mode full|delta]
//   npm run pipeline -- job <name> [--sample N] [--dry-run]
//   npm run pipeline -- export odbl
//   npm run pipeline -- raw cleanup [--dry-run]
//
// `--sample N` runs the first N records; `--dry-run` fetches, parses and validates but writes no
// catalog rows or raw files (the run row and its events are still recorded). Without either, the
// run is `--mode` (default full; `auto` picks delta or full, P6.1). Exit codes: 0 completed, 2
// completed with errors, 1 failed or a bad command, 130 cancelled. `export odbl` publishes the
// ODbL extract (P3.8): exit 0 or 1. `job` runs a derived job over our own tables (P4.7), with the
// same exit codes as `run`. `raw cleanup` deletes the raw files past their retention (P6.3): exit 0
// or 1.
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import type { RunMode, RunTrigger } from '@sarvis/core';

import { type ServiceClient, getServiceClient } from './db/client.ts';
import { writerFor } from './db/writers/index.ts';
import { parseContactEmail } from './env.ts';
import { exportOdbl } from './exports/odbl.ts';
import { cleanupRaw, describePlan, kb } from './raw/cleanup.ts';
import { ConfigurationError, classifyError } from './errors.ts';
import { type Job, createJob, listJobNames } from './jobs/index.ts';
import { type JobMode, runJob } from './jobs/runner.ts';
import { type Logger, logger as rootLogger } from './log.ts';
import { chooseAutoMode } from './runs/auto-mode.ts';
import { type RunResult, runSource, storageRawWriter } from './runs/driver.ts';
import { createSupabaseRunStore } from './runs/store.ts';
import { createShutdownController } from './shutdown.ts';
import { type Source, createSource, listSourceKeys, registerAllSources } from './sources/index.ts';

export const USAGE = `Usage: npm run pipeline -- run <source> [--sample N] [--dry-run] [--mode full|delta]
       npm run pipeline -- job <name> [--sample N] [--dry-run]
       npm run pipeline -- export odbl
       npm run pipeline -- raw cleanup [--dry-run]

  --sample N   Run the first N records only (mode sample).
  --dry-run    Fetch, parse and validate, but write no catalog rows or raw files.
               With --sample, a dry run of the first N records.
  --mode M     full (default), delta, or auto. Not with --sample or --dry-run.
               auto: delta while the source's delta window reaches back to its last
               completed full or delta run, else full (sources without deltas: full).
  --help       Show this help.

  job <name>   Run a derived job over our own tables (only the rows that need work).
               Takes --sample and --dry-run, not --mode.

  export odbl  Publish the ODbL extract (OFF products, Open Prices stores and prices) to the
               public-exports bucket, keeping the latest 2 exports.

  raw cleanup  Delete the raw files past their source's retention (DATA_MODEL §5) and mark
               their rows. With --dry-run, list what would go and delete nothing.`;

export type CliCommand =
  | { command: 'help' }
  | { command: 'export'; target: 'odbl' }
  | { command: 'raw-cleanup'; dryRun: boolean }
  | { command: 'run'; sourceKey: string; mode: RunMode | 'auto'; sampleSize: number | null }
  | { command: 'job'; name: string; mode: JobMode; sampleSize: number | null };

/** Parses argv (without node and the script). Throws ConfigurationError on a bad command. */
export function parseCliArgs(argv: string[]): CliCommand {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        sample: { type: 'string' },
        'dry-run': { type: 'boolean' },
        mode: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (err) {
    throw new ConfigurationError(`${(err as Error).message}\n\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  if (values.help || positionals.length === 0) return { command: 'help' };

  const [command, sourceKey, ...extra] = positionals;
  if (command === 'export') {
    if (sourceKey !== 'odbl') {
      throw new ConfigurationError(`Unknown export: ${sourceKey ?? '(none)'}. Exports: odbl.`);
    }
    if (extra.length > 0) throw new ConfigurationError(`Unexpected arguments: ${extra.join(' ')}`);
    if (Object.keys(values).length > 0) {
      throw new ConfigurationError('export odbl takes no options.');
    }
    return { command: 'export', target: 'odbl' };
  }
  if (command === 'raw') {
    if (sourceKey !== 'cleanup') {
      throw new ConfigurationError(
        `Unknown raw command: ${sourceKey ?? '(none)'}. Commands: cleanup.`,
      );
    }
    if (extra.length > 0) throw new ConfigurationError(`Unexpected arguments: ${extra.join(' ')}`);
    const { 'dry-run': dryRun, ...rest } = values;
    if (Object.keys(rest).length > 0) {
      throw new ConfigurationError('raw cleanup takes --dry-run only.');
    }
    return { command: 'raw-cleanup', dryRun: dryRun === true };
  }
  if (command !== 'run' && command !== 'job') {
    throw new ConfigurationError(`Unknown command: ${command}\n\n${USAGE}`);
  }
  if (!sourceKey) {
    const what = command === 'job' ? 'job name' : 'source key';
    throw new ConfigurationError(`Missing the ${what}.\n\n${USAGE}`);
  }
  if (extra.length > 0) throw new ConfigurationError(`Unexpected arguments: ${extra.join(' ')}`);

  let sampleSize: number | null = null;
  if (values.sample !== undefined) {
    sampleSize = Number(values.sample);
    if (!/^\d+$/.test(values.sample) || sampleSize < 1) {
      throw new ConfigurationError(
        `--sample needs a positive whole number, got "${values.sample}".`,
      );
    }
  }
  const dryRun = values['dry-run'] === true;
  if (command === 'job') {
    if (values.mode !== undefined) {
      throw new ConfigurationError('A job takes --sample and --dry-run, not --mode.');
    }
    const jobMode: JobMode = dryRun ? 'dry_run' : sampleSize !== null ? 'sample' : 'full';
    return { command: 'job', name: sourceKey, mode: jobMode, sampleSize };
  }
  if (values.mode !== undefined) {
    if (values.mode !== 'full' && values.mode !== 'delta' && values.mode !== 'auto') {
      throw new ConfigurationError(`--mode must be full, delta or auto, got "${values.mode}".`);
    }
    if (dryRun || sampleSize !== null) {
      throw new ConfigurationError('--mode cannot be combined with --sample or --dry-run.');
    }
  }
  const mode: RunMode | 'auto' = dryRun
    ? 'dry_run'
    : sampleSize !== null
      ? 'sample'
      : ((values.mode as 'full' | 'delta' | 'auto' | undefined) ?? 'full');
  return { command: 'run', sourceKey, mode, sampleSize };
}

/** The Actions run, when the CLI runs inside one. */
function actionsRunUrl(env: NodeJS.ProcessEnv): string | null {
  const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: id } = env;
  return server && repo && id ? `${server}/${repo}/actions/runs/${id}` : null;
}

/** `ingestion_runs.triggered_by`: the Actions event that started the run, else `cli`. */
export function runTrigger(env: NodeJS.ProcessEnv): RunTrigger {
  if (env.GITHUB_ACTIONS !== 'true') return 'cli';
  if (env.GITHUB_EVENT_NAME === 'schedule') return 'schedule';
  if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') return 'dispatch';
  return 'cli';
}

export interface RunCommandDeps {
  db?: ServiceClient;
  /** Overrides the registry (tests wrap the fixture source). */
  source?: Source;
  signal?: AbortSignal;
  log?: Logger;
  /** Overrides `PIPELINE_CONTACT_EMAIL` from the environment (null means unset). */
  contactEmail?: string | null;
  /** Overrides `process.env` for the trigger, git SHA and Actions URL. */
  env?: NodeJS.ProcessEnv;
}

/** One `run` command against the dev project, with the real run store, raw store and writer. */
export async function runCommand(
  cmd: Extract<CliCommand, { command: 'run' }>,
  deps: RunCommandDeps = {},
): Promise<RunResult & { mode: RunMode }> {
  registerAllSources();
  const source = deps.source ?? createSource(cmd.sourceKey);
  const db = deps.db ?? getServiceClient();
  const env = deps.env ?? process.env;
  const store = createSupabaseRunStore(db);
  let mode: RunMode;
  if (cmd.mode === 'auto') {
    const choice = await chooseAutoMode(source, store);
    (deps.log ?? rootLogger).info(`--mode auto chose ${choice.mode}.`, {
      sourceKey: source.key,
      ...choice,
    });
    mode = choice.mode;
  } else {
    mode = cmd.mode;
  }
  const result = await runSource(
    source,
    {
      mode,
      sampleSize: cmd.sampleSize,
      trigger: runTrigger(env),
      gitSha: env.GITHUB_SHA ?? null,
      actionsRunUrl: actionsRunUrl(env),
      signal: deps.signal,
    },
    {
      store,
      raw: storageRawWriter(db),
      writer: writerFor(db, source.recordKind),
      writerFor: (kind) => writerFor(db, kind),
      log: deps.log,
      contactEmail: deps.contactEmail === undefined ? parseContactEmail(env) : deps.contactEmail,
    },
  );
  return { ...result, mode };
}

export interface JobCommandDeps {
  db?: ServiceClient;
  /** Overrides the registry (tests pass their own job). */
  job?: Job;
  signal?: AbortSignal;
  log?: Logger;
  /** Overrides `process.env` for the trigger, git SHA and Actions URL. */
  env?: NodeJS.ProcessEnv;
}

/** One `job` command against the dev project, with the real run store. */
export async function jobCommand(
  cmd: Extract<CliCommand, { command: 'job' }>,
  deps: JobCommandDeps = {},
): Promise<RunResult> {
  const db = deps.db ?? getServiceClient();
  const env = deps.env ?? process.env;
  const job = deps.job ?? createJob(cmd.name, db);
  return runJob(
    job,
    {
      mode: cmd.mode,
      sampleSize: cmd.sampleSize,
      trigger: runTrigger(env),
      gitSha: env.GITHUB_SHA ?? null,
      actionsRunUrl: actionsRunUrl(env),
      signal: deps.signal,
    },
    { store: createSupabaseRunStore(db), log: deps.log },
  );
}

export const EXIT_CODES: Record<RunResult['status'], number> = {
  completed: 0,
  completed_with_errors: 2,
  failed: 1,
  cancelled: 130,
};

/** Runs the CLI and returns the exit code. */
export async function main(argv: string[], log: Logger = rootLogger): Promise<number> {
  let cmd: CliCommand;
  try {
    cmd = parseCliArgs(argv);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }
  if (cmd.command === 'help') {
    registerAllSources();
    process.stdout.write(
      `${USAGE}\n\nSources: ${listSourceKeys().join(', ')}\nJobs: ${listJobNames().join(', ')}\n`,
    );
    return 0;
  }

  if (cmd.command === 'export') {
    try {
      const result = await exportOdbl(getServiceClient(), { log });
      const files = result.files.map(
        (f) => `  ${f.path}  ${f.bytes} B${f.rows === undefined ? '' : `, ${f.rows} rows`}`,
      );
      process.stdout.write(
        [
          '',
          `export odbl ${result.exportId}: completed`,
          ...files,
          `  kept    ${result.kept.join(', ')}`,
          `  deleted ${result.pruned.join(', ') || '(none)'}`,
          `  url     ${result.files[0]?.url.replace(/[^/]+$/, '') ?? ''}`,
          '',
        ].join('\n'),
      );
      return 0;
    } catch (err) {
      const c = classifyError(err);
      log.error('ODbL export failed', { errorType: c.type, err });
      return 1;
    }
  }

  if (cmd.command === 'raw-cleanup') {
    try {
      const { plan, deleted, readBack } = await cleanupRaw(getServiceClient(), {
        dryRun: cmd.dryRun,
        log,
      });
      const sources = Object.entries(plan.bySource)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(
          ([key, s]) =>
            `  ${key.padEnd(17)} ${String(s.files).padStart(6)} files ${kb(s.bytes).padStart(11)}   delete ${String(s.deleteFiles).padStart(5)} ${kb(s.deleteBytes).padStart(11)}`,
        );
      const freed = plan.delete.reduce((n, d) => n + d.file.byteSize, 0);
      process.stdout.write(
        [
          '',
          `raw cleanup${cmd.dryRun ? ' (dry run)' : ''}: ${cmd.dryRun ? 'would delete' : 'deleted'} ${cmd.dryRun ? plan.delete.length : deleted} files, ${kb(freed)}`,
          ...sources,
          '',
          cmd.dryRun ? 'Would go:' : 'Went:',
          ...(plan.delete.length > 0 ? describePlan(plan) : ['  (nothing)']),
          '',
          'Protected:',
          ...plan.protectedRuns.map((r) => `  ${r.sourceKey.padEnd(17)} ${r.runId}  ${r.why}`),
          ...(readBack.length > 0
            ? [
                '',
                `Read back with readRaw: ${readBack.map((r) => `${r.sourceKey} ${r.rawObjectId}`).join(', ')}`,
              ]
            : []),
          '',
        ].join('\n'),
      );
      return 0;
    } catch (err) {
      const c = classifyError(err);
      log.error('raw cleanup failed', { errorType: c.type, err });
      return 1;
    }
  }

  const shutdown = createShutdownController({ log });
  if (cmd.command === 'job') {
    try {
      const { runId, status, counts, errorSummary } = await jobCommand(cmd, {
        signal: shutdown.signal,
        log,
      });
      log.info('pipeline job finished', {
        job: cmd.name,
        mode: cmd.mode,
        runId,
        runStatus: status,
        counts,
        errorSummary,
      });
      process.stdout.write(
        `\njob ${cmd.name} ${cmd.mode}${cmd.sampleSize ? ` (sample ${cmd.sampleSize})` : ''}: ${status}\n` +
          Object.entries(counts)
            .map(([k, v]) => `  ${k.padEnd(15)} ${v}`)
            .join('\n') +
          `\n  run ${runId}\n`,
      );
      return EXIT_CODES[status];
    } catch (err) {
      // Refused before a run row existed: unknown job, the job already running, bad options.
      const c = classifyError(err);
      log.error('pipeline job refused', { job: cmd.name, errorType: c.type, err });
      return 1;
    } finally {
      shutdown.dispose();
    }
  }
  try {
    const result = await runCommand(cmd, { signal: shutdown.signal, log });
    const { runId, status, counts, expectedTotal, errorSummary, mode } = result;
    log.info('pipeline run finished', {
      sourceKey: cmd.sourceKey,
      mode,
      runId,
      runStatus: status,
      counts,
      expectedTotal,
      errorSummary,
    });
    process.stdout.write(
      `\n${cmd.sourceKey} ${mode}${cmd.mode === 'auto' ? ' (auto)' : ''}${cmd.sampleSize ? ` (sample ${cmd.sampleSize})` : ''}: ${status}\n` +
        Object.entries(counts)
          .map(([k, v]) => `  ${k.padEnd(15)} ${v}`)
          .join('\n') +
        `\n  run ${runId}\n`,
    );
    return EXIT_CODES[status];
  } catch (err) {
    // Refused before a run row existed: unknown source, bad verdict, bad env or options.
    const c = classifyError(err);
    log.error('pipeline run refused', { sourceKey: cmd.sourceKey, errorType: c.type, err });
    return 1;
  } finally {
    shutdown.dispose();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
