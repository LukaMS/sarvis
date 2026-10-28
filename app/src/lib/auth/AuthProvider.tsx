// Session state for the whole app. The root layout guards routes with it (the AuthGate, SPEC F1).
// It also completes auth email links (D-028): a password-reset link signs the user in with `recovering`
// set, and the root layout then shows only /reset-password until a new password is saved.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import { Platform } from 'react-native';

import { toUserMessage } from '../errors';
import { supabase } from '../supabase';
import { parseAuthRedirect } from './redirect';
import { completeAuthRedirect } from './service';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** True until the stored session and any incoming auth link have been read. Don't guard before. */
  isLoading: boolean;
  /** Signed in from a password-reset link and no new password saved yet. */
  recovering: boolean;
  /** Call once the new password is saved, or the user gives up (sign out). */
  finishRecovery: () => void;
  /** User-facing copy for an auth link that failed (used or expired). /auth shows it. */
  linkError: string | null;
  clearLinkError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Remembers which user is mid-reset, so a reload (web) or restart (native) still shows /reset-password.
 * AsyncStorage is localStorage on web.
 */
const RECOVERING_KEY = 'sarvis.auth.recoveringUserId';

async function rememberRecovering(userId: string | null) {
  try {
    if (userId) await AsyncStorage.setItem(RECOVERING_KEY, userId);
    else await AsyncStorage.removeItem(RECOVERING_KEY);
  } catch {
    // Worst case a reload lands in the app signed in, as legacy did.
  }
}

async function recoveringUserId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(RECOVERING_KEY);
  } catch {
    return null;
  }
}

/** The URL the app was opened with. On web it's the page URL; native gets it from the OS. */
async function initialUrl(): Promise<string | null> {
  if (Platform.OS === 'web') return typeof window === 'undefined' ? null : window.location.href;
  return Linking.getInitialURL();
}

/** Tokens shouldn't stay in the address bar or the browser history. */
function stripAuthParamsFromAddressBar() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (!parseAuthRedirect(window.location.href)) return;
  window.history.replaceState(window.history.state, '', window.location.pathname);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function handleUrl(url: string | null) {
      try {
        const type = await completeAuthRedirect(url);
        if (type === 'recovery') {
          const { data } = await supabase.auth.getSession();
          await rememberRecovering(data.session?.user.id ?? null);
          if (mounted) setRecovering(true);
        } else if (type) {
          // Any other link signs in normally, ending an earlier reset.
          await rememberRecovering(null);
          if (mounted) setRecovering(false);
        }
      } catch (e) {
        if (mounted) setLinkError(toUserMessage(e));
      } finally {
        stripAuthParamsFromAddressBar();
      }
    }

    // The link is handled before isLoading clears, so the first guard already knows about recovery.
    initialUrl()
      .then(handleUrl)
      .then(() => Promise.all([supabase.auth.getSession(), recoveringUserId()]))
      .then(([{ data }, resettingUser]) => {
        if (!mounted) return;
        setSession(data.session);
        if (data.session && data.session.user.id === resettingUser) setRecovering(true);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT') {
        setRecovering(false);
        void rememberRecovering(null);
      }
    });
    // Native: a link tapped while the app is already open. Web always loads the page afresh.
    const linkSub =
      Platform.OS === 'web' ? null : Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
      linkSub?.remove();
    };
  }, []);

  const finishRecovery = useCallback(() => {
    setRecovering(false);
    void rememberRecovering(null);
  }, []);
  const clearLinkError = useCallback(() => setLinkError(null), []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        isLoading,
        recovering: recovering && !!session,
        finishRecovery,
        linkError,
        clearLinkError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
