-- P4.8: the StatCan "Yogurt" label, missed when taxonomy_v1 was first applied on dev. The checked-in
-- taxonomy_v1 file already holds it, so on a fresh database this upsert changes nothing.
insert into public.category_mappings as m (
  source_id, source_category_key, category_id, confidence,
  review_status, reviewed_at, decision_method,
  source_url, fetched_at, method, method_version
)
select s.id, 'Yogurt', c.id, 1.00,
  'approved', timestamptz '2026-11-11T00:00:00Z', 'auto',
  'https://github.com/LukaMS/sarvis/blob/main/docs/catalog/TAXONOMY.md', timestamptz '2026-11-11T00:00:00Z', 'derived', 'taxonomy@1.0.0'
from public.categories c
cross join (select id from public.sources where key = 'statcan-18100245') s
where c.slug = 'dairy-eggs/yogurt'
on conflict (source_id, source_category_key) do nothing;
