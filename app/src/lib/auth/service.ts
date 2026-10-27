// Email/password auth calls (SPEC F1). Errors are thrown raw; screens map them with toUserMessage.
import * as Linking from 'expo-linking';

import { supabase } from '../supabase';

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

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
