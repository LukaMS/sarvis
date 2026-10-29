// Ported from legacy provider-registry.test.ts.
import { afterEach, describe, expect, it } from 'vitest';

import { ConfigurationError } from '../errors.ts';
import {
  clearSources,
  createSource,
  hasSource,
  listSourceKeys,
  registerSource,
} from './registry.ts';
import type { Source } from './source.ts';

function fakeSource(key: string): Source {
  return {
    key,
    job: `${key}-import`,
    version: '0.0.0',
    recordKind: 'product',
    capabilities: {
      supportsDelta: false,
      supportsDeactivation: false,
      storeSpecificPricing: false,
    },
    plan: () => [],
    fetch: () => Promise.reject(new Error('not implemented')),
    parse: () => ({ records: [] }),
  };
}

afterEach(() => clearSources());

describe('source registry', () => {
  it('registers and resolves sources by key', () => {
    registerSource('acme-x', () => fakeSource('acme-x'));
    expect(hasSource('acme-x')).toBe(true);
    expect(createSource('acme-x').key).toBe('acme-x');
  });

  it('creates a fresh instance per call', () => {
    registerSource('acme-x', () => fakeSource('acme-x'));
    expect(createSource('acme-x')).not.toBe(createSource('acme-x'));
  });

  it('lists registered keys sorted', () => {
    registerSource('b-x', () => fakeSource('b-x'));
    registerSource('a-x', () => fakeSource('a-x'));
    expect(listSourceKeys()).toEqual(['a-x', 'b-x']);
  });

  it('throws a helpful ConfigurationError for unknown sources', () => {
    expect(() => createSource('nope')).toThrow(/Unknown source: nope/);
    expect(() => createSource('nope')).toThrow(ConfigurationError);
  });
});
