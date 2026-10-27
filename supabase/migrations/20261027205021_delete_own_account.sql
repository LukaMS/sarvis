-- P1.11 Self-serve account deletion (SPEC F8). The legacy RPC was written but never applied.
--
-- App stores require in-app deletion for any app with accounts. A client can't touch auth.users, so the
-- work runs in a security-definer function in `private` (not exposed by the Data API), and a
-- security-invoker wrapper in `public` makes it callable as `rpc('delete_own_account')`. The definer
-- acts only on auth.uid(). Deleting the auth.users row cascades to profiles and every user table
-- that references auth.users with `on delete cascade` (all of them, by convention).

create function private.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke execute on function private.delete_own_account() from public, anon;
grant execute on function private.delete_own_account() to authenticated;

create function public.delete_own_account()
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.delete_own_account();
$$;

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

comment on function public.delete_own_account() is
  'Deletes the calling user (auth.users row, cascading to their data). Settings → Delete my account.';
