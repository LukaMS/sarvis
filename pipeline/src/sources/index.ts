// The one place every source is registered (ported from legacy providers/register.ts). Call
// registerAllSources() once at start-up, before resolving a source. Adding a source = implement it,
// then add one line here.
import { FIXTURE_KEY, createFixtureSource } from './fixture/index.ts';
import { LEGACY_KEY, createLegacyImportSource } from './legacy-import/index.ts';
import { OFF_KEY, createOffSource } from './off/index.ts';
import { registerSource } from './registry.ts';

let registered = false;

export function registerAllSources(): void {
  if (registered) return;
  registered = true;
  registerSource(FIXTURE_KEY, () => createFixtureSource());
  registerSource(LEGACY_KEY, () => createLegacyImportSource());
  registerSource(OFF_KEY, () => createOffSource());
}

export * from './registry.ts';
export type * from './source.ts';
