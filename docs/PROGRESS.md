# Progress log

Newest entry first.

---

## 2026-10-26 — P0.4 Write SPEC.md, part 2: backend, AI and admin

**What changed**
- `docs/legacy/SPEC.md` part 2 appended:
  - 3 edge functions (request/response shapes, settings, model chains, fallbacks, errors);
  - all 4 OpenRouter prompts verbatim, with their expected JSON shapes;
  - `app_settings` keys with live values;
  - the RPC call-site table;
  - RLS per table;
  - the admin portal (connection model + 19 page sections + behavioural components);
  - a catalog-worker pointer;
  - 10 backend and admin issues for the rebuild.
- Fixed part 1, F2: auto-created products have `source='auto_barcode'`; `auto_created` is only the response flag.

**Verification: mapping**

Edge functions → SPEC section:
- `process-receipt` → "### `process-receipt`"
- `enrich-content` → "### `enrich-content`"
- `lookup-product` → "### `lookup-product`"

OpenRouter call sites (`grep -rn openrouter LEGACY/supabase LEGACY/admin/src LEGACY/src`, 2 hits):
- `supabase/functions/process-receipt/index.ts:174` → AI prompts table + "Receipt parser"
- `supabase/functions/enrich-content/index.ts:191` → AI prompts table + "Company research", "Product research", "Brand owner"

Admin page files → SPEC section (19/19, 0 missing):
- Activity, Brands, Companies, CompanyEditor, Dashboard, ProductEditor, Products, QrCodes, ReceiptLab, Settings, Stories, Submissions
- catalog/Categories, catalog/JobDetails, catalog/Jobs, catalog/Overview, catalog/ProductExplorer, catalog/Retailers, catalog/Stores

Extra check: all 4 system prompts in SPEC are byte-identical to the source (4/4).

**Things you should know**
- **Service-role key in the browser (confirmed):**
  - The admin stores the key in `localStorage`; every admin read and write uses it.
  - There is no admin login or identity, and `reviewed_by` is never set.
  - Activity and Receipt Lab read and update all users' data.
- **Edge functions open to anyone with the public anon key** (`verify_jwt` only checks for a JWT, and the anon key is one):
  - `enrich-content` spends OpenRouter credit (live: `moonshotai/kimi-k2.6` with web search on).
  - `process-receipt` spends credit too.
  - `lookup-product` inserts products with the service role.
- **No AI provenance or cost logging:**
  - There are no sources, confidence, model, date or rubric version on saved scores.
  - The only rubric is one line of the company prompt.
- **Destructive admin saves:** company and product editors delete and reinsert child rows on every save.
- **Unused objects:** `get_user_stats`, `user_stats_view` and `company_details_view` have no callers.

**Next:** P0.5 Write THEME.md.

---

## 2026-10-26 — P0.3 Write SPEC.md, part 1: the user app

**What changed**
- `docs/legacy/SPEC.md` (new). It covers:
  - overview (stack, config flags, navigation map, auth gate, shared UI states);
  - one section for each of the 19 route files;
  - flows F1–F9 (auth, barcode, receipt, search, history, stories, profile/settings, account deletion, community submissions);
  - every exported function in `src/lib/*-service.ts`;
  - offline cache and freshness;
  - 15 known issues and gaps.
- Part 2 (backend, AI, admin) will be appended in P0.4.

**Verification** (script checks against `LEGACY/src`)
```
route files: 19, missing: 0
exported functions: 55, missing: 0   (auth 14, cache 6, data 25, receipt 8, sync 2)
```

**Things you should know**
- **Account deletion:** fails in the live legacy app because `delete_own_account` was never applied.
- **Password reset:** has no completion screen.
- **Offline freshness check:** never works (RPC argument/shape mismatch).
- **Search pollutes History:** opening a product from search logs it as a scan.
- **Receipts:** auto-save before the user reviews the matches, and results are held only in memory.
- **Scaling:** receipt matching loads the whole products table plus every company (N+1). Fine at 13 products, not at catalogue scale.
- **Sign-in:** only email/password is live; Google, Apple and guest sit behind flags that default off.
- **For P0.12:** Phase 1 auth should include a password-reset completion screen and a working deletion RPC.

**Next:** P0.4 Write SPEC.md, part 2: backend, AI and admin.

---

## 2026-10-26 — P0.2 Export legacy content as seed JSON

**What changed**
- `docs/legacy/data/*.json`: 11 files (companies 11, brands 49, ethical_scores 55, certifications 6, boycotts 2, controversies 5, products 13, product_features 30, transparency_steps 20, impact_stories 6, app_settings 4). All rows are verbatim `row_to_json`, with UUIDs kept.
- `docs/legacy/data/README.md`: row counts, md5s, export method, quality notes for the P2 re-import.

**Verification**
- Row count of every file = live `count(*)` (all 11 equal).
- Stronger check: every file, re-serialised as `jsonb::text`, has the same md5 as `md5(jsonb_agg(to_jsonb(x) ORDER BY id)::text)` in the live DB (11/11).
- Secrets grep (JWT, `sk-`, `sbp_`, api_key, secret, password, token, bearer, service_role, email regex): 0 hits.
- Example records:
  - `brands`: `{"id":"9ae05a4b-…","name":"KitKat","slug":null,"company_id":"00000000-0000-4000-a000-000000000002",…}`
  - `controversies`: `{"title":"Water depletion in Rajasthan, India","date_text":"2022 (ongoing)","severity":"critical","source_url":null,…}`

**Things you should know**
- The legacy content has no source URLs anywhere, and the scores have no citations. Brands have no slugs, and only 1 of 13 products is linked to a brand.
- Bolthouse Farms and Sun-Brite scores are placeholders.
- Probable errors: Kashi attributed to General Mills, "Uncle Ben's", stale CEOs.
- The full list is in the README. All of this goes to the review queue on re-import (P2).

**Next:** P0.3 Write SPEC.md, part 1: the user app.

---

## 2026-10-26 — P0.1 Dump the legacy schema

**What changed**
- `docs/legacy/schema.sql`: full `public` DDL from the live legacy DB (read-only `supabase-legacy` queries): 28 tables, 41 PK/UNIQUE/CHECK + 38 FKs, 49 indexes, 2 views, 16 function bodies, 20 triggers (incl. `auth.users`), RLS + 27 policies, comments, extensions.
- `docs/legacy/SCHEMA.md`: per-table summary (purpose, key columns, FKs, RLS, rows), ER diagram, functions, triggers, storage, security notes, drift table, row counts.

**Verification**
- `CREATE TABLE` 28 = live 28.
- `CREATE POLICY` 27 = live 27.
- Functions: 16 `CREATE FUNCTION` + 31 owned by `pg_trgm` (installed in `public`) = live 47.
- Extra checks: the md5 of all 16 function bodies matches `pg_proc.prosrc` (CR stripped); 293 columns = live 293.

**Things you should know**
- Drift: 14 of the 28 tables (the whole base schema: companies, products, profiles, scans, etc.) exist only in the live DB. No legacy migration creates them, so `schema.sql` is now their only record.
- `delete_own_account` (migration 20260806120000) was **never applied**, so the legacy app's account deletion can't work. `check_content_freshness` was applied by hand (not in migration history).
- Security: `user_stats_view` (owner rights, readable by anon) and `get_user_stats(any uuid)` (SECURITY DEFINER, executable by anon) expose every user's scan stats. The rebuild should use `security_invoker` views and `auth.uid()`-scoped RPCs.
- No storage buckets; no admin role in the DB.

**Next:** P0.2 Export legacy content as seed JSON.

---

## 2026-10-26 — Planning session (no task ID)

**What changed**
- Wrote `docs/PLAN.md`: Phase 0 in full detail (P0.1–P0.12), Phases 1–10 as milestone outlines, each starting with a refinement task.
- Wrote `docs/DECISIONS.md` (D-001 to D-011).
- Added `.gitignore`.
- Pointed `.claude/settings.json` `additionalDirectories` at the real legacy app.
- First commit.

**What the skim found**
- The configured legacy path was an empty skeleton. The real legacy app is `MobileDev/Ethical-App`: an Expo SDK 54 user app (19 route files), `admin/` (Vite + React 18 SPA, 19 pages), `catalog-worker/` (Node + Playwright, Fortinos only), and 3 edge functions (`process-receipt`, `enrich-content`, `lookup-product`) calling OpenRouter.
- The legacy DB is small: 11 companies, 49 brands, 13 products, 55 ethical_scores, 6 stories, 96 Fortinos catalog products, 1 store, 3 profiles, about 14 MB in total. Data migration is a small seed, not a migration project.
- The `supabase-dev` project is empty.
- Red flags for the rebuild: the admin SPA used a service-role client in the browser; the Fortinos scraper got around Akamai by attaching to a real Chrome session (dropped, D-002); there are two separate product tables (D-008).

**Owner answers**
- Legacy path: MobileDev/Ethical-App only.
- Prices: permitted sources plus receipts, no workarounds.
- Scheduling: GitHub Actions on a public repo.
- Ratings: keep the legacy model.

**Open decisions (🟡 in PLAN)**
- A legacy login for the baseline screenshots (P0.6).
- Per-retailer source approvals after P0.10.
- Rubric v1 approval and the auto-publish rule (Phase 7).
- Receipt-price consent (Phase 8).
- Admin-triggered runs via a GitHub token (Phase 5).
- Hosting and Android distribution (Phase 10).

**Note**
- Restart Claude Code so the new `additionalDirectories` path takes effect.

**Next:** P0.1 Dump the legacy schema.
