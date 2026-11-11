-- P4.9 Categories from OFF tags (D-093). The categorize-tags job sets products.category_id and
-- category_rule for up to a few hundred products per call. One PostgREST update per product would
-- be ~37,000 requests on the first run, so the job sends a batch of (id, category, rule) triples.
--
-- Only the two category columns change. A row is left alone when:
--   - its locked_fields hold category_id or category_rule (an admin decision);
--   - its rule is 90 or above (manual): tags never override a person;
--   - it already holds the same category and rule (so a re-run updates 0 rows).
-- A null category clears the rule too (the products_category_rule_needs_category check).
-- Returns the ids it changed.
create function public.set_product_categories(
  ids uuid[],
  category_ids uuid[],
  rules smallint[]
)
returns setof uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.products p
  set category_id = c.category_id,
      category_rule = case when c.category_id is null then null else c.rule end
  from unnest(set_product_categories.ids, set_product_categories.category_ids, set_product_categories.rules)
    as c(id, category_id, rule)
  where p.id = c.id
    and not (p.locked_fields && array['category_id', 'category_rule'])
    and coalesce(p.category_rule, 0) < 90
    and (p.category_id is distinct from c.category_id
      or p.category_rule is distinct from (case when c.category_id is null then null else c.rule end))
  returning p.id;
$$;

comment on function public.set_product_categories(uuid[], uuid[], smallint[]) is
  'Sets products.category_id and category_rule in one batch, skipping locked and manual (rule >= 90) rows and rows already equal. Pipeline only (P4.9, D-093).';

revoke execute on function public.set_product_categories(uuid[], uuid[], smallint[]) from public, anon, authenticated;
grant execute on function public.set_product_categories(uuid[], uuid[], smallint[]) to service_role;
