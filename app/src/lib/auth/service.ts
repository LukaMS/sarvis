// Email/password auth calls (SPEC F1). Errors are thrown raw; screens map them with toUserMessage.
import * as Linking from 'expo-linking';

import { supabase } from '../supabase';
import { parseAuthRedirect } from './redirect';

export const PASSWORD_MIN_LENGTH = 8;

/** Where links in auth emails return to: `sarvis://` in builds, the dev URL in Expo Go and on web. */
function redirectUrl(): string {
  return Linking.createURL('/');
}

/** Catches obvious typos before a round trip. The server stays the authority. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export interface SignUpResult {
  /** Supabase created the user but withheld a session until the email is confirmed. */
  needsEmailConfirmation: boolean;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      // The profiles trigger copies display_name into public.profiles.
      data: { display_name: displayName?.trim() || email.trim().split('@')[0] },
      emailRedirectTo: redirectUrl(),
    },
  });
  if (error) throw error;
  return { needsEmailConfirmation: !data.session && !!data.user };
}

export async function resendConfirmationEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: redirectUrl() },
  });
  if (error) throw error;
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

export async function resetPassword(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: redirectUrl(),
  });
  if (error) throw error;
}

/**
 * Signs in from an auth email link (D-028). Returns the link's type ('recovery', 'signup', …), or null
 * when `url` isn't an auth link. Throws when Supabase refused the link (used or expired).
 */
export async function completeAuthRedirect(url: string | null | undefined): Promise<string | null> {
  const redirect = parseAuthRedirect(url);
  if (!redirect) return null;
  if (redirect.errorDescription) throw new Error(redirect.errorDescription);
  const { error } = await supabase.auth.setSession({
    access_token: redirect.accessToken ?? '',
    refresh_token: redirect.refreshToken ?? '',
  });
  if (error) throw error;
  return redirect.type ?? 'unknown';
}

/** Sets the signed-in user's password. The recovery link's session is enough; no old password. */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Deletes the signed-in user's account and everything that cascades from it (SPEC F8), then clears the
 * local session. The server already revoked the refresh token, so a server-side sign-out would fail.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_own_account');
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
}
