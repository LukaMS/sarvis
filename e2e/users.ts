// Test users on the dev project. global-setup.ts creates them; passwords are random per run. Users
// without a role field are reset to 'user', so a stray role change can't leak into other specs.

/** Signed in by global setup; its saved session is the default for every spec except auth.spec. */
export const SHELL_USER = {
  email: 'e2e-shell@example.com',
  displayName: 'E2E Shell',
  passwordEnv: 'E2E_SHELL_PASSWORD',
} as const;

/** Used by auth.spec, which signs in and out (sign-out would revoke the shell user's session). */
export const AUTH_USER = {
  email: 'e2e-auth@example.com',
  displayName: 'E2E Auth',
  passwordEnv: 'E2E_AUTH_PASSWORD',
} as const;

/** profiles.role = 'admin'. admin-gate.spec signs in as it to reach /admin. */
export const ADMIN_USER = {
  email: 'e2e-admin@example.com',
  displayName: 'E2E Admin',
  passwordEnv: 'E2E_ADMIN_PASSWORD',
  role: 'admin',
} as const;

export const STORAGE_STATE = 'e2e/.auth/shell-user.json';

export function passwordFor(user: { passwordEnv: string }): string {
  const password = process.env[user.passwordEnv];
  if (!password) throw new Error(`${user.passwordEnv} is not set; global setup didn't run.`);
  return password;
}

/** Reset by auth.spec's password-reset tests, which change its password through a recovery link. */
export const RESET_USER = {
  email: 'e2e-reset@example.com',
  displayName: 'E2E Reset',
} as const;

/** Created fresh by account-deletion.spec, then deleted through the UI. */
export const DELETE_USER = {
  email: 'e2e-delete@example.com',
  displayName: 'E2E Delete',
} as const;
