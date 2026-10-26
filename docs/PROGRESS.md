# Progress log

Newest entry first.

---

## 2026-10-26 — P0.9 Write a frank review of the legacy catalog and scraper

**What changed**
- `docs/legacy/CATALOG_REVIEW.md`:
  - a summary and the legacy catalog's real numbers (read-only DB counts);
  - test and typecheck state;
  - keep/adapt/drop tables for all 48 `catalog-worker/src/` files, the 3 edge functions plus `match_receipt_items`, and the admin catalog pages and tools;
  - a concepts table (including why the Akamai/CDP workaround is dropped);
  - lessons, and inputs for P0.10, P0.11, P2 and P4.

**Verification**
- File-list diff: 48/48 `catalog-worker/src/` files have a table row (0 missing). There are rows for 3/3 edge functions and 7/7 `admin/src/pages/catalog/` pages, plus `BulkBrandLink` and `enrich.ts`.
- Legacy tests (`npx vitest run` in `LEGACY/catalog-worker`): **8 files, 61 tests, 61 passed, 0 failed.**
- `npx tsc --noEmit`: **6 errors**, all DOM types in `fortinos/client.ts`.
- No network scraping. The legacy DB was read with `select` only. Legacy `git diff` hash unchanged (`6f0b037…`).

**Things you should know**
- **What legacy actually ingested:** 96 Fortinos products from 2 categories, exactly 48 each. That means pagination never got past page 1.
  - 0 of the 96 have a UPC, so none link to a rated product.
  - 7 of 12 scrape jobs failed on Akamai blocks.
- **Worth porting:** the generic plumbing (errors, retry, logger, env, safeguards, change-only price history, conservative deactivation) and the pure parsing helpers.
- **Dropped:** all Fortinos access code (D-002).
- **Your call:** the legacy folder has a full Chrome profile with live cookies at `catalog-worker/.fortinos-cdp-profile/` (gitignored). You may want to delete it yourself. I can't edit the legacy folder.
- No new decisions or plan tasks. The review's suggestions feed P0.10, P0.11 and Phase 2, which are already planned.

**Next:** P0.10 Research and compare catalog sources → SOURCES.md.

---

## 2026-10-26 — P0.8 Capture baseline screenshots: admin portal

**What changed**
- `docs/baseline/admin/`: 22 full-page PNGs at 1440 × 900 (1.9 MB): the not-connected gate plus every admin route (product and company editors in both new and existing modes).
- `docs/baseline/README.md`: an admin section covering method, the anon-key rationale, a page file → route → screenshot → state table, and the console log.

**Verification**
- One screenshot or stated reason per page file in `LEGACY/admin/src/pages/`: 19/19 (script). All referenced files exist and none are unreferenced.
- Opened at random: 02-products, 04-product-editor-existing, 15-catalog-overview. Also checked 01, 09, 12, 14 and 20. One README row was corrected after viewing (Receipt Lab's default tab).
- Console: the only error is `favicon.ico` 404. There are 21 warnings, all React Router v7 future-flag notices.
- Browse only: no save, enrich, delete, link, look-up or job actions. Legacy repo git status and diff hash identical.

**Things you should know**
- **Anon key only:** I connected the admin with the *public anon key*, not the service role. The legacy admin needs the service-role key in the browser for most pages, but that would give a tool write access to production data (CLAUDE.md "Don'ts").
  - The key was injected without being printed; its role was checked to be `anon`; the connection was removed and the browser closed afterwards.
- **Empty pages:** editorial pages show real data. User data, `app_settings` and every Retailer Catalogue page show empty states because RLS returns no rows to anon. Older data-filled admin shots taken with a service-role key exist in `LEGACY/playwright-admin-audit-screenshots/` as hints.
- **If you want filled captures** of those pages, a service-role session would be your call. It would break the no-write-access rule, so I haven't added it to the plan. The rebuilt admin (Phase 5) will have its own data and screenshots anyway.

**Next:** P0.9 Write a frank review of the legacy catalog and scraper.

---

## 2026-10-26 — P0.7 Capture baseline screenshots: user app on Android

**What changed**
- `docs/baseline/android/`: 34 PNGs at 640 × 1428 (half of the Pixel 10 Pro emulator's 1280 × 2856), 5.1 MB.
  - Same screen set as web, plus the barcode camera: the system permission prompt and the scanner modal.
- `docs/baseline/README.md`:
  - Android column filled for all 20 rows;
  - a "How the Android set was captured" section;
  - an "Android vs web — differences" section (native ← headers, status and gesture bars, tab bar overlapping Home cards, Roboto vs browser font, taller screen, working camera, Profile as a full-screen card, console).

**Verification**
- `adb devices` → `emulator-5554` (Pixel_10_Pro, Android 17). Expo Go wasn't installed; Expo installed it.
- The README Android column has a file or reason for every row (20/20, 0 placeholders left). All 34 files exist and are referenced.
- Opened at random: 07-search-empty, 29-privacy, 25-profile (redacted). Also checked 03, 05c, 12, 15, 19, 21 and 26.
- Device console (Metro log): only the known `check_content_freshness` warning ×23, plus one LayoutAnimation no-op warning (New Architecture).
- Legacy repo: `git status` and diff hash identical to the pre-P0.6 snapshot. No DB writes:
  - screens opened via `exp://…/--/` deep links;
  - the sign-up form was only toggled, never submitted;
  - the camera modal was closed with nothing scanned (Recent Impact unchanged).

**Things you should know**
- **Emulator changes:** Expo Go is now installed on the emulator, and the camera permission was granted "only this time".
- **Redaction (D-012):** done in the image (paint over + placeholder text) since there's no DOM on Android. Raw full-resolution captures stayed in the scratchpad.
- **Tooling:** `uiautomator dump` can't run while the mobile MCP is attached (it's killed with exit 137), so element bounds came from the MCP list.
- **Password:** you can now change the legacy account password you shared in chat. P0.8 (admin) doesn't need the user account.

**Next:** P0.8 Capture baseline screenshots: admin portal.

---

## 2026-10-26 — P0.6 Capture baseline screenshots: user app on web

**What changed**
- `docs/baseline/web/`: 33 PNGs at 390 × 844 covering every user-app route.
  - Logged out: sign-in, sign-up.
  - Logged in: home, scan, search (empty/results/no results), history (+ filter), receipt detail, product (+ scrolled, alternatives, not found), company (top/mid/bottom, sparse profile), stories, story, receipt scan, receipt results (empty), profile, settings ×3, privacy ×2, help, about.
- `docs/baseline/README.md`: capture method; a route → web file → Android file → notes table; "not captured: requires write" reasons; console log.
- `docs/DECISIONS.md`: D-012 (no personal data in screenshots, fixtures or logs).
- `docs/legacy/SPEC.md`: known issue 16 (`Alert.alert` is a no-op on web, so web barcode scanning is a silent dead end).
- `.gitignore`: `.playwright-mcp/`.

**Verification**
- The README table has a web file or a stated reason for all 19 route files in SPEC part 1 (script: 19/19, 0 missing).
- All 33 referenced files exist; none are unreferenced.
- Opened at random: 29-privacy, 25-profile, 19-company-sparse. The first pass caught two bad captures (mid-animation, still loading), so the whole set was recaptured with a spinner-gone + 1.5 s settle and re-checked, along with 01, 08, 12, 21 and 28.
- Console: the only error is the known `check_content_freshness` 404 (signature mismatch); otherwise just react-native-web deprecation warnings.
- Legacy repo: `git status` and the diff hash were identical before and after. No DB writes: products opened by URL, no scans, submissions, receipts or saves.

**Things you should know**
- **Credentials:**
  - Your legacy password was reset to the one you shared in chat. Consider changing it once P0.7 (Android) is done.
  - The credentials appear in no file; the one Playwright log containing them was deleted.
- **Redacted screenshots:** your name and email are replaced with "Alex" / `you@example.com` (D-012).
- **Not capturable without writes:** sign-up "check inbox", scan result card, populated receipt results, request-sent states, empty history.
- **Web camera is a dead end:** on web, Scan Barcode silently does nothing. Android (P0.7) should capture the camera.

**Next:** P0.7 Capture baseline screenshots: user app on Android (the emulator is running).

---

## 2026-10-26 — P0.5 Write THEME.md

**What changed**
- `docs/legacy/THEME.md` (new). It covers:
  - all M3 colour tokens with hex, usage counts and roles; hard-coded colours; the tint convention;
  - grade and rating colour maps;
  - `AppColors` and `Radius`, plus the unused `theme.ts` template tokens;
  - fonts, the measured type scale, spacing, shadows, icons;
  - tab bar, headers, status-bar scrim, motion;
  - a spec for each of the 9 `components/ui` files and every home/search/history/scan card, plus screen-level patterns;
  - the admin portal palette;
  - the Stitch designs as a secondary reference.
- `docs/PLAN.md`: ticked P0.5; added a 🟡 font decision under the Phase 1 theme milestone.

**Verification** (script against `LEGACY/src/constants/{colors,theme}.ts` and `src/components/ui/`)
```
src/constants/colors.ts: 90 keys checked
src/constants/theme.ts: 27 keys checked
token keys: 117, missing: 0
ui components: 9, missing: 0
```

**Things you should know**
- **Fonts:** legacy loads no custom fonts; everything renders in system fonts, with heavy weights (900 heroes) carrying the look. The Stitch mocks use Epilogue and Public Sans. The rebuild defaults to system fonts; the alternative is a 🟡 decision in Phase 1.
- **Design is flat:** cards have no shadows; separation comes from white cards on the warm `#fcf9f4` surface. The only shadow is on the tab bar.
- **Admin palette:** the admin uses its own palette (accent `#157a4e`, Inter), not the app's `#173809` green. Whether to align them is flagged for P5.0.
- **Unused tokens:** `theme.ts` is unused template code, and several M3 tokens have 0 uses.

**Next:** P0.6 Capture baseline screenshots: user app on web. It needs your decision on a legacy login before the logged-in screens.

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
