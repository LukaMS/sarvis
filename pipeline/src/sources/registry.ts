// Source registry keyed by `sources.key` (ported from legacy provider-registry.ts). Adding a source
// means registering a factory in sources/index.ts; the driver resolves it by key with no
// per-source conditionals.
import { ConfigurationError } from '../errors.ts';
import type { Source } from './source.ts';

export type SourceFactory = () => Source;

const factories = new Map<string, SourceFactory>();

export function registerSource(key: string, factory: SourceFactory): void {
  factories.set(key, factory);
}

export function hasSource(key: string): boolean {
  return factories.has(key);
}

export function listSourceKeys(): string[] {
  return [...factories.keys()].sort();
}

/** A fresh source instance for one run. Throws ConfigurationError for an unknown key. */
export function createSource(key: string): Source {
  const factory = factories.get(key);
  if (!factory) {
    throw new ConfigurationError(
      `Unknown source: ${key}. Registered: ${listSourceKeys().join(', ') || '(none)'}`,
    );
  }
  return factory();
}

/** For tests. */
export function clearSources(): void {
  factories.clear();
}
