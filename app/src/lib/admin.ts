// Admin access check for the web /admin route group (D-005). The server decides: admin_ping() raises
// 42501 unless private.is_admin() is true for the caller.
import { supabase } from './supabase';

/** Postgres insufficient_privilege, which admin_ping() raises for non-admins. */
const NOT_ADMIN = '42501';

/** True for admins, false for everyone else. Throws on anything else (offline, server error). */
export async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('admin_ping');
  if (error) {
    if (error.code === NOT_ADMIN) return false;
    throw error;
  }
  return data === true;
}
