// The one place every source is registered (ported from legacy providers/register.ts). Call
// registerAllSources() once at start-up, before resolving a source. Adding a source = implement it,
// then add one line here.
import { FIXTURE_KEY, createFixtureSource } from './fixture/index.ts';
import { LEGACY_KEY, createLegacyImportSource } from './legacy-import/index.ts';
import { OFF_KEY, createOffSource } from './off/index.ts';
import { OP_KEY, createOpenPricesSource } from './open-prices/index.ts';
import { registerSource } from './registry.ts';
import { SC_KEY, createStatcanSource } from './statcan/index.ts';
import { WD_KEY, createWikidataSource } from './wikidata/index.ts';
import { WP_KEY, createWikipediaSource } from './wikipedia/index.ts';

let registered = false;

export function registerAllSources(): void {
  if (registered) return;
  registered = true;
  registerSource(FIXTURE_KEY, () => createFixtureSource());
  registerSource(LEGACY_KEY, () => createLegacyImportSource());
  registerSource(OFF_KEY, () => createOffSource());
  registerSource(OP_KEY, () => createOpenPricesSource());
  registerSource(SC_KEY, () => createStatcanSource());
  registerSource(WD_KEY, () => createWikidataSource());
  registerSource(WP_KEY, () => createWikipediaSource());
}

export * from './registry.ts';
export type * from './source.ts';
