// Service-role Supabase client for the pipeline (ported from legacy supabase.ts). The key bypasses
// RLS, so it lives only in this Node process: never in the app bundle, never in a log line.
import type { Database } from '@sarvis/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { loadEnv, type PipelineEnv } from '../env.ts';

export type ServiceClient = SupabaseClient<Database>;

export function createServiceClient(env: PipelineEnv = loadEnv()): ServiceClient {
  return createClient<Database>(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let cached: ServiceClient | undefined;

/** One shared client per process. */
export function getServiceClient(): ServiceClient {
  cached ??= createServiceClient();
  return cached;
}
