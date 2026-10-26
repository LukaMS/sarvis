# Free-tier budget (P0.11)

Size estimates for the schema in [DATA_MODEL.md](DATA_MODEL.md), checked against the free-tier limits in CLAUDE.md and the PLAN risk register:
- **Supabase DB:** 500 MB. Catalog budget ≤ 350 MB, alarm at 400 MB total.
- **Supabase Storage:** 1 GB. Budget ≤ 700 MB, alarm at 800 MB.

Estimated 2026-10-26.

## 1. Result

| Budget | Limit | Estimate (target coverage, 12 months) | Status |
|---|---|---|---|
| Catalog tables (incl. indexes, plus 10% bloat) | ≤ 350 MB | **≈ 294 MB** (267 MB plus 10%) | ✅ within budget, ~56 MB headroom |
| User data (100 active users, 12 months, plus 10%) | — | ≈ 49 MB | — |
| Platform overhead (auth, storage metadata, extensions) | — | ≈ 30 MB (assumed) | — |
| **Whole database** | 500 MB, alarm 400 MB | **≈ 373 MB** | ✅ under the alarm, ~27 MB headroom |
| **Storage** | ≤ 700 MB, alarm 800 MB | **≈ 289 MB** (251 MB plus 15%) | ✅ within budget |

A first pass with no cuts came to **≈ 425 MB of catalog** (over budget). The design choices in §4 bring it to 267 MB, and they are already reflected in DATA_MODEL.md.

**Target coverage** means:
- every OFF product sold in Canada that passes the import filter;
- about 20k brands, about 5k owner and parent companies, 1,000 scored companies;
- Ontario stores seen in Open Prices or receipts;
- 100 active users scanning receipts weekly for a year.

## 2. Method
- **Heap** = rows × (data bytes + 28 B tuple header) × 1.15 (page fill and alignment).
- **Index** = rows × the summed per-row bytes of the planned indexes (btree on uuid ≈ 36 B per entry including overhead; trigram GIN ≈ 3× the text length).
- **Bloat:** +10% on top for dead tuples between autovacuum runs.
- Byte counts per row come from the column lists in DATA_MODEL.md §3, using typical values: OFF names ≈ 35 characters, GTIN `char(14)`, uuid 16 B, timestamptz 8 B, `numeric` ≈ 8 B.
- These are estimates. Phase 2 checks them against `pg_total_relation_size` after the first seed, and Phase 3 after each scale-up (PLAN: "budget check after each scale-up task").

## 3. Database estimate per table

**Catalog**

| Table | Rows | Bytes/row (heap) | Index bytes/row | MB | Basis |
|---|---:|---:|---:|---:|---|
| `products` | 95,000 | 348 | 190 | 56.1 | OFF Canada subset after the import filter (129k → ~95k), plus manual/lookup rows |
| `products: trigram GIN on normalized name` | 95,000 | — | 120 | 11.4 | expression index; no stored normalized column |
| `product_identifiers` | 15,000 | 138 | 110 | 4.0 | secondary codes only (store SKU, PLU, alternate GTINs); primary GTIN lives on products |
| `product_sources` | 10,000 | 178 | 80 | 2.8 | only products with more than one contributing source |
| `brands` | 20,000 | 228 | 200 | 9.2 | distinct OFF brand strings after resolution; incl. trigram index |
| `brand_ownership` | 22,000 | 178 | 110 | 6.9 | about 1.1 edges per brand (history) |
| `companies` | 5,000 | 478 | 150 | 3.5 | brand owners + parents |
| `company_ownership` | 10,000 | 178 | 110 | 3.1 | parent ↔ child edges with dates |
| `categories` | 2,000 | 148 | 80 | 0.5 | Sarvis taxonomy |
| `category_mappings` | 15,000 | 158 | 80 | 3.9 | OFF category tags → taxonomy |
| `banners` | 60 | 228 | 80 | 0.0 | Ontario grocery banners |
| `stores` | 3,000 | 278 | 120 | 1.3 | Ontario grocery stores (OSM, receipts) |
| `store_listings` | 25,000 | 198 | 190 | 10.4 | banner-specific names (receipt abbreviations); incl. trigram |
| `price_observations` | 20,000 | 208 | 110 | 7.0 | non-receipt sources (Open Prices, manual), all time |
| `price_points_weekly` | 30,000 | 108 | 70 | 5.8 | receipt aggregates per store × product × week, 90 days |
| `price_points_monthly` | 80,000 | 98 | 60 | 13.8 | rollup per store × product × month for 12 months, then per banner |
| `reference_prices` | 30,000 | 118 | 50 | 5.6 | StatCan 18-10-0245-01, Canada + Ontario, since 2017 |
| `price_sanity_bounds` | 5,000 | 88 | 40 | 0.7 | per category × unit basis |
| `documents` | 40,000 | 328 | 110 | 19.5 | articles + other cited pages (title, URL, no full text) |
| `document_entities` | 60,000 | 198 | 110 | 20.3 | document ↔ company/brand links with stance |
| `rubrics` | 10 | 2028 | 40 | 0.0 | rubric versions |
| `company_scores` | 20,000 | 528 | 110 | 14.3 | 1,000 scored companies × 6 rows × ~3 versions |
| `score_citations` | 60,000 | 208 | 90 | 19.8 | about 3 citations per score row |
| `certifications` | 4,000 | 178 | 90 | 1.2 | manual (D6) + legacy |
| `external_ratings` | 1,000 | 148 | 70 | 0.2 | KnowTheChain etc. (manual) |
| `company_events` | 3,000 | 428 | 80 | 1.7 | boycotts, controversies, recalls |
| `product_features, transparency_steps` | 5,000 | 228 | 70 | 1.7 | legacy product-page content |
| `stories` | 200 | 828 | 60 | 0.2 | editorial |
| `match_candidates` | 40,000 | 168 | 110 | 12.1 | pending + accepted only; rejected purged after 30 days |
| `review_queue` | 15,000 | 148 | 90 | 3.9 | open + resolved for 90 days |
| `sources` | 40 | 628 | 40 | 0.0 | one row per SOURCES.md entry in use |
| `ingestion_runs` | 3,000 | 328 | 70 | 1.3 | about 8 runs/day, kept 13 months |
| `ingestion_run_events` | 12,000 | 178 | 60 | 3.2 | ≤ 50 per run, 30 days |
| `raw_objects` | 6,000 | 248 | 80 | 2.2 | rows for files still in storage |
| `validation_failures` | 12,000 | 308 | 60 | 5.0 | ≤ 50 per run, 30 days |
| `ai_calls` | 30,000 | 168 | 70 | 7.9 | 13 months |
| `audit_log` | 20,000 | 228 | 60 | 6.4 | manual edits |
| **Subtotal** | | | | **267** | |

**User data (100 active users, 12 months)**

| Table | Rows | Bytes/row (heap) | Index bytes/row | MB | Basis |
|---|---:|---:|---:|---:|---|
| `profiles` | 1,000 | 178 | 80 | 0.3 | accounts |
| `scans` | 50,000 | 118 | 90 | 11.3 | barcode/search history, 100 active users × 1 year |
| `receipts` | 5,000 | 188 | 90 | 1.5 | 100 users × 4/month × 12 |
| `receipt_lines` | 120,000 | 138 | 100 | 31.0 | 25 lines per receipt |
| **Subtotal** | | | | **44** | |

## 4. Cuts designed in (first pass ≈ 425 MB → 267 MB)

| Cut | Saves | Where |
|---|---|---|
| OFF import filter: skip products with no name, or with neither a brand nor a category (est. 129k → 95k) | ≈ 30 MB | Phase 3 OFF import; DATA_MODEL `products` |
| Primary GTIN on `products`; `product_identifiers` only for secondary codes | ≈ 30 MB | DATA_MODEL §3.3 |
| Source URL rebuilt from `sources.url_template` instead of stored per row; normalized names as expression indexes, not columns; label codes as `smallint[]` | ≈ 15 MB | DATA_MODEL §1.2, §3.3 |
| `product_sources` only for multi-source products | ≈ 20 MB | DATA_MODEL §3.3 |
| Receipt prices as weekly aggregates (`price_points_weekly`, 90 days), not copied per line; monthly rollup per store for 12 months, then per banner | ≈ 60 MB | DATA_MODEL §3.4 |
| `bigint` ids on high-volume tables | ≈ 10 MB | DATA_MODEL §1.1 |
| Retention caps: events and validation failures ≤ 50 per run for 30 days; rejected match candidates purged after 30 days; resolved queue rows after 90 days | ≈ 45 MB | DATA_MODEL §3.1, §3.5 |

## 5. Storage estimate

| Item | Basis | MB |
|---|---|---:|
| S1 OFF filtered Canada extract | about 129k records × ~600 B raw JSON → ≈ 20 MB gz, × last 3 | 60 |
| S1 OFF filtered daily deltas | about 1–2k changed records a day → ≈ 0.2 MB gz × 30 days | 6 |
| S2 OFF API lookup responses | about 100 a day × 1.5 KB gz × 30 days | 5 |
| S5 Open Prices CAD extract | < 1k rows, × last 3 | 1 |
| S6 StatCan WDS responses | ≈ 0.5 MB gz × last 3 | 2 |
| S17 Wikidata SPARQL pages | ≈ 2 MB gz per full run × last 3 | 6 |
| S19 Wikipedia summaries | 5k pages × 0.7 KB gz, last 3 versions on change | 10 |
| S20 SEC Exhibit 21 + submissions | 100 companies × 3 filings × 60 KB gz | 18 |
| S23 GDELT responses | 1,000 companies weekly × 6 KB gz × 4 weeks | 24 |
| S24 RSS feeds | 6 feeds every 3 h, stored on change, ≈ 0.5 MB a day × 30 days | 15 |
| OpenRouter responses | scoring 4k calls a year × 5 KB gz (13 months); tagging 2k a month × 2 KB (90 days) | 35 |
| Receipt images | transient (deleted after parsing) ≈ 2 MB; opt-in 20% kept 90 days: 80 a month × 3 × 150 KB | 38 |
| Receipt parse responses | deleted with the image | 5 |
| `public-exports`: ODbL extract (D-013 D1) | OFF-derived tables as CSV.gz ≈ 8 MB, × latest 2 | 16 |
| `editorial`: story covers | 50 × 200 KB | 10 |
| **Subtotal** | | **251** |
| **With 15% margin** | | **≈ 289** |

**Not stored:** full OFF and Wikidata dumps (processed on the Actions runner; URL and sha256 only), product images (hotlinked from OFF with attribution) and brand logos (Wikimedia Commons links).

## 6. Thresholds and alarms (Phase 6 budget monitor)

| Metric | Measure | Warn | Critical / action |
|---|---|---|---|
| Whole DB | `pg_database_size(current_database())` | 400 MB | 450 MB: pause non-essential imports (GDELT, RSS) and apply the §7 levers |
| Catalog tables | sum of `pg_total_relation_size` over catalog tables | 320 MB | 350 MB: budget exceeded; apply §7 |
| Largest table growth | per-table size vs. last week | +20 MB in a week | investigate before the next scale-up |
| Storage | sum of `storage.objects.metadata->size` | 700 MB | 800 MB: run cleanup now; shorten retention |
| OpenRouter spend | sum of `ai_calls.cost_usd` this month vs. the hard cap | 80% of cap | 95%: the spend guard blocks batch jobs (`status = budget_blocked`) |
| Supabase egress | dashboard (free tier 5 GB a month) | 4 GB | stop serving the ODbL extract from Storage (move it elsewhere) |

The `catalog_quality` view (DATA_MODEL §4) exposes the DB and storage numbers for the P5 dashboard.

## 7. Levers if estimates prove low (in order)
1. **Tighten the OFF filter:** for example, only products whose brand has a resolved owner or that someone has scanned. Saves about 15–25 MB.
2. **Shorten store-level monthly price rollups** from 12 to 6 months. Saves about 7 MB.
3. **Keep fewer superseded score versions** (`company_scores` / `score_citations`): latest 2. Saves about 10 MB.
4. **Cap `document_entities`** at 30 per company, keeping the most relevant.
5. **Archive old `receipt_lines`** (over 24 months) to per-user gz files in Storage.

## 8. Growth and limits
- **Each extra 100 active users** adds about **49 MB a year** of user data, about **15 MB a year** of price aggregates, and about **40 MB** of opt-in receipt images in Storage.
- With the catalog at about 294 MB, the free DB reaches the 400 MB alarm at roughly **200–250 active users** within a year.
- Past that, the options are a paid Supabase tier (owner decision, Phase 10) or archiving user history to Storage.
- **Biggest uncertainty:** the OFF row count after filtering and the real average row width. Both get measured in Phase 3's OFF sample task before scaling up.
