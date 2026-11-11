-- P4.27 (D-097): ownership chains stop at an organisation.
-- company_ultimate_parent no longer walks into a parent that is a person (kind individual, which
-- includes families) or a nonprofit (a foundation or charitable trust holding the shares). The edges
-- stay in company_ownership; only the walk changes. product_ownership_chain reads this view, so it
-- follows without a change. A person is no company's top parent, so individuals get no row.
-- Then the families and the trust that Wikidata typed as companies get the right kind, locked, with
-- one audit_log row each (method manual, the citation in changes).

create or replace view public.company_ultimate_parent
with (security_invoker = true)
as
with recursive walk (company_id, current_id, depth, path) as (
  select c.id, c.id, 0, array[c.id]
  from public.companies c
  where c.kind <> 'individual'
  union all
  select w.company_id, e.parent_company_id, w.depth + 1, w.path || e.parent_company_id
  from walk w
  join public.company_ownership e on e.child_company_id = w.current_id
  join public.companies p on p.id = e.parent_company_id
  where e.relation in ('subsidiary', 'majority_stake', 'division')
    and e.valid_to is null
    and e.review_status = 'approved'
    and p.kind not in ('individual', 'nonprofit')
    and e.parent_company_id <> all (w.path)
    and w.depth < 20
),
top as (
  select distinct on (company_id) company_id, current_id, depth, path
  from walk
  order by company_id, depth desc
)
select
  t.company_id,
  t.current_id as ultimate_parent_id,
  p.slug as ultimate_parent_slug,
  p.name as ultimate_parent_name,
  t.depth,
  t.path
from top t
join public.companies p on p.id = t.current_id;

comment on view public.company_ultimate_parent is
  'Each organisation with its top corporate parent: approved, current subsidiary/majority_stake/division edges, '
  'not walked into a person (individual, incl. families) or a nonprofit (D-097). Depth and path from the company up.';

-- kind corrections (manual, cited, locked) ----------------------------------

with fix (slug, kind, citation, reason) as (
  values
    ('sobey-family', 'individual', 'https://www.wikidata.org/wiki/Q136372996',
     'Wikidata: instance of family (Q8436). A family is stored as individual (D-097).'),
    ('cargill-family', 'individual', 'https://www.wikidata.org/wiki/Q5039257',
     'Wikidata: instance of family (Q8436). A family is stored as individual (D-097).'),
    ('famille-rossy', 'individual', 'https://www.wikidata.org/wiki/Q120917803',
     'Wikidata: instance of family (Q8436). A family is stored as individual (D-097).'),
    ('famille-gervoson', 'individual', 'https://www.wikidata.org/wiki/Q137205026',
     'Wikidata: instance of family (Q8436). A family is stored as individual (D-097).'),
    ('reimann-family', 'individual', 'https://www.wikidata.org/wiki/Q2140188',
     'Wikidata: instance of family (Q8436). A family is stored as individual (D-097).'),
    ('hershey-trust-company', 'nonprofit', 'https://en.wikipedia.org/wiki/Hershey_Trust_Company',
     'Wikipedia: owned by the Milton Hershey School Trust, whose trustee it is; it manages charitable '
     'trusts endowed by Milton S. Hershey and holds their controlling stake in The Hershey Company (D-097).')
),
changed as (
  update public.companies c
  set kind = f.kind,
      locked_fields = case when 'kind' = any (c.locked_fields) then c.locked_fields
                           else c.locked_fields || array['kind'] end
  from fix f
  where c.slug = f.slug
    and (c.kind is distinct from f.kind or not ('kind' = any (c.locked_fields)))
  returning c.id, c.slug, f.kind as new_kind, f.citation, f.reason
)
insert into public.audit_log (actor_id, table_name, row_id, action, changes, note)
select
  null,
  'companies',
  ch.id::text,
  'update',
  jsonb_build_object(
    'kind', jsonb_build_array(o.kind, ch.new_kind),
    'locked_fields', jsonb_build_array('kind'),
    'source', 'manual',
    'method', 'manual',
    'method_version', 'manual@p4.27',
    'source_url', ch.citation
  ),
  'P4.27 kind correction: ' || ch.reason
from changed ch
-- The outer query sees companies as they were before the update, so o.kind is the old kind.
join public.companies o on o.id = ch.id;
