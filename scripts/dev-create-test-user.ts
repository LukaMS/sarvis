// Creates (or resets) a confirmed email/password user on the DEV Supabase project, for e2e tests and
// manual checks (D-015 option a). Uses SUPABASE_DEV_SERVICE_ROLE_KEY, so it is Node-only, never bundled,
// and refuses any project but dev.
//
//   npm run dev:test-user -- --email you+test@example.com --password '<8+ chars>' [--name 'Test User']
//
// Idempotent: an existing user with that email gets the new password, is marked confirmed, and keeps
// its id (and so its profiles row).
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/** The dev project's ref. The legacy project, or anything else, is refused. */
export const DEV_PROJECT_REF = 'smqovgawfjmxernqlxjd';

export interface TestUserOptions {
  email: string;
  password: string;
  displayName?: string;
}

/** Reads the dev URL and key from the environment, and checks the URL is the dev project. */
export function devAdminEnv(env: NodeJS.ProcessEnv = process.env): { url: string; key: string } {
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_DEV_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_URL and SUPABASE_DEV_SERVICE_ROLE_KEY must be set in the repo-root .env.',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is not a valid URL.');
  }
  if (parsed.pathname !== '/') {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_URL must be the bare project URL (https://<ref>.supabase.co), with no path like /rest/v1.',
    );
  }
  const host = parsed.hostname;
  if (host !== `${DEV_PROJECT_REF}.supabase.co`) {
    throw new Error(`Refusing to run: ${host} is not the dev project (${DEV_PROJECT_REF}).`);
  }
  return { url, key };
}

/** Creates the user, or resets an existing one. Returns the user's id. */
export async function ensureTestUser({
  email,
  password,
  displayName,
}: TestUserOptions): Promise<string> {
  if (password.length < 8) throw new Error('The password needs at least 8 characters.');
  const { url, key } = devAdminEnv();
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).auth.admin;

  const normalized = email.trim().toLowerCase();
  const metadata = { display_name: displayName ?? normalized.split('@')[0] };

  const existing = await findUserByEmail(admin, normalized);
  if (existing) {
    const { error } = await admin.updateUserById(existing, {
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw error;
    return existing;
  }

  const { data, error } = await admin.createUser({
    email: normalized,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw error;
  return data.user.id;
}

type Admin = ReturnType<typeof createClient>['auth']['admin'];

async function findUserByEmail(admin: Admin, email: string): Promise<string | null> {
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < perPage) return null;
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      password: { type: 'string' },
      name: { type: 'string' },
    },
  });
  if (!values.email || !values.password) {
    console.error(
      'Usage: npm run dev:test-user -- --email <email> --password <password> [--name <name>]',
    );
    process.exit(1);
  }
  const id = await ensureTestUser({
    email: values.email,
    password: values.password,
    displayName: values.name,
  });
  // The id and email only; never the password or key.
  console.log(`Test user ready on the dev project: ${values.email.trim().toLowerCase()} (${id})`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
