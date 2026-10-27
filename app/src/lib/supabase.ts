// The app's one Supabase client. Uses the publishable (anon) key only; the service-role key never
// reaches the app (CLAUDE.md › Supabase, D-015).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from '@sarvis/core';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set in the repo-root .env (see .env.example).',
  );
}

// supabase-js appends /auth/v1, /rest/v1 etc. itself; a pasted API URL with a path breaks every call.
if (/supabase\.co\/.+/.test(url)) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL must be the bare project URL (https://<ref>.supabase.co), with no path like /rest/v1.',
  );
}

const isWeb = Platform.OS === 'web';

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    // Web: supabase-js defaults to localStorage. Native: AsyncStorage (no size cap, unlike SecureStore).
    storage: isWeb ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Only the web build receives auth redirects as URLs.
    detectSessionInUrl: isWeb,
  },
});

// Native timers pause in the background, so refresh only while the app is in the foreground.
if (!isWeb) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
