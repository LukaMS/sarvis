// Pipeline configuration, validated once at startup so a bad .env fails loudly instead of running
// with wrong settings (adapted from legacy env.ts). Node loads the repo-root .env with
// --env-file-if-exists, so there is no dotenv dependency.
//
// For now the pipeline writes only to the dev project and refuses any other URL (CLAUDE.md: no tool
// gets write access to production). Phase 6 adds the production key as an Actions secret.
import { z } from 'zod';

import { ConfigurationError } from './errors.ts';

/** The dev project's ref, as in scripts/dev-create-test-user.ts. */
export const DEV_PROJECT_REF = 'smqovgawfjmxernqlxjd';

/** Empty env values (common after copying .env.example) behave like unset. */
export const emptyToUndefined = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const required = (name: string) => `${name} is not set. Add it to the repo-root .env.`;

const tryUrl = (v: string): URL | undefined => (URL.canParse(v) ? new URL(v) : undefined);

const EnvSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.preprocess(
    emptyToUndefined,
    z
      .url({
        error: (i) =>
          i.input === undefined ? required('EXPO_PUBLIC_SUPABASE_URL') : 'not a valid URL',
      })
      .refine((v) => tryUrl(v)?.pathname === '/', {
        error: 'must be the bare project URL (https://<ref>.supabase.co), with no path',
      })
      .refine((v) => tryUrl(v)?.hostname === `${DEV_PROJECT_REF}.supabase.co`, {
        error: `must be the dev project (${DEV_PROJECT_REF}); the pipeline refuses any other`,
      }),
  ),
  SUPABASE_DEV_SERVICE_ROLE_KEY: z.preprocess(
    emptyToUndefined,
    z
      .string({ error: required('SUPABASE_DEV_SERVICE_ROLE_KEY') })
      .trim()
      .min(20, 'looks too short to be a service-role key'),
  ),
});

export interface PipelineEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
}

/**
 * Parses and validates `source`. Throws a ConfigurationError that lists every problem by variable
 * name; values are never included, so the message is safe to log.
 */
export function parseEnv(source: Record<string, string | undefined>): PipelineEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new ConfigurationError(`Invalid pipeline environment. Fix your .env:\n${issues}`);
  }
  return {
    supabaseUrl: parsed.data.EXPO_PUBLIC_SUPABASE_URL,
    serviceRoleKey: parsed.data.SUPABASE_DEV_SERVICE_ROLE_KEY,
  };
}

let cached: PipelineEnv | undefined;

/** The process environment, parsed once. */
export function loadEnv(): PipelineEnv {
  cached ??= parseEnv(process.env);
  return cached;
}
