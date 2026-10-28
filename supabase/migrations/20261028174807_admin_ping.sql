-- P1.12 Server-side admin check for the web /admin route group (D-005).
--
-- The admin layout calls `rpc('admin_ping')` before it renders anything. It returns true for admins
-- and raises 42501 (PostgREST: 403) for everyone else, so the server, not the client, decides who is
-- an admin. Real admin data arrives in Phase 5, guarded by RLS policies that use private.is_admin().
-- Security invoker is enough: private.is_admin() is already executable by authenticated.

create function public.admin_ping()
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  return true;
end;
$$;

revoke execute on function public.admin_ping() from public, anon;
grant execute on function public.admin_ping() to authenticated;

comment on function public.admin_ping() is
  'Returns true for admins and raises 42501 for everyone else. The /admin layout gate (P1.12).';
