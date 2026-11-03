-- P3.10a: Open Prices price observations rebuild source_url from the source's url_template
-- (DATA_MODEL §1.2, D-032) instead of storing it per row. The template was checked on 2026-11-03:
-- https://prices.openfoodfacts.org/prices/{id} answers 200 for stored price ids, and
-- external_id is the Open Prices price id (open-prices@1.0.1 writes source_url null).

update public.sources
set url_template = 'https://prices.openfoodfacts.org/prices/{external_id}'
where key = 'open-prices';

-- Clear stored URLs only where the template rebuilds exactly the same one, so
-- price_observations_with_source_url.resolved_source_url is unchanged for every row.
update public.price_observations o
set source_url = null
from public.sources s
where s.id = o.source_id
  and s.key = 'open-prices'
  and o.external_id is not null
  and o.source_url = replace(s.url_template, '{external_id}', o.external_id);
