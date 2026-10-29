import { describe, expect, it } from 'vitest';

import { DEV_PROJECT_REF, emptyToUndefined, parseEnv } from './env.ts';
import { ConfigurationError } from './errors.ts';

const DEV_URL = `https://${DEV_PROJECT_REF}.supabase.co`;
const KEY = 'test-service-role-key-0123456789';

describe('parseEnv', () => {
  it('accepts the dev URL and a key', () => {
    expect(
      parseEnv({ EXPO_PUBLIC_SUPABASE_URL: DEV_URL, SUPABASE_DEV_SERVICE_ROLE_KEY: KEY }),
    ).toEqual({ supabaseUrl: DEV_URL, serviceRoleKey: KEY });
  });

  it('treats empty values as unset and names every missing variable', () => {
    let error: unknown;
    try {
      parseEnv({ EXPO_PUBLIC_SUPABASE_URL: '  ', SUPABASE_DEV_SERVICE_ROLE_KEY: '' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigurationError);
    const message = (error as Error).message;
    expect(message).toContain('EXPO_PUBLIC_SUPABASE_URL: EXPO_PUBLIC_SUPABASE_URL is not set');
    expect(message).toContain(
      'SUPABASE_DEV_SERVICE_ROLE_KEY: SUPABASE_DEV_SERVICE_ROLE_KEY is not set',
    );
  });

  it('refuses any project but dev, and URLs with a path', () => {
    const run = (url: string) => () =>
      parseEnv({ EXPO_PUBLIC_SUPABASE_URL: url, SUPABASE_DEV_SERVICE_ROLE_KEY: KEY });
    expect(run('https://otherproject.supabase.co')).toThrow(/must be the dev project/);
    expect(run(`${DEV_URL}/rest/v1`)).toThrow(/bare project URL/);
    expect(run('not a url')).toThrow(/not a valid URL/);
  });

  it('never puts a value in the error message', () => {
    const secret = 'short-secret';
    expect(() =>
      parseEnv({ EXPO_PUBLIC_SUPABASE_URL: DEV_URL, SUPABASE_DEV_SERVICE_ROLE_KEY: secret }),
    ).toThrow(/SUPABASE_DEV_SERVICE_ROLE_KEY: looks too short/);
    try {
      parseEnv({ EXPO_PUBLIC_SUPABASE_URL: DEV_URL, SUPABASE_DEV_SERVICE_ROLE_KEY: secret });
    } catch (e) {
      expect((e as Error).message).not.toContain(secret);
    }
  });
});

describe('emptyToUndefined', () => {
  it('maps blank strings to undefined and leaves the rest', () => {
    expect(emptyToUndefined(' ')).toBeUndefined();
    expect(emptyToUndefined('x')).toBe('x');
    expect(emptyToUndefined(3)).toBe(3);
  });
});
