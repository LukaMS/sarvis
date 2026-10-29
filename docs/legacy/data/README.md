# Legacy content export

Editorial content from the legacy app's Supabase project (`chaidwvlizbayyugnphw`), saved so Phase 2 can re-import it into the new schema with `legacy-import` provenance.

- **Exported:** 2026-10-26 (task P0.2), read-only `select` via the `supabase-legacy` MCP (`read_only=true`).
- **Format:** one file per table, a JSON array of rows exactly as `row_to_json` returns them (column order as in [`../schema.sql`](../schema.sql), one row per line). Rows are sorted by `id` (`app_settings` by `key`). Original UUIDs are kept, so foreign keys between files still resolve.
- **Not exported (by design):** user data (`profiles`, `scan_history`, `receipt_scans`, `receipt_items`, `community_submissions`), `product_aliases` (0 rows), and the Fortinos catalogue/scraper tables (P3 re-sources them).

## Files

| File | Rows | md5 of `jsonb_agg(to_jsonb(row) ORDER BY id)::text` |
|---|---|---|
| `companies.json` | 11 | `410d92afa3e7c472cd1169ccb8703792` |
| `brands.json` | 49 | `5466d2d9f96c8ec18ceadccda7b18054` |
| `ethical_scores.json` | 55 | `45bf5288b0cafe9f225cde47c4fa0dfe` |
| `certifications.json` | 6 | `0abdd5fa9cc517be151314b32e76e7ab` |
| `boycotts.json` | 2 | `fce93618c11e27f1be521f7e7e3dcde4` |
| `controversies.json` | 5 | `7e0b09dd1f12bc7e257bc474f03b4f72` |
| `products.json` | 13 | `2f0d02f4f3ab2a12b651a06f87bf7ab8` |
| `product_features.json` | 30 | `5a769551b693d7fc008aa90f241a47d4` |
| `transparency_steps.json` | 20 | `adecfe29d39bc09b9b9fe318ffdb21c8` |
| `impact_stories.json` | 6 | `69027348ef6944ba9eba50701ee395ef` |
| `app_settings.json` | 4 | `a338eb3387b1da77390b66cd8e736d32` (ordered by `key`) |

**Fidelity check:** each file was re-serialised in Postgres `jsonb::text` form (keys sorted by length then bytes, `", "`/`": "` separators) and md5-hashed. All 11 hashes equal the live DB hashes above, so the files are byte-for-byte the same data as the database.

`app_settings`: all 4 rows are non-secret (model lists `enrichment_models` and `receipt_models`, the `enrichment_web_search` flag, and `receipt_match_threshold` = 0.45). The table holds no keys; API keys lived in edge-function secrets.

## Quality notes (for the P2 re-import)

**Provenance**
- No row has a source URL for its facts. `controversies.source_url` and `boycotts.source_url` are null in every row, and `ethical_scores` has no source, model, rubric version or confidence column. Every imported fact will need `method = legacy-import` and should be treated as unreviewed.
- The 2 boycotts and 5 controversies have no sources at all. They should go to the review queue, not straight to users.

**Ownership and brands**
- None of the 49 brands has a `slug`. Slugs must be generated on import (companies already have unique slugs).
- Only 1 of 13 products has a `brand_id` (Scoobi Doo Pasta → Unico). The other 12 have `brand = null` even when the brand exists (e.g. KitKat Original vs. the KitKat brand). Brand links have to be inferred on import.
- `companies.brands[]` matches the `brands` table for all 11 companies (kept in sync by a trigger).
- Every `company_id` / `product_id` reference resolves, so there are no orphans.
- `parent_company_id` is null everywhere, so there is no ownership chain to migrate.
- Probable errors to check in review:
  - "Kashi Bars" is attributed to General Mills. Kashi is not a General Mills brand.
  - "Uncle Ben's" was renamed "Ben's Original" in 2020.
  - Some CEO names (Nestlé, Unilever) look out of date.
  - Patagonia and Tin Shed Ventures are not grocery.

**Scores**
- All 11 companies have all 5 categories (55 rows).
- **Bolthouse Farms:** overall `Good`, but all 5 categories `Mixed` with null notes. This is inconsistent and was apparently auto-created by `lookup-product`; the company row is otherwise empty.
- **Sun-Brite Foods:** all 5 categories `Mixed`, each with the note "Insufficient publicly available information". These are placeholders, not assessments.
- Product `ethical_score`/`grade` values are hand-set and not derived from company scores. "Kashi Bars" is scored 5/F, and "Green Goodness" has no score.

**Products**
- Barcode formats are mixed: 11 are 13-digit (EAN-13, or UPC-A with a leading zero) and 2 are 12-digit UPC-A. They need GTIN normalization (P4).
- All `source = 'manual'`; `image_url` is set only on Green Goodness (an Open Food Facts image URL).
- `products.certifications text[]` is free text and duplicates `certifications` (a company-level table) inconsistently.

**Stories**
- All 6 `impact_stories` have `body = null` (title, subtitle and cover image only). Cover images are Unsplash URLs, so check the licence before re-use.

**Text**
- Some strings contain non-ASCII punctuation (U+2011 non-breaking hyphen, U+2019 apostrophe, em dash). The files are UTF-8; keep that encoding on import.

## Re-import (P2.18)

`npm run pipeline -- run legacy-import` maps these files into the new schema as `pending` facts with `legacy-import` provenance, and queues each one as a `legacy_fact` with the notes above as its reason (D-049). It's idempotent: on the dev project, run 2 inserted 0 of 271 records. Since P2.22 the companies, brands and products are queued too, and users see none of them until an admin approves each one (D-050, D-052).
