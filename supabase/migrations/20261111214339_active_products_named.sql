-- P4.31 Accent-insensitive twin lookup for the OFF delta duplicate rule (D-086).
-- The delta path asks which active products of a source carry the names of its held bad-code
-- rows. Names compare through normalize_match_text (no accents, lower case, single spaces), as the
-- TS duplicateKey does; the caller still confirms each match, first brand included, with
-- duplicateKey. products_name_trgm_idx serves the = any() (pg_trgm >= 1.6).
create function public.active_products_named(source_id uuid, names text[])
returns table (external_id text, name text, brand_text text)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.external_id, p.name, p.brand_text
  from public.products p
  where p.source_id = active_products_named.source_id
    and p.status = 'active'
    and public.normalize_match_text(p.name) = any (
      array(select distinct public.normalize_match_text(n) from unnest(active_products_named.names) as u(n))
    )
  order by p.external_id;
$$;

comment on function public.active_products_named(uuid, text[]) is
  'Active products of a source whose normalize_match_text(name) equals that of one of names. Pipeline only (P4.31, D-086).';

revoke execute on function public.active_products_named(uuid, text[]) from public, anon, authenticated;
grant execute on function public.active_products_named(uuid, text[]) to service_role;
