// SIGINT/SIGTERM → AbortSignal (ported from legacy worker/shutdown.ts). Actions sends SIGTERM when a
// run is cancelled, so the run stops after its current safe unit of work instead of mid-write.
import { createLogger, type Logger } from './log.ts';

export interface ShutdownController {
  readonly signal: AbortSignal;
  isShuttingDown(): boolean;
  dispose(): void;
}

export interface ShutdownOptions {
  log?: Logger;
  /** Called on a second signal. Defaults to process.exit. */
  exit?: (code: number) => void;
}

export function createShutdownController(options: ShutdownOptions = {}): ShutdownController {
  const log = options.log ?? createLogger();
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const controller = new AbortController();
  let shuttingDown = false;

  const onSignal = (sig: NodeJS.Signals) => {
    if (shuttingDown) {
      log.warn('Second signal received; forcing exit.', { errorType: 'cancelled' });
      exit(1);
      return;
    }
    shuttingDown = true;
    log.info(`Received ${sig}; shutting down gracefully.`);
    controller.abort();
  };

  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  return {
    signal: controller.signal,
    isShuttingDown: () => shuttingDown,
    dispose: () => {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    },
  };
}
