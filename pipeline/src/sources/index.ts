// The one place every source is registered (ported from legacy providers/register.ts). Call
// registerAllSources() once at start-up, before resolving a source. Adding a source = implement it,
// then add one line here. The fixture source arrives in P2.17, the real ones in Phase 3.
let registered = false;

export function registerAllSources(): void {
  if (registered) return;
  registered = true;
}

export * from './registry.ts';
export type * from './source.ts';
