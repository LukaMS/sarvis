import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger } from './log.ts';
import { createShutdownController, type ShutdownController } from './shutdown.ts';

const quiet = createLogger({}, () => {});
let controller: ShutdownController | undefined;

afterEach(() => {
  controller?.dispose();
  controller = undefined;
});

describe('createShutdownController', () => {
  it('aborts the signal on SIGTERM', () => {
    controller = createShutdownController({ log: quiet, exit: vi.fn() });
    expect(controller.signal.aborted).toBe(false);
    process.emit('SIGTERM');
    expect(controller.signal.aborted).toBe(true);
    expect(controller.isShuttingDown()).toBe(true);
  });

  it('forces an exit on a second signal', () => {
    const exit = vi.fn();
    controller = createShutdownController({ log: quiet, exit });
    process.emit('SIGINT');
    expect(exit).not.toHaveBeenCalled();
    process.emit('SIGINT');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('removes its listeners on dispose', () => {
    const before = process.listenerCount('SIGTERM');
    controller = createShutdownController({ log: quiet, exit: vi.fn() });
    expect(process.listenerCount('SIGTERM')).toBe(before + 1);
    controller.dispose();
    expect(process.listenerCount('SIGTERM')).toBe(before);
  });
});
