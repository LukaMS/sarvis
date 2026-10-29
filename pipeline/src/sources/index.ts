// The one place every source is registered (ported from legacy providers/register.ts). Call
// registerAllSources() once at start-up, before resolving a source. Adding a source = implement it,
// then add one line here. The real sources arrive in Phase 3.
import { FIXTURE_KEY, createFixtureSource } from './fixture/index.ts';
import { registerSource } from './registry.ts';

let registered = false;

export function registerAllSources(): void {
  if (registered) return;
  registered = true;
  registerSource(FIXTURE_KEY, () => createFixtureSource());
}

export * from './registry.ts';
export type * from './source.ts';
