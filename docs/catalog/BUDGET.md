# Free-tier budget (P0.11)

Size estimates for the schema in [DATA_MODEL.md](DATA_MODEL.md), checked against the free-tier limits in CLAUDE.md and the PLAN risk register:
- **Supabase DB:** 500 MB. Catalog budget ≤ 350 MB, alarm at 400 MB total.
- **Supabase Storage:** 1 GB. Budget ≤ 700 MB, alarm at 800 MB.

Estimated 2026-10-26.

## 1. Result

| Budget | Limit | Estimate (target coverage, 12 months) | Status |
|---|---|---|---|
| Catalog tables (incl. indexes, plus 10% bloat) | ≤ 350 MB | **≈ 321 MB** (292 MB plus 10%) | ✅ within budget, ~29 MB headroom (levers 2–4 adopted, P3.13c; Phase 6 warns at 320 MB) |
| User data (100 active users, 12 months, plus 10%) | — | ≈ 49 MB | — |
| Platform overhead (system catalogs, auth, storage metadata, extensions) | — | ≈ 42 MB (P3.13c: 26.7 MB measured today, plus Storage metadata for the files §3 and §5 allow) | — |
| **Whole database** | 500 MB, alarm 400 MB | **≈ 412 MB** (≈ 384–395 MB with the reserve lever 1) | ⚠️ ~12 MB over the 400 MB warning, under the 450 MB critical line. Lever 1 is held in reserve, applied when the measured DB reaches 330 MB (D-070) |
| **Storage** | ≤ 700 MB, alarm 800 MB | **≈ 285 MB** (248 MB plus 15%) | ✅ within budget |

A first pass with no cuts came to **≈ 425 MB of catalog** (over budget). The design choices in §4 bring it to 267 MB, and they are already reflected in DATA_MODEL.md. P3.11a re-baselined `reference_prices` from measurement (+5.6 MB), P3.13a `brands` and both ownership tables (+11.4 MB), and P3.13b re-projected every table's index bytes from the indexes the schema actually has (+52.9 MB), and P3.13c adopted §7 levers 2–4 plus the rollup and document trims (−45.2 MB), so the subtotal is now 292 MB.

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
| `products` | 95,000 | 348 | 238 | 60.6 | OFF Canada subset after the import filter (129k → ~95k), plus manual/lookup rows. Index **measured** at 90,672 rows (P3.6, P3.13b) |
| `products: trigram GIN on normalized name` | 95,000 | — | 138 | 13.2 | expression index; no stored normalized column. Index **measured** at 90,672 rows (P3.6, P3.13b) |
| `product_identifiers` | 15,000 | 138 | 204 | 5.4 | secondary codes only (store SKU, PLU, alternate GTINs); primary GTIN lives on products. Index projected (P3.13b) |
| `product_sources` | 10,000 | 178 | 145 | 3.5 | only products with more than one contributing source. Index projected (P3.13b) |
| `brands` | 20,000 | 324 | 243 | 12.3 | distinct OFF brand strings after resolution; incl. trigram index. **Measured** (P3.13a): Wikidata rows; index re-projected in P3.13b |
| `brand_ownership` | 22,000 | 248 | 287 | 12.6 | about 1.1 edges per brand (history). **Measured** (P3.13a); index re-projected in P3.13b |
| `companies` | 5,000 | 478 | 323 | 4.4 | brand owners + parents. Index projected (P3.13b) |
| `company_ownership` | 10,000 | 262 | 261 | 5.6 | parent ↔ child edges with dates. **Measured** (P3.13a); index re-projected in P3.13b |
| `categories` | 2,000 | 148 | 99 | 0.5 | Sarvis taxonomy. Index projected (P3.13b) |
| `category_mappings` | 15,000 | 158 | 175 | 5.4 | OFF category tags → taxonomy. Index projected (P3.13b) |
| `banners` | 60 | 228 | 140 | 0.0 | Ontario grocery banners. Index projected (P3.13b) |
| `stores` | 3,000 | 278 | 234 | 1.7 | Ontario grocery stores (OSM, receipts). Index projected (P3.13b) |
| `store_listings` | 25,000 | 198 | 364 | 14.8 | banner-specific names (receipt abbreviations); incl. trigram. Index projected (P3.13b) |
| `price_observations` | 20,000 | 208 | 225 | 9.3 | non-receipt sources (Open Prices, manual), all time. Index projected (P3.13b) |
| `price_points_weekly` | 30,000 | 100 | 112 | 6.8 | receipt aggregates per store × product × week, 90 days. Index projected (P3.13b). Keyed on its natural key, no surrogate id (P3.13c) |
| `price_points_monthly` | 40,000 | 90 | 149 | 10.1 | rollup per store × product × month for **6** months, then per banner (lever 2, P3.13c). Keyed on its natural key, no surrogate id. Index projected (P3.13b) |
| `reference_prices` | 30,000 | 276 | 97 | 11.2 | StatCan 18-10-0245-01, Canada + Ontario, since 2017. **Measured** (P3.11a): the first estimate (118 / 50) left out the +prov block |
| `price_sanity_bounds` | 5,000 | 88 | 77 | 0.9 | per category × unit basis. Index projected (P3.13b) |
| `documents` | 30,000 | 328 | 228 | 18.2 | articles + other cited pages (title, URL, no full text); a document no entity, score or company links to is pruned (P3.13c). Index projected (P3.13b) |
| `document_entities` | 30,000 | 198 | 185 | 12.4 | document ↔ company/brand links with stance; ≤ 30 per company or brand, the most relevant (lever 4, P3.13c). Index projected (P3.13b) |
| `rubrics` | 10 | 2028 | 40 | 0.0 | rubric versions |
| `company_scores` | 13,000 | 528 | 189 | 10.4 | 1,000 scored companies × 6 rows × the **latest 2** versions (lever 3, P3.13c). Index projected (P3.13b) |
| `score_citations` | 40,000 | 208 | 132 | 14.8 | about 3 citations per score row. Index projected (P3.13b) |
| `certifications` | 4,000 | 178 | 210 | 1.7 | manual (D6) + legacy. Index projected (P3.13b) |
| `external_ratings` | 1,000 | 148 | 197 | 0.4 | KnowTheChain etc. (manual). Index projected (P3.13b) |
| `company_events` | 3,000 | 428 | 253 | 2.2 | boycotts, controversies, recalls. Index projected (P3.13b) |
| `product_features, transparency_steps` | 5,000 | 228 | 150 | 2.1 | legacy product-page content. Index projected (P3.13b) |
| `stories` | 200 | 828 | 194 | 0.2 | editorial. Index projected (P3.13b) |
| `match_candidates` | 40,000 | 168 | 201 | 15.8 | pending + accepted only; rejected purged after 30 days. Index projected (P3.13b) |
| `review_queue` | 15,000 | 148 | 94 | 4.0 | open + resolved for 90 days. Index projected (P3.13b) |
| `sources` | 40 | 628 | 40 | 0.0 | one row per SOURCES.md entry in use |
| `ingestion_runs` | 3,000 | 328 | 109 | 1.5 | about 8 runs/day, kept 13 months. Index projected (P3.13b) |
| `ingestion_run_events` | 12,000 | 178 | 66 | 3.2 | ≤ 50 per run, 30 days. Index projected (P3.13b) |
| `raw_objects` | 6,000 | 248 | 223 | 3.0 | rows for files still in storage. Index projected (P3.13b) |
| `validation_failures` | 12,000 | 308 | 51 | 4.9 | ≤ 50 per run, 30 days. Index projected (P3.13b) |
| `ai_calls` | 30,000 | 168 | 140 | 10.0 | 13 months. Index projected (P3.13b) |
| `audit_log` | 20,000 | 228 | 175 | 8.7 | manual edits. Index projected (P3.13b) |
| **Subtotal** | | | | **292** | |

**User data (100 active users, 12 months)**

| Table | Rows | Bytes/row (heap) | Index bytes/row | MB | Basis |
|---|---:|---:|---:|---:|---|
| `profiles` | 1,000 | 178 | 80 | 0.3 | accounts |
| `scans` | 50,000 | 118 | 90 | 11.3 | barcode/search history, 100 active users × 1 year |
| `receipts` | 5,000 | 188 | 90 | 1.5 | 100 users × 4/month × 12 |
| `receipt_lines` | 120,000 | 138 | 100 | 31.0 | 25 lines per receipt |
| **Subtotal** | | | | **44** | |

### Actuals after Phase 2 (P2.19, 2026-10-29, dev project)

Measured with `pg_total_relation_size`, `pg_database_size` and `pg_column_size(row)`, after the sources seed, the legacy re-import and the fixture e2e (which cleans up after itself).

| Measure | Actual | Budget |
|---|---:|---:|
| Whole DB (`pg_database_size`) | 18.1 MB | alarm 400 MB |
| Catalog tables (38, all of `public` except `profiles`) | 4.88 MB | 350 MB |
| … of which 21 empty tables (fixed pages: 1 heap + ≥ 2 per index) | 2.25 MB | — |
| … of which 17 tables with rows (legacy, sources seed, run bookkeeping) | 2.63 MB | — |
| Other schemas (`auth` 1.6 MB, `storage` 0.45 MB, migrations, realtime, vault) | 2.3 MB | ≈ 30 MB assumed |
| Storage (`raw` bucket, 40 objects) | 70 KB | 700 MB |

**Empty-table baseline:** an empty catalog table costs 48–180 KB (one heap page plus at least two pages per index). Even the tables with rows are still close to that minimum, so the whole catalog (4.88 MB) is ~1.4% of its budget. §3 has no line for this fixed cost, and none is needed.

**Row widths vs §3** (average `pg_column_size` of a row, which includes the tuple header):

| Table | Rows | Measured B/row | §3 B/row | Note |
|---|---:|---:|---:|---|
| `products` | 13 | 556 | 348 | 336 without `description` (220 B average, legacy text). OFF rows have no long description, so ≈ budget. **Phase 3 OFF sample: measure the real width before scaling** (as §8 already says). |
| `companies` | 11 | 481 | 478 | ✅ |
| `brands` | 49 | 223 | 228 | ✅ |
| `brand_ownership` | 49 | 208 | 178 | +17%, ≈ +0.7 MB at 22k rows |
| `company_scores` | 66 | 250 | 528 | under (legacy scores have no rationale text yet; AI scores will) |
| `review_queue` | 271 | 232 | 148 | long legacy reasons; ≈ +1.4 MB at 15k rows |
| `raw_objects` | 40 | 302 | 248 | +22%, ≈ +0.3 MB |
| `sources` | 35 | 280 | 628 | under |

Row counts are far too small for the index or heap sizes to say anything beyond this. The per-row widths are within the §1 headroom (~56 MB), and the only one to watch is `products`.

### Actuals: OFF sample (P3.5, 2026-10-30, dev project)

| Measure | Sample | §3/§5 estimate | Note |
|---|---:|---:|---|
| `products` row width (avg `pg_column_size`, 99 OFF rows) | **379 B** (341–469) | 348 B | +9%, inside the 20% line. Names average 27 characters (est. 35); the extra is `image_key` (~37 B) and `quantity_text`. ≈ +3 MB heap at 95k rows. |
| Raw extract (gz, per OFF record) | 89 B (8,887 B / 100) | ~155 B (20 MB / 129k) | The TSV extract of 10 columns is smaller than the JSON the estimate assumed: ≈ 11.5 MB per full extract. |
| Import-filter pass rate (Canadian rows kept) | 92% (100 of 109); 95% over the dump's first 94k rows (1,493 of 1,572) | 74% (129k → 95k) | **The filter drops fewer rows than estimated.** At 92–95% of ~129k, the full import is ~119–123k rows, +25–29% over 95k. The early rows (codes starting `0`, mostly North American UPCs) may be better filled than the rest, so P3.6 measures the real count before any lever (§7) is chosen. |

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

### Actuals: OFF full import (P3.6, 2026-10-30, dev project)

Measured after two clean full runs (plus one failed attempt) on the 2026-10-30 dump (1.53 GB gz, 4,883,869 rows).

| Measure | Actual | §3/§5 estimate | Note |
|---|---:|---:|---|
| Canadian rows in the dump | 129,859 | ~129k | ✅ |
| Kept by the import filter | 93,178 (71.8%) | 95k (74%) | −2%. P3.5's 92–95% pass rate came from the dump's early, better-filled rows; the full dump drops 3,262 for no name and 33,419 for no brand or category. |
| Valid → written | 90,659 `products` + 3 `product_sources` | — | 2,516 rejected (`gtin_check_digit`) |
| `products` total (heap + indexes) | **71.1 MB** | 67.5 MB (56.1 + 11.4 trigram) at 95k rows | +5% in total, **+10% per row** (784 B vs 711 B), inside the 20% line |
| … heap | 36.9 MB (407 B/row on disk) | 400 B/row (348 × 1.15) | +2% |
| … trigram GIN on name | 12.6 MB | 11.4 MB | +10% |
| … 9 btree indexes | 21.6 MB (238 B/row) | 190 B/row | +25% on its own: `products_source_key` (source_id, external_id) is 6.7 MB, and `reviewed_by` (added after §3) is another index. Covered by the heap and trigram margin, so the products line stays at +5% and needs no PLAN task. |
| Avg row width (`pg_column_size`) | 351 B | 348 B | ✅ (the sample's 379 B was early, wordier rows) |
| `product_sources`, `raw_objects` | 64 KB, 152 KB | 2.8 MB, 2.2 MB | ✅ |
| Whole DB (`pg_database_size`) | 90.5 MB | alarm 400 MB | ✅ |
| Raw extract per full run (gz) | 4.34 MB, 10 files (47 B/record) | 20 MB (×3 = 60 MB) | −78%: TSV extract (D-057), not JSON |
| `raw` bucket total | 12.7 MB, 70 files | 700 MB | ✅ (three OFF full runs, one of them the failed attempt, plus earlier runs) |

Nothing is over its estimate by more than 20% at the line level, so no PLAN task comes before the next scale-up.

### Actuals: OFF daily deltas (P3.7, 2026-10-30, dev project)

First delta run over the 13 files listed (2026-10-17 → 2026-10-30): 104,412 changed products scanned worldwide, 2,584 Canadian ones kept (~200 a day), 2,444 valid.

| Measure | Actual | §5 estimate | Note |
|---|---:|---:|---|
| Raw per day (gz) | ~11.6 KB (150,480 B for 13 files) | ≈ 0.2 MB | −94%: TSV extract (D-057), and fewer Canadian changes than the 1–2k guessed |
| Raw kept (30 days) | ≈ 0.35 MB | 6 MB | ✅ |
| Download per day | ~22 MB streamed, not stored | — | not counted against Supabase |
| Rows written | 1 updated | — | the export is newer than most deltas (D-059) |

### Actuals: Open Prices full import (P3.10, 2026-11-03, dev project)

Two full runs on the 2026-11-02 dumps (prices 22.6 MB gz, 340,038 rows, 715 CAD; locations 1.2 MB gz, 7,781 rows).

| Measure | Actual | §3/§5 estimate | Note |
|---|---:|---:|---|
| `stores` rows (Open Prices) | 100 (28 in Ontario) | 3,000 (all sources) | ✅ |
| `stores` avg row width (`pg_column_size`) | **429 B** | 278 B | **+54%**: `address` is the whole OSM display name (117 B avg). PLAN P3.10a. |
| `stores` total (heap + indexes) | 0.19 MB | 1.3 MB | ✅ (mostly empty index pages at this size) |
| `price_observations` rows | 521 | 20,000 (all time) | ✅ |
| `price_observations` avg row width | **258 B** | 208 B | **+24%**: per-row `source_url` (~48 B). Projected line at 20k rows: 8.1 MB vs 7.0 MB (+16%). PLAN P3.10a. |
| `price_observations` total | 0.38 MB | 7.0 MB | ✅ |
| Raw extract per full run (gz) | 20 KB, 2 files (7.8 KB stores + 12.2 KB prices) | 1 MB (× last 3) | ✅ |
| `raw` bucket total | 12.9 MB, 91 files | 700 MB | ✅ |
| Whole DB (`pg_database_size`) | 91.3 MB | alarm 400 MB | ✅ |

The table totals are far under §3, but the two row widths are over by more than 20%, so P3.10a comes before these tables grow (receipts, Phase 8). It's placed before P3.11.

### Actuals: StatCan reference prices (P3.11, 2026-11-03, dev project)

Full run `898792c1` on the cube released 2026-10-07 (end month 2026-08).

| Measure | Actual | §3/§5 estimate | Note |
|---|---:|---:|---|
| `reference_prices` rows | 25,520 (220 series × 116 months) | 30,000 | ✅ |
| `reference_prices` avg row width (`pg_column_size`) | **266 B** | 118 B heap | **+125%**: §3 left out the +prov block; `source_url` 65 B, `method_version` 23 B. PLAN P3.11a. |
| `reference_prices` total | **9.56 MB** (heap 7.05 + indexes 2.47) | 5.6 MB | **+71%**. PLAN P3.11a. |
| Raw per full run (gz) | 172 KB, 12 files (metadata 8.3 KB + 11 data envelopes ≈ 14 KB each) | 0.5 MB × last 3 | ✅ |
| `raw` bucket total | 13.2 MB, 123 files | 700 MB | ✅ |
| Whole DB | 96 MB | alarm 400 MB | ✅ |

The table is complete (it grows by 220 rows a month), so P3.11a either trims the width or re-baselines §3.

### Actuals: `reference_prices` re-baselined (P3.11a, 2026-11-03)

§3 now uses the P3.11 measurement: **276 B heap and 97 B index per row** (7,045,120 B and 2,473,984 B over 25,520 rows), so **11.2 MB at 30,000 rows** (was 5.6 MB). The catalog subtotal goes from 267 to 273 MB (≈ 300 MB with bloat), and the whole DB estimate from 373 to 379 MB, still under the 400 MB alarm.

Why re-baseline instead of trimming: the only per-row cut is `source_url` (65 B, the same table URL on every row). Rebuilding it from `url_template` needs a new key column (≈ 12 B), so a row would still be ≈ 210 B, +78% on the old 118 B, and still over the line. The old figure left out the +prov block that every fact table carries (D-032), so it was the estimate that was wrong. The table is complete at ~26k rows and grows by 220 rows a month (≈ 0.9 MB a year with indexes), so there's no scale-up left to protect (D-064).

### Actuals: ODbL extract (P3.8, 2026-11-03, dev project)

| Measure | Actual | §5 estimate | Note |
|---|---:|---:|---|
| One export (gz) | 3.74 MB: products 3,727,341 B (90,659 rows), stores 4,955 B (100), prices 10,917 B (521), README 1,561 B | ≈ 8 MB | ✅ (gzip level 9; no internal ids) |
| `public-exports` bucket (latest 2) | 7.49 MB, 8 files | 16 MB | ✅ |

### Actuals: Open Prices row widths (P3.10a, 2026-11-03, dev project)

After `open-prices@1.0.1` (street-part `address`) and the price `url_template` migration (D-061). Two full runs on the same dumps (both 304).

| Measure | Actual | §3/§5 estimate | Note |
|---|---:|---:|---|
| `stores` avg row width | **333 B** (was 429 B) | 278 B | +19.8%, inside the line. `address` 21 B avg (was 117 B); the rest is the slug, name and stored `source_url` (D-061). |
| `stores` total | 0.20 MB | 1.3 MB | ✅ (the 100 updates left dead tuples until autovacuum) |
| `price_observations` avg row width | **211 B** (was 258 B) | 208 B | +1% ✅ (`source_url` null, rebuilt from `url_template`) |
| `price_observations` total | 0.53 MB | 7.0 MB | ✅ (dead tuples from the migration's 521 updates, until autovacuum) |
| Raw per full run (gz) | 20 KB, 2 files | 1 MB (× last 3) | ✅ |
| `raw` bucket total | 12.9 MB, 95 files | 700 MB | ✅ |
| Whole DB | 87 MB | alarm 400 MB | ✅ |

Both widths are back within 20% of §3, so §3 isn't re-baselined. Stores sit right at the line: a source that stores long names or URLs per store will push it over.

### Actuals: Wikidata ownership full run (P3.13, 2026-11-04, dev project)

Two clean full runs (`5c5318eb`, then `3c9b0a8d` with 0 inserted). 1,890 of 19,345 OFF brand strings matched (1,759 items).

| Measure | Actual | §3/§5 estimate | Note |
|---|---:|---:|---|
| `brands` | 1,828 rows, 1.5 MB (heap 0.74 + indexes 0.79); avg width **321 B** | 20,000 rows, 9.2 MB; 228 B | Rows far under. Width **+41%**. PLAN P3.13a. |
| `companies` | 1,737 rows, 1.6 MB (0.72 + 0.91); 361 B | 5,000 rows, 3.5 MB; 478 B | ✅ |
| `brand_ownership` | 1,570 rows, 1.1 MB (0.43 + 0.67); **248 B** | 22,000 rows, 6.9 MB; 178 B | Width **+39%**. PLAN P3.13a. |
| `company_ownership` | 659 rows, 0.55 MB (0.20 + 0.33); **262 B** | 10,000 rows, 3.1 MB; 178 B | Width **+47%**. PLAN P3.13a. |
| `review_queue` | 271 rows (none from Wikidata, D-054) | — | ✅ |
| Raw per full run (gz) | ≈ 2.3 MB, 1,097 files (387 match + 710 entities) | ≈ 2 MB × last 3 | +15% ✅ |
| `raw` bucket total | 21 MB, 3,936 files | 700 MB | ✅ |
| Whole DB | 110 MB | alarm 400 MB | ✅ |

### Actuals: ownership row widths re-baselined (P3.13a, 2026-11-04, dev project)

Measured after the P3.13 full runs (`pg_column_size` per row; `brands` 1,779 Wikidata rows and 49 legacy rows, `brand_ownership` 1,570, `company_ownership` 659).

| Table | Width | Old §3 | What the row carries (avg bytes) |
|---|---:|---:|---|
| `brands` (Wikidata rows) | **324 B** (legacy rows 223) | 228 | `source_url` 40, aliases 34, website 21, `method_version` 15, `locked_fields` 13, slug 11, name 12, QID 10; the rest is the fixed +prov / +review block (uuids, timestamps) and the tuple header |
| `brand_ownership` | **248 B** | 178 | `source_url` 39, `method_version` 15, enums 15; the rest fixed (4 uuids, dates, timestamps) |
| `company_ownership` | **262 B** | 178 | `source_url` 44, `method_version` 15, enums 21; the rest fixed |

§3 now uses these widths. The index column is re-projected too: at today's row counts every index sits at its minimum pages (brands 435 B/row, edges 428–497 B/row), so the per-entry sizes come from `products` at 90k rows instead (unique uuid 49 B, short unique text 44 B, trigram GIN ≈ 6 B per name byte, deduplicated FK btrees 10–17 B), with ≈ 70 B for the 4-column edge keys and ≈ 45 B for the partial one-owner indexes. Brands 268 B (was 200), brand edges 265 B and company edges 270 B (both 110). The old figures predate the provenance FK indexes (`source`, `ingestion_run`, `raw_object`, `reviewed_by`, `ai_call`) that every +prov table now has.

New §3 totals: `brands` 12.8 MB (was 9.2), `brand_ownership` 12.1 MB (6.9), `company_ownership` 5.7 MB (3.1). Catalog subtotal 273 → **284 MB** (≈ 313 MB with bloat), whole DB estimate 379 → **392 MB**, under the 400 MB alarm with ~8 MB headroom. Actual whole DB today: 110 MB.

Why re-baseline instead of trimming (D-068): the only per-row cut is `source_url`. Brands could rebuild it from the QID with no new column (−40 B → 284 B, still +25%); edges need a statement-key column (≈ −30 B net → 218 / 232 B, +22% / +30%). So every table stays over the line, for ≈ 2 MB saved at §3 counts, plus a view per table and writer changes. `companies` stays at 478 B (measured 361).

### Actuals: index bytes re-projected (P3.13b, 2026-11-04, dev project)

The §3 index column was set before the schema had its provenance and review FK indexes (`source`, `ingestion_run`, `raw_object`, `reviewed_by`, often `ai_call`, `merged_into`), its composite unique keys, and its partial indexes. Every §3 table now uses the indexes listed by `pg_index` on the dev project (all §3 catalog tables exist), with bytes per entry from what's measured at scale:

| Index kind | B / row | Measured on |
|---|---:|---|
| btree, random inserts: (12 + key bytes) / 0.6 | uuid pkey 47 | `products_pkey` 49 (90,672 rows) |
| … short unique text | ≈ 44 | `products_gtin_key` 44; `reference_prices_key` (text, date) 44 (24,700 rows) |
| … uuid + text | ≈ 70–74 | `products_source_key` 74 |
| btree, sequential inserts (bigint pkey, timestamps): (12 + key) / 0.85 | 24 | `reference_prices_pkey` 24 |
| deduplicated FK btree (few distinct values, or mostly null) | 10 (run 14, raw object 17) | `products` FK indexes 9.7–17.3; `reference_prices` 7.6–8.6 |
| FK btree, ~1–3 rows per value | 22–47 | by the formula, scaled for duplicates |
| partial index | the share of rows it covers × the entry size | dev counts where rows exist (one current owner 94%, one controlling parent 56%) |
| trigram GIN | ≈ 6.2 B per name byte | `products_name_trgm_idx` 138.5 for 22.5-B names |

`products` uses its measured indexes (P3.6: 238 B btree, 138.5 B trigram), and `reference_prices` keeps its measured 97 B (P3.11a). Rows, heap widths and the method (`rows × (heap × 1.15 + index)`) are unchanged. The `brands` and ownership figures replace P3.13a's quicker projection.

| Table | Index B / row (old → new) | MB (old → new) | Indexes (B / row) |
|---|---|---|---|
| `products` | 190 → **238** | 56.1 → 60.6 | 9 btrees, measured at 90,672 rows (P3.6) 238 |
| `products: trigram GIN on normalized name` | 120 → **138** | 11.4 → 13.2 | measured at 90,672 rows 138.5 |
| `product_identifiers` | 110 → **204** | 4.0 → 5.4 | U (scheme, value, banner_id) 82, product_id 47, pkey bigint 24, raw_object 17, ingestion_run 14, banner 10, source 10 |
| `product_sources` | 80 → **145** | 2.8 → 3.5 | U (source_id, external_id) 74, product_id 47, pkey bigint 24 |
| `brands` | 268 → **243** | 12.8 → 12.3 | trigram GIN name (10.5 B) 65, pkey uuid 49, U slug 38, U wikidata_qid (half null) 30, raw_object 17, ingestion_run 14, source 10, reviewed_by 10, merged_into 10 |
| `brand_ownership` | 265 → **287** | 12.1 → 12.6 | U (brand, company, relation, valid_from) 90, pkey uuid 49, U one current owner (90% of rows) 42, company_id 25, match_candidate 20, raw_object 17, ingestion_run 14, ai_call 10, reviewed_by 10, source 10 |
| `companies` | 150 → **323** | 3.5 → 4.4 | trigram GIN name (12.4 B) 77, pkey uuid 49, U slug 40, U wikidata_qid 38, wikipedia_document 35, U sec_cik (7% set) 23, raw_object 17, ingestion_run 14, source 10, reviewed_by 10, merged_into 10 |
| `company_ownership` | 270 → **261** | 5.7 → 5.6 | U (parent, child, relation, valid_from) 90, pkey uuid 49, child_company_id 35, U one controlling parent (55% of rows) 26, raw_object 17, ingestion_run 14, ai_call 10, reviewed_by 10, source 10 |
| `categories` | 80 → **99** | 0.5 → 0.5 | pkey uuid 49, U slug 40, parent 10 |
| `category_mappings` | 80 → **175** | 3.9 → 5.4 | U (source_id, source_category_key) 90, pkey bigint 24, raw_object 17, ingestion_run 14, category 10, ai_call 10, reviewed_by 10 |
| `banners` | 80 → **140** | 0.0 → 0.0 | pkey uuid 49, U slug 40, raw_object 17, ingestion_run 14, operator 10, source 10 |
| `stores` | 120 → **234** | 1.3 → 1.7 | U slug (34 B) 77, pkey uuid 49, U (osm_type, osm_id) 37, U (banner, external_store_id) 30, raw_object 17, ingestion_run 14, source 10 |
| `store_listings` | 190 → **364** | 10.4 → 14.8 | trigram GIN listing_name (~20 B) 124, U (banner, listing_key) without SKU (80%) 78, pkey uuid 49, product_id 35, match_candidate 24, raw_object 17, ingestion_run 14, U (banner, external_sku) (20%) 13, source 10 |
| `price_observations` | 110 → **225** | 7.0 → 9.3 | (store, product, observed_on) 80, U (source_id, external_id) 58, pkey bigint 24, product_id 22, raw_object 17, ingestion_run 14, listing 10 |
| `price_points_weekly` | 70 → **136** | 5.8 → 7.8 | U (store, product, week_start) 80, pkey bigint 24, product_id 22, source 10 |
| `price_points_monthly` | 60 → **173** | 13.8 → 22.9 | U (store, banner, product, month) 107, pkey bigint 24, product_id 22, banner 10, source 10 |
| `price_sanity_bounds` | 40 → **77** | 0.7 → 0.9 | U (category, unit_basis) 53, pkey bigint 24 |
| `documents` | 110 → **228** | 19.5 → 24.2 | U url_normalized (~70 B) 138, pkey uuid 49, raw_object 17, ingestion_run 14, source 10 |
| `document_entities` | 110 → **185** | 20.3 → 24.8 | U (document, company, brand) 80, pkey bigint 24, raw_object 17, ingestion_run 14, company 10, brand 10, ai_call 10, reviewed_by 10, source 10 |
| `company_scores` | 110 → **189** | 14.3 → 15.9 | pkey uuid 49, superseded_by (2/3 set) 35, U approved (company, category) (1/3) 21, raw_object 17, ingestion_run 14, company 10, ai_call 10, reviewed_by 10, rubric 10, source 10, pending created_at 3, U legacy (company, category) 0 |
| `score_citations` | 90 → **132** | 19.8 → 22.3 | U (score, document) 73, document_id 35, pkey bigint 24 |
| `certifications` | 90 → **210** | 1.2 → 1.7 | U (company, brand, product, scheme, scheme_name) 60, pkey uuid 49, document 20, raw_object 17, ingestion_run 14, brand 10, company 10, product 10, reviewed_by 10, source 10 |
| `external_ratings` | 70 → **197** | 0.2 → 0.4 | U (company, scheme, period) 77, pkey uuid 49, document 20, raw_object 17, ingestion_run 14, reviewed_by 10, source 10 |
| `company_events` | 80 → **253** | 1.7 → 2.2 | U (company, kind, title, event_date) 133, pkey uuid 49, document 20, raw_object 17, ingestion_run 14, reviewed_by 10, source 10 |
| `product_features, transparency_steps` | 70 → **150** | 1.7 → 2.1 | U (product, sort_order or step) 50, pkey uuid 49, raw_object 17, ingestion_run 14, reviewed_by 10, source 10 |
| `stories` | 60 → **194** | 0.2 → 0.2 | U slug 70, pkey uuid 49, (featured, published_at) 24, raw_object 17, ingestion_run 14, company 10, source 10 |
| `match_candidates` | 110 → **201** | 12.1 → 15.8 | U (kind, subject, candidate, version) 112, pkey bigint 24, pending (kind, score) (50%) 23, candidate_id 22, decided_by 10, run 10 |
| `review_queue` | 90 → **94** | 3.9 → 4.0 | U open (item_table, item_id) (50%) 37, pkey bigint 24, open (priority, created_at) (50%) 13, assigned_to 10, resolved_by 10 |
| `ingestion_runs` | 70 → **109** | 1.3 → 1.5 | (source, started_at) 60, pkey uuid 49, running started_at 0 |
| `ingestion_run_events` | 60 → **66** | 3.2 → 3.2 | (run, at) 42, pkey bigint 24 |
| `raw_objects` | 80 → **223** | 2.2 → 3.0 | U storage_path (64 B) 128, pkey uuid 49, live expires_at 24, run 12, source 10 |
| `validation_failures` | 60 → **51** | 5.0 → 4.9 | pkey bigint 24, raw_object 17, run 10 |
| `ai_calls` | 70 → **140** | 7.9 → 10.0 | response_raw_object 47, (user, at) 35, at 24, pkey bigint 24, run 10 |
| `audit_log` | 60 → **175** | 6.4 → 8.7 | (table_name, row_id, at) 117, at 24, pkey bigint 24, actor 10 |

Unchanged: `reference_prices` (measured), `rubrics`, `sources` (≈ 0 MB). Down a little: `validation_failures` (60 → 51). The user-data tables (`profiles`, `scans`, `receipts`, `receipt_lines`) don't exist yet and carry no +prov block, so they stay as §3 has them.

**Totals:** catalog subtotal **284 → 337 MB** (≈ 370 MB with bloat, over the 350 MB catalog budget), whole DB estimate **392 → ≈ 450 MB** (over the 400 MB alarm, at the 450 MB critical line, under the 500 MB limit). Actual whole DB today: 110 MB. The biggest increases: `price_points_monthly` +9.1, `documents` +4.7, `document_entities` +4.5, `products` +6.3 (both lines), `store_listings` +4.4, `match_candidates` +3.7.

**What covers it (§7, savings re-computed with the new widths, before bloat):** lever 2 (monthly rollups 12 → 6 months) ≈ 11 MB, lever 3 (latest 2 score versions) ≈ 13 MB, lever 4 (`document_entities` ≤ 30 per company, ≈ 30k rows) ≈ 12 MB, lever 1 (tighter OFF filter) 15–25 MB. Levers 2–4 together ≈ 36 MB (≈ 40 MB with bloat) bring the whole DB to ≈ 410 MB; adding lever 1 brings it to ≈ 385–395 MB. Lever 1 costs product coverage, so the choice is the owner's (PLAN P3.13c).

### Actuals: levers adopted (P3.13c, 2026-11-04, dev project)

The owner delegated the choice. Product coverage wins (CLAUDE.md), so the OFF filter (lever 1) is held in reserve and the coverage-neutral levers are adopted (D-070).

**Platform overhead, measured** (was assumed 30 MB): system catalogs 17.1 MB, `storage` 7.7 MB (3,944 objects, ≈ 1.9 KB each with indexes), `auth` 1.6 MB, the rest 0.25 MB, so 26.7 MB today. At target, Storage holds ≈ 10.8k objects (6,000 raw files, the §3 `raw_objects` bound, plus 4,800 receipt images and the exports) ≈ 20.5 MB of metadata, and `auth` ≈ 3 MB for 1,000 accounts: **≈ 42 MB**.

| Change | Table | MB (P3.13b → P3.13c) |
|---|---|---|
| Lever 2: 6 months store-level, then per banner (80k → 40k rows); natural key, no surrogate id | `price_points_monthly` | 22.9 → 10.1 |
| Natural key, no surrogate id | `price_points_weekly` | 7.8 → 6.8 |
| Lever 3: latest 2 versions (20k → 13k rows) | `company_scores` | 15.9 → 10.4 |
| … their citations (60k → 40k) | `score_citations` | 22.3 → 14.8 |
| Lever 4: ≤ 30 links per company or brand (60k → 30k) | `document_entities` | 24.8 → 12.4 |
| … and documents nothing links to are pruned (40k → 30k) | `documents` | 24.2 → 18.2 |
| **Total** | | **−45.2 MB** |

**Totals:** catalog 336.8 → **291.6 MB** (≈ 321 MB with bloat, under the 350 MB budget). Whole DB 320.8 + 49 + 42 = **≈ 412 MB**: ~12 MB over the 400 MB warning, under the 450 MB critical line and the 500 MB limit. With the reserve lever 1 (15–25 MB before bloat): ≈ 384–395 MB. Without the platform re-measure, the adopted levers alone would have shown 400 MB.

## 5. Storage estimate

| Item | Basis | MB |
|---|---|---:|
| S1 OFF filtered Canada extract | about 129k records × ~600 B raw JSON → ≈ 20 MB gz, × last 3 | 60 |
| S1 OFF filtered daily deltas | about 1–2k changed records a day → ≈ 0.2 MB gz × 30 days | 6 |
| S2 OFF API lookup responses | about 100 a day × 1.5 KB gz × 30 days | 5 |
| S5 Open Prices CAD extract | < 1k rows, × last 3 | 1 |
| S6 StatCan WDS responses | ≈ 0.5 MB gz × last 3 | 2 |
| S17 Wikidata SPARQL pages | ≈ 2 MB gz per full run × last 3 | 6 |
| S19 Wikipedia summaries | 5k pages × 0.44 KB gz (measured P3.14), 20 per file, last 3 runs that stored a file (D-071) | 7 |
| S20 SEC Exhibit 21 + submissions | 100 companies × 3 filings × 60 KB gz | 18 |
| S23 GDELT responses | 1,000 companies weekly × 6 KB gz × 4 weeks | 24 |
| S24 RSS feeds | 6 feeds every 3 h, stored on change, ≈ 0.5 MB a day × 30 days | 15 |
| OpenRouter responses | scoring 4k calls a year × 5 KB gz (13 months); tagging 2k a month × 2 KB (90 days) | 35 |
| Receipt images | transient (deleted after parsing) ≈ 2 MB; opt-in 20% kept 90 days: 80 a month × 3 × 150 KB | 38 |
| Receipt parse responses | deleted with the image | 5 |
| `public-exports`: ODbL extract (D-013 D1) | OFF-derived tables as CSV.gz ≈ 8 MB, × latest 2 | 16 |
| `editorial`: story covers | 50 × 200 KB | 10 |
| **Subtotal** | | **248** |
| **With 15% margin** | | **≈ 285** |

**Not stored:** full OFF and Wikidata dumps (processed on the Actions runner; URL and sha256 only), product images (hotlinked from OFF with attribution) and brand logos (Wikimedia Commons links).

## 6. Thresholds and alarms (Phase 6 budget monitor)

| Metric | Measure | Warn | Critical / action |
|---|---|---|---|
| Whole DB | `pg_database_size(current_database())` | 330 MB: apply the reserve §7 lever 1 (D-070); 400 MB | 450 MB: pause non-essential imports (GDELT, RSS) and apply the §7 levers |
| Catalog tables | sum of `pg_total_relation_size` over catalog tables | 320 MB | 350 MB: budget exceeded; apply §7 |
| Largest table growth | per-table size vs. last week | +20 MB in a week | investigate before the next scale-up |
| Storage | sum of `storage.objects.metadata->size` | 700 MB | 800 MB: run cleanup now; shorten retention |
| OpenRouter spend | sum of `ai_calls.cost_usd` this month vs. the hard cap | 80% of cap | 95%: the spend guard blocks batch jobs (`status = budget_blocked`) |
| Supabase egress | dashboard (free tier 5 GB a month) | 4 GB | stop serving the ODbL extract from Storage (move it elsewhere) |

**Egress note (P3.8):** one full ODbL export is **3.74 MB** (products 3.73 MB, stores 5 KB, prices 11 KB, README 2 KB; 2026-11-03). About 1,070 full downloads a month reach the 4 GB warning, so the extract alone won't trigger it at today's traffic. The CDN caches files for 1 h (`cacheControl: 3600`), and cache hits may still count as egress.

The `catalog_quality` view (DATA_MODEL §4) exposes the DB and storage numbers for the P5 dashboard.

## 7. Levers if estimates prove low (in order)
1. **Tighten the OFF filter:** for example, only products whose brand has a resolved owner or that someone has scanned. Saves about 15–25 MB. **Reserve (D-070):** applied only when the measured whole DB reaches 330 MB, because it costs product coverage.
2. ✅ **Adopted (P3.13c, D-070): shorten store-level monthly price rollups** from 12 to 6 months. Saves about 12.8 MB with the natural-key trim.
3. ✅ **Adopted: keep fewer superseded score versions** (`company_scores` / `score_citations`): latest 2. Saves about 13 MB.
4. ✅ **Adopted: cap `document_entities`** at 30 per company or brand, keeping the most relevant, and prune documents nothing links to. Saves about 18.5 MB.
5. **Archive old `receipt_lines`** (over 24 months) to per-user gz files in Storage.

## 8. Growth and limits
- **Each extra 100 active users** adds about **49 MB a year** of user data, about **15 MB a year** of price aggregates, and about **40 MB** of opt-in receipt images in Storage.
- With the catalog at about 321 MB (P3.13c), the whole DB estimate is ≈ 412 MB at **100 active users**, just past the 400 MB warning, and ≈ 384–395 MB once the reserve lever 1 is applied. Past roughly 110–125 active users the free DB passes the warning even with every lever, and the options below apply.
- Past that, the options are a paid Supabase tier (owner decision, Phase 10) or archiving user history to Storage.
- **Biggest uncertainty:** the OFF row count after filtering and the real average row width. Both get measured in Phase 3's OFF sample task before scaling up.
