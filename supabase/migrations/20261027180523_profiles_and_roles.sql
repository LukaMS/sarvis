-- P1.5 Base schema: profiles, roles, is_admin(), RLS (DATA_MODEL §3.9, D-005).
-- Security-definer helpers live in `private`, which PostgREST does not expose.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Profiles ------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  role text not null default 'user' check (role in ('user', 'admin')),
  share_prices_consent boolean not null default false,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_consent_has_time check (not share_prices_consent or consent_at is not null)
);

comment on table public.profiles is 'One row per auth user. role drives private.is_admin().';
comment on column public.profiles.role is 'user | admin. Clients cannot update it (column privileges).';
comment on column public.profiles.share_prices_consent is 'Consent to share receipt prices as weekly aggregates (D-013 D7).';

alter table public.profiles enable row level security;

-- Clients may read their row and change only these columns; role, id and timestamps stay server-side.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, share_prices_consent, consent_at) on table public.profiles to authenticated;

-- Helpers -------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 80));
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- Policies ------------------------------------------------------------------

create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));
