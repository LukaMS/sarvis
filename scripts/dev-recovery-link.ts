// Prints a password-reset link for a user on the DEV Supabase project, without sending an email (P1.15).
// Opening it does what the link in Supabase's reset email does. Uses SUPABASE_DEV_SERVICE_ROLE_KEY, so
// it is Node-only, never bundled, and refuses any project but dev.
//
//   npm run dev:recovery-link -- --email you+test@example.com [--redirect exp://127.0.0.1:8081/--/]
//
// --redirect defaults to the web dev server. It must be in the dev project's allowed redirect URLs, or
// Supabase falls back to the Site URL. The link signs its holder in once, within an hour: treat it like
// a password and only use it for dev test users.
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { devAdminEnv } from './dev-create-test-user.ts';

export const DEFAULT_REDIRECT = 'http://localhost:8081/';

export async function generateRecoveryLink(
  email: string,
  redirectTo: string = DEFAULT_REDIRECT,
): Promise<string> {
  const { url, key } = devAdminEnv();
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.admin.generateLink({
    type: 'recovery',
    email: email.trim().toLowerCase(),
    options: { redirectTo },
  });
  if (error) throw error;
  return data.properties.action_link;
}

async function main() {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, redirect: { type: 'string' } },
  });
  if (!values.email) {
    console.error('Usage: npm run dev:recovery-link -- --email <email> [--redirect <url>]');
    process.exit(1);
  }
  console.log(await generateRecoveryLink(values.email, values.redirect));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
