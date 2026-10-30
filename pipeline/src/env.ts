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
  // Optional: only sources whose terms ask for a contact email need it (D-015). The driver refuses
  // those sources when it's unset.
  PIPELINE_CONTACT_EMAIL: z.preprocess(
    emptyToUndefined,
    z.email({ error: 'not a valid email address' }).optional(),
  ),
});

export interface PipelineEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  /** Sent in the User-Agent for sources with `contact: 'email'`. Never logged or stored. */
  contactEmail: string | null;
}

/**
 * Parses and validates `source`. Throws a ConfigurationError that lists every problem by variable
 * name; values are never included, so the message is safe to log.
 */
export function parseEnv(source: Record<string, string | undefined>): PipelineEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) throw envError(parsed.error);
  return {
    supabaseUrl: parsed.data.EXPO_PUBLIC_SUPABASE_URL,
    serviceRoleKey: parsed.data.SUPABASE_DEV_SERVICE_ROLE_KEY,
    contactEmail: parsed.data.PIPELINE_CONTACT_EMAIL ?? null,
  };
}

/**
 * Just `PIPELINE_CONTACT_EMAIL`, validated, or null when unset, for callers that don't need the
 * database variables. A value that isn't an email throws a ConfigurationError naming the variable,
 * never the value.
 */
export function parseContactEmail(source: Record<string, string | undefined>): string | null {
  const parsed = EnvSchema.pick({ PIPELINE_CONTACT_EMAIL: true }).safeParse(source);
  if (!parsed.success) throw envError(parsed.error);
  return parsed.data.PIPELINE_CONTACT_EMAIL ?? null;
}

function envError(error: z.ZodError): ConfigurationError {
  const issues = error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  return new ConfigurationError(`Invalid pipeline environment. Fix your .env:\n${issues}`);
}

let cached: PipelineEnv | undefined;

/** The process environment, parsed once. */
export function loadEnv(): PipelineEnv {
  cached ??= parseEnv(process.env);
  return cached;
}
