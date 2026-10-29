// The pipeline command line (PLAN P2.17). From the repo root:
//
//   npm run pipeline -- run <source> [--sample N] [--dry-run] [--mode full|delta]
//
// `--sample N` runs the first N records; `--dry-run` fetches, parses and validates but writes no
// catalog rows or raw files (the run row and its events are still recorded). Without either, the
// run is `--mode` (default full). Exit codes: 0 completed, 2 completed with errors, 1 failed or a
// bad command, 130 cancelled.
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import type { RunMode } from '@sarvis/core';

import { type ServiceClient, getServiceClient } from './db/client.ts';
import { writerFor } from './db/writers/index.ts';
import { ConfigurationError, classifyError } from './errors.ts';
import { type Logger, logger as rootLogger } from './log.ts';
import { type RunResult, runSource, storageRawWriter } from './runs/driver.ts';
import { createSupabaseRunStore } from './runs/store.ts';
import { createShutdownController } from './shutdown.ts';
import { type Source, createSource, listSourceKeys, registerAllSources } from './sources/index.ts';

export const USAGE = `Usage: npm run pipeline -- run <source> [--sample N] [--dry-run] [--mode full|delta]

  --sample N   Run the first N records only (mode sample).
  --dry-run    Fetch, parse and validate, but write no catalog rows or raw files.
               With --sample, a dry run of the first N records.
  --mode M     full (default) or delta. Not with --sample or --dry-run.
  --help       Show this help.`;

export type CliCommand =
  | { command: 'help' }
  | { command: 'run'; sourceKey: string; mode: RunMode; sampleSize: number | null };

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
  if (command !== 'run') throw new ConfigurationError(`Unknown command: ${command}\n\n${USAGE}`);
  if (!sourceKey) throw new ConfigurationError(`Missing the source key.\n\n${USAGE}`);
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
  if (values.mode !== undefined) {
    if (values.mode !== 'full' && values.mode !== 'delta') {
      throw new ConfigurationError(`--mode must be full or delta, got "${values.mode}".`);
    }
    if (dryRun || sampleSize !== null) {
      throw new ConfigurationError('--mode cannot be combined with --sample or --dry-run.');
    }
  }
  const mode: RunMode = dryRun
    ? 'dry_run'
    : sampleSize !== null
      ? 'sample'
      : ((values.mode as RunMode | undefined) ?? 'full');
  return { command: 'run', sourceKey, mode, sampleSize };
}

/** The Actions run, when the CLI runs inside one. */
function actionsRunUrl(env: NodeJS.ProcessEnv): string | null {
  const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: id } = env;
  return server && repo && id ? `${server}/${repo}/actions/runs/${id}` : null;
}

export interface RunCommandDeps {
  db?: ServiceClient;
  /** Overrides the registry (tests wrap the fixture source). */
  source?: Source;
  signal?: AbortSignal;
  log?: Logger;
}

/** One `run` command against the dev project, with the real run store, raw store and writer. */
export async function runCommand(
  cmd: Extract<CliCommand, { command: 'run' }>,
  deps: RunCommandDeps = {},
): Promise<RunResult> {
  registerAllSources();
  const source = deps.source ?? createSource(cmd.sourceKey);
  const db = deps.db ?? getServiceClient();
  return runSource(
    source,
    {
      mode: cmd.mode,
      sampleSize: cmd.sampleSize,
      trigger: 'cli',
      gitSha: process.env.GITHUB_SHA ?? null,
      actionsRunUrl: actionsRunUrl(process.env),
      signal: deps.signal,
    },
    {
      store: createSupabaseRunStore(db),
      raw: storageRawWriter(db),
      writer: writerFor(db, source.recordKind),
      log: deps.log,
    },
  );
}

const EXIT_CODES: Record<RunResult['status'], number> = {
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
    process.stdout.write(`${USAGE}\n\nSources: ${listSourceKeys().join(', ')}\n`);
    return 0;
  }

  const shutdown = createShutdownController({ log });
  try {
    const result = await runCommand(cmd, { signal: shutdown.signal, log });
    const { runId, status, counts, expectedTotal, errorSummary } = result;
    log.info('pipeline run finished', {
      sourceKey: cmd.sourceKey,
      mode: cmd.mode,
      runId,
      runStatus: status,
      counts,
      expectedTotal,
      errorSummary,
    });
    process.stdout.write(
      `\n${cmd.sourceKey} ${cmd.mode}${cmd.sampleSize ? ` (sample ${cmd.sampleSize})` : ''}: ${status}\n` +
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
