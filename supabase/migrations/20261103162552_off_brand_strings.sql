-- P3.12: the distinct OFF brand strings, most frequent first, for the Wikidata source's plan().
-- products.brand_text is OFF's comma-separated `brands` field (D-048). Strings are grouped
-- case-insensitively after trimming; `brand` is the most common spelling in the group.
-- Pipeline only: callable by the service role, not by anon or signed-in users.

create function public.off_brand_strings()
returns table (brand text, products bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with parts as (
    select btrim(part) as brand
    from public.products p
    cross join lateral unnest(string_to_array(p.brand_text, ',')) as part
    where p.source_id = (select s.id from public.sources s where s.key = 'off')
      and p.brand_text is not null
  )
  select mode() within group (order by parts.brand) as brand, count(*) as products
  from parts
  where parts.brand <> ''
  group by lower(parts.brand)
  order by count(*) desc, lower(parts.brand);
$$;

comment on function public.off_brand_strings() is
  'Distinct OFF brand strings (split on commas, trimmed, case-insensitive) with their product counts, most frequent first. Pipeline only.';

revoke execute on function public.off_brand_strings() from public, anon, authenticated;
grant execute on function public.off_brand_strings() to service_role;
