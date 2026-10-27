# Sarvis rebuild plan

Single source of truth for what comes next. Work one task per session (`/next`), save state with `/handoff`.

**Legend**
- `[ ]` / `[x]` — open / done (done only when its verification passed)
- 🟡 **Decision** — needs an answer from the owner before the task starts (or before the marked step)
- **Deps** — task IDs that must be ticked first

**Ground rules that apply to every task** (from `CLAUDE.md`): never edit the legacy folder, never write to the legacy Supabase project, migrations only to `supabase-dev`, RLS on every table, provenance on every fact, free tiers only, `testID` on every interactive element, screenshots to `.screenshots/`.

**Legacy reference:** `C:/Users/lukam/Coding Projects/MobileDev/Ethical-App` (see D-001). Short name below: `LEGACY/`.

---

## Free-tier risk register

Every phase must keep these in view. Phase 0 (P0.11) turns them into numbers.

| Limit | Risk | Mitigation |
|---|---|---|
| Supabase DB 500 MB | Open Food Facts has hundreds of thousands of products; price history grows without bound. | Import only the Canadian subset and only the columns we use. Write a price row only when the price changes, and roll up history older than 90 days to monthly. Budget: catalog ≤ 350 MB, alarm at 400 MB. The quality dashboard shows DB size. |
| Supabase Storage 1 GB | Raw scraper responses and receipt images. | Gzip all raw data. Keep the last 3 runs per source and 30 days at most. Never store bulk dumps (OFF, Wikidata) in Supabase: process them on the Actions runner and keep only the filtered extract's hash and URL. Downscale receipt images and delete them after parsing unless the user opts in. Budget ≤ 700 MB, alarm at 800 MB. |
| Supabase pauses after 7 idle days | Breaks the app and the jobs. | The daily scheduled pipeline run counts as activity. Add an explicit keep-alive step (P6). |
| GitHub Actions (public repo, D-003) | Minutes are unlimited, but the code and logs are public. | Secrets go only in Actions secrets. Logs never print row data that contains user information. Scraped data is never committed. |
| OpenRouter hard spend cap | Batch scoring could drain it. | Cheap default model, per-run token budget, a cost log per call, and a dry-run/mock mode. |
| Edge Functions | 150 s wall clock; free invocation quota. | Edge functions do only user-facing request/response work (receipt parse, lookup). Batch work runs in Actions. |

---

## Phase 0 — Legacy audit and research (full detail)

Goal: know exactly what the legacy app does and looks like, what the catalog sources allow, and what the new data model must hold, before any code is written.

### [x] P0.1 Dump the legacy schema
- **Goal:** capture the complete legacy database schema as SQL plus a readable summary.
- **Deps:** none.
- **In:** every table, column, type, default, constraint, index, view, function/RPC (with body), trigger, RLS policy, storage bucket, extension, and current row counts. Use read-only `supabase-legacy` MCP queries against `pg_catalog`/`information_schema`, plus `list_migrations`. Compare with the 11 files in `LEGACY/supabase/migrations/` and note drift: tables whose base schema exists only in the live DB.
- **Out:** no data export (P0.2). No writes of any kind to the legacy project.
- **Files:** `docs/legacy/schema.sql`, `docs/legacy/SCHEMA.md` (one section per table: purpose, key columns, FKs, RLS summary, row count; then functions, triggers, buckets, drift notes).
- **Verification:**
  - The number of `CREATE TABLE` statements in `schema.sql` equals the `public` table count from `list_tables` (28 at planning time).
  - The number of `CREATE POLICY` statements equals `select count(*) from pg_policies where schemaname='public'`.
  - The number of functions equals the count of `public` functions in `pg_proc`.
  - Report the three counts in PROGRESS.

### [x] P0.2 Export legacy content as seed JSON
- **Goal:** save the legacy editorial content so it can be re-imported into the new schema later (P2) with `legacy-import` provenance.
- **Deps:** P0.1.
- **In:** companies, brands, ethical_scores, certifications, boycotts, controversies, products, product_features, transparency_steps, impact_stories, and the non-secret `app_settings` rows. Read-only `select` via `supabase-legacy`.
- **Out:** all user data (profiles, scan_history, receipt_scans, receipt_items, community_submissions): privacy, and the rebuild starts with fresh accounts. Also out: legacy `catalog_products`/`store_products` (96 Fortinos rows, which P3 re-sources properly) and importing anything.
- **Files:** `docs/legacy/data/<table>.json`, `docs/legacy/data/README.md` (row counts, export date, notes on quality).
- **Verification:** the row count in each JSON file equals a live `count(*)` for that table. Show two example records. `grep` finds no keys, tokens or emails in the export.

### [x] P0.3 Write SPEC.md, part 1: the user app
- **Goal:** document every screen and flow of the legacy user app.
- **Deps:** none.
- **In:** every route under `LEGACY/src/app/` (19 files). For each: purpose, entry points, data read and written (tables, RPCs, edge functions), components used, loading/empty/error states, auth requirement, and navigation out. Also cover the flows end to end: sign-up/sign-in (which providers), barcode scan, receipt scan → results → save, search, history and filters, stories, profile/settings, account deletion. Cover the services in `LEGACY/src/lib/` (data, sync, cache, receipt, auth) and how offline caching and freshness checks work.
- **Out:** edge function internals and the admin portal (P0.4). Theme (P0.5).
- **Files:** `docs/legacy/SPEC.md` (sections "User app: screens" and "User app: flows").
- **Verification:**
  - A script or `ls` check confirms that every file under `LEGACY/src/app/` has a SPEC section.
  - Every exported function in `LEGACY/src/lib/*-service.ts` is named in SPEC.
  - Paste the check output into PROGRESS.

### [x] P0.4 Write SPEC.md, part 2: backend, AI and admin
- **Goal:** document the legacy backend contracts and the admin portal.
- **Deps:** P0.1, P0.3.
- **In:**
  - The 3 edge functions (`process-receipt`, `enrich-content`, `lookup-product`): request/response shapes, every OpenRouter prompt quoted verbatim with its expected JSON response shape, model chains and fallbacks, `app_settings` keys, and error cases.
  - RPCs the app calls (e.g. `match_receipt_items`, `check_content_freshness`, `delete_own_account`).
  - An RLS summary per table, taken from P0.1.
  - Every admin page in `LEGACY/admin/src/pages/` (19): features, data touched, and which key it uses. Flag any use of the service-role key in the browser.
  - A one-paragraph pointer to the catalog-worker (detail goes in P0.9).
- **Out:** judgments on what to keep (P0.9).
- **Files:** `docs/legacy/SPEC.md` (sections "Edge functions", "AI prompts", "RPCs", "RLS", "Admin portal").
- **Verification:** each of the 3 edge functions, every `fetch(...openrouter...)` call site (find with `grep -rn openrouter LEGACY/supabase LEGACY/admin/src LEGACY/src`), and every admin page file maps to a SPEC section. List the mapping in PROGRESS.

### [x] P0.5 Write THEME.md
- **Goal:** record the legacy visual language precisely enough to rebuild it without redesigning.
- **Deps:** none.
- **In:**
  - All tokens in `LEGACY/src/constants/colors.ts` and `theme.ts`, and `global.css`.
  - Grade and rating colour maps.
  - Fonts: families, weights, and how they are loaded.
  - The type scale, spacing, radii, shadows/elevation, and icon set.
  - The tab bar, headers and status-bar scrim.
  - Component specs for every file in `LEGACY/src/components/ui/` plus the cards in `components/home`, `search`, `history` and `scan`.
  - A short note on the admin portal's look (`LEGACY/admin/src/index.css`).
  - `LEGACY/stitch-designs/*.html` as a secondary reference.
- **Out:** screenshots (P0.6–P0.8).
- **Files:** `docs/legacy/THEME.md`.
- **Verification:** a small script lists every exported token key in `colors.ts`/`theme.ts` and confirms that each one appears in THEME.md (0 missing). Every `components/ui/*.tsx` file has a section.

### [x] P0.6 Capture baseline screenshots: user app on web
- **Goal:** visual targets for every legacy user screen on web.
- **Deps:** P0.3.
- 🟡 **Decision/action:** logged-in screens need a legacy account. Either you log in yourself in the Playwright browser when prompted, or you give me a test account. Creating a new account would be a write to the legacy project, so I won't do it.
- **In:** run the legacy app read-only (`npx expo start --web` in `LEGACY/`; no file edits; use its existing `.env` without printing it). Use a 390×844 viewport. Capture logged-out and logged-in states for every route in SPEC part 1, plus key states (empty history, search results, product, company, receipt results) where they can be reached without writing data. Record console errors.
- **Out:** any action that writes to the legacy DB (no saving scans, no submissions, no receipt uploads). Note those states as "not captured: requires write".
- **Files:** `docs/baseline/web/NN-<screen>.png`, `docs/baseline/README.md` (table: screen → route → web file → Android file → notes).
- **Verification:** the README table has a web file, or a stated reason, for every route in SPEC part 1. Open 3 random PNGs to confirm they're the right screens.

### [x] P0.7 Capture baseline screenshots: user app on Android
- **Goal:** the same screen set on the Android emulator.
- **Deps:** P0.6.
- **In:** `adb devices` confirms the emulator. Run the legacy app in Expo Go (as in the legacy audit). Use the mobile MCP to navigate and save the screenshots. Same login rule as P0.6.
- **Out:** iOS, and actions that write data.
- **Files:** `docs/baseline/android/NN-<screen>.png`, and fill the Android column in `docs/baseline/README.md`.
- **Verification:** the README Android column is filled or reasoned for every row. Note differences from web (safe areas, tab bar, camera).

### [x] P0.8 Capture baseline screenshots: admin portal
- **Goal:** visual and feature reference for every legacy admin page.
- **Deps:** P0.4.
- **In:** run `LEGACY/admin` with `npm run dev` (Vite) read-only. Use a 1440×900 viewport, one screenshot per page in `LEGACY/admin/src/pages/`. **Browse only:** do not click save, enrich, delete, bulk link, or create job.
- **Out:** any write action. Don't run the catalog-worker.
- **Files:** `docs/baseline/admin/NN-<page>.png`, and an admin section in `docs/baseline/README.md`.
- **Verification:** one screenshot or reason per admin page file (19). Console errors are recorded.

### [x] P0.9 Write a frank review of the legacy catalog and scraper
- **Goal:** decide what to keep, adapt or drop from the legacy catalog code and data tools.
- **Deps:** P0.1, P0.4.
- **In:**
  - `LEGACY/catalog-worker/src/**`: provider interface, Fortinos provider, job claim loop, safeguards, normalizer, batched upserts, price history.
  - The Akamai/CDP session-attach workaround. Per D-002 it's dropped; document why.
  - `lookup-product` (OFF lookup and auto-draft), `match_receipt_items` (aliases, trigram), and `enrich-content` validation.
  - The admin catalog pages and bulk tools (`BulkBrandLink`, `enrich.ts`, `ProductExplorer`, `Jobs`).
  - The split between the ethical `products` table and the grocery `catalog_products` table.
  - Run the legacy worker's unit tests (`npm test` in `LEGACY/catalog-worker`) to see their state. No network scraping.
- **Out:** writing new code.
- **Files:** `docs/legacy/CATALOG_REVIEW.md`, with a keep/adapt/drop table (file or concept → verdict → reason → where it goes in the rebuild) and a "lessons" section.
- **Verification:** the table covers every file in `catalog-worker/src/` (check with a file-list diff), the 3 edge functions, and the admin catalog pages. The legacy test result (pass/fail counts) is recorded.

### [x] P0.10 Research and compare catalog sources → SOURCES.md
- **Goal:** pick the data sources before writing any scraper.
- **Deps:** none (P0.9 helps).
- **In:** for each source, record: what it provides, licence, terms on automated access (quote plus URL), robots.txt summary, access method (bulk dump / API / HTML / internal JSON), auth needs, rate limits, Ontario coverage, freshness, key fields, estimated row count and size, and a verdict (**use** / **ask owner** / **avoid**). Candidates:
  - **Products:** Open Food Facts (dump and API), UPCitemdb free tier, GS1 Canada (paid, so note only).
  - **Prices:** Open Prices (OFF), Statistics Canada average retail prices (sanity reference).
  - **Retailers:** Loblaw banners (PC Express, Loblaws, No Frills, Fortinos, Zehrs, Real Canadian Superstore), Sobeys/Voilà/FreshCo/Foodland, Metro/Food Basics, Walmart.ca, Costco.ca, Longo's, Farm Boy, Giant Tiger. Also flyer aggregators (Flipp, Reebee).
  - **Ownership:** Wikidata (SPARQL and dumps), Wikipedia, SEC EDGAR Exhibit 21 subsidiaries, Corporations Canada open data, OpenCorporates.
  - **Ratings evidence and articles:** GDELT, publisher RSS, Google News RSS, NewsAPI free tier, B Corp directory, Fairtrade, KnowTheChain, Ethical Consumer (paid, so note only).
  - Only read terms pages and robots.txt; run no scrapers.
- **Out:** building scrapers. Checking the legality of any workaround for bot protection: those sources are marked **avoid** per D-002.
- **Files:** `docs/catalog/SOURCES.md`, ending with a **Decisions for owner** list.
- **Verification:**
  - Every source row has every column filled, or "unknown" with a reason.
  - Every terms claim has a URL and the date checked.
  - The decisions list exists and names each "ask owner" source.
  - ✅ The owner answered the decisions list on 2026-10-26 (D-013): no retailer sources. The User-Agent contact and commercial status were answered on 2026-10-27 (D-015).

### [x] P0.11 Design the catalog data model and free-tier budget
- **Goal:** a target schema design, with sizes, that satisfies every catalog rule in `CLAUDE.md`.
- **Deps:** P0.1, P0.9, P0.10.
- **In:**
  - **Entities:** companies; company ownership edges (parent/child, share, valid_from/to); brands; brand ownership; products (one table, see D-008); product identifiers (GTIN/UPC/PLU/store SKU); categories (taxonomy and source mappings); retail chains, banners and stores; store listings; price observations (append on change); sources; ingestion runs; raw objects; match candidates and decisions; scores and score citations; articles; the review queue; AI call log.
  - The standard provenance columns (`source_url`, `fetched_at`, `method`, `method_version`).
  - Slug and stable-key rules.
  - RLS intent per table: public read / owner / admin.
  - Size estimates per table at target coverage, using the P0.10 numbers.
  - The raw-data storage and retention plan (D-010).
  - Budget thresholds and alarms.
- **Out:** writing migrations (P2).
- **Files:** `docs/catalog/DATA_MODEL.md` (an ER diagram in Mermaid, plus tables), `docs/catalog/BUDGET.md`.
- **Verification:**
  - A checklist table maps every rule in `CLAUDE.md` → "Catalog and data rules" to a schema element (0 unmapped).
  - Estimated totals are ≤ 350 MB DB and ≤ 700 MB storage at target coverage. If not, the doc states what gets cut.
  - Every field marked "key" in SOURCES.md has a home in the model.

### [x] P0.12 Refine Phase 1 into session-sized tasks
- **Goal:** turn the Phase 1 outline into tasks in the same format as Phase 0, and update the later phase outlines with what the audit found.
- **Deps:** P0.1–P0.11.
- **In:**
  - Full task detail for Phase 1 (ID, goal, deps, in/out, files, verification).
  - Confirm or amend the proposed decisions D-005, D-007, D-008, D-009 and D-010.
  - Adjust the milestones of Phases 2–10 if the audit changed anything.
  - List open 🟡 decisions.
- **Out:** detailing Phase 2 and later (each phase's own `.0` task does that).
- **Files:** `docs/PLAN.md`, `docs/DECISIONS.md`.
- **Verification:**
  - Every Phase 1 task has all seven fields.
  - No task touches more than one feature slice.
  - Every Phase 1 milestone below is covered by at least one task.
  - Show the owner the list of open decisions.

---

## Phase 1 — Foundation (full detail)

**Exit:**
- The app runs on web and Android.
- Email sign-in works.
- Non-admins can't open `/admin`.
- CI is green.
- The Commands table in `CLAUDE.md` is filled in.

- [x] **P1.0 Refine Phase 1** → done by P0.12.

**Milestones** (each one maps to tasks in the coverage table at the end of this phase):
- **M1 Repo scaffold:** npm workspaces (D-007), Expo SDK 54 + Expo Router + strict TS, ESLint, Prettier, Vitest, Playwright e2e for web, `.env.example`.
- **M2 CI workflow:** typecheck, lint and unit tests on push/PR (GitHub Actions).
- **M3 Supabase wiring:** migrations folder, type-generation script, base schema (`profiles` with `role`, an `is_admin()` security-definer helper), RLS. No service-role key in any client.
- **M4 Auth:** providers per SPEC (email first; others as separate tasks, Apple likely out on Android/web). Account deletion RPC.
- **M5 Theme and UI primitives** from THEME.md (GradeBadge, RatingPill, ScoreRing, cards, chips, buttons, empty/error states), with a component gallery route for screenshot checks.
  - ✅ **Decided (D-015):** system fonts, matching legacy. The Stitch fonts (Epilogue, Public Sans) are not loaded.
- **M6 App shell:** tabs and stack routes as placeholders whose layout matches the baseline. Web-only `/admin` route group gated by role (D-005).

**Feature slices** (each task touches exactly one): `tooling`, `ci`, `db-foundation`, `theme`, `ui-primitives`, `navigation`, `auth`, `account-deletion`, `admin-gate`, `release-check`.

### [x] P1.1 Scaffold the npm workspace and root tooling
- **Slice:** tooling.
- **Goal:** a root npm workspace with strict TypeScript, ESLint, Prettier and Vitest working before any app code exists.
- **Deps:** P0.12.
- **In:**
  - Root `package.json` with workspaces `app`, `packages/core`, `pipeline` (D-007). `app/` stays an empty placeholder until P1.2. `packages/core` and `pipeline` get a `package.json`, a `src/index.ts` and one smoke test each.
  - `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`).
  - ESLint flat config with typescript-eslint; Prettier config; Vitest workspace config.
  - Root scripts: `typecheck`, `lint`, `format`, `test`, `clean` (rimraf, cross-platform).
  - `.env.example` with placeholders and comments only, no values: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_DEV_SERVICE_ROLE_KEY` (dev-only scripts, never in the app).
  - `.gitignore` confirmed for `node_modules`, `.env*` (except `.env.example`), `.expo`, `dist`, `coverage`.
  - A DECISIONS entry listing every new dependency with its reason (CLAUDE.md "no new dependencies without a reason").
- **Out:** the Expo app (P1.2), Playwright (P1.3), CI (P1.4), Supabase (P1.5).
- **Files:** `package.json`, `package-lock.json`, `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `vitest.config.ts` (projects; workspace files were removed in Vitest 4, D-016), `packages/core/**`, `pipeline/**`, `.env.example`, `.gitignore`, `docs/DECISIONS.md`, `CLAUDE.md` (Commands).
- **Verification:**
  - `npm install` from a clean clone, then `npm run typecheck`, `npm run lint` and `npm test`, all exit 0. Paste the output tails into PROGRESS.
  - A deliberately broken file makes `typecheck` and `lint` fail. Revert it, and record the check.
  - CLAUDE.md Commands rows Install, Typecheck / lint and Unit tests are filled.

### [x] P1.2 Create the Expo app (SDK 54, Expo Router, strict TS)
- **Slice:** tooling.
- **Goal:** an Expo SDK 54 app in `app/` that starts on web and on the Android emulator from the workspace.
- **Deps:** P1.1.
- **In:**
  - `create-expo-app` (SDK 54 template with Expo Router) inside `app/`. Extends `tsconfig.base.json`, typed routes on.
  - App name "Sarvis", scheme `sarvis`, Android package `com.lukams.sarvis` (changeable before any store build), web output `static`.
  - One placeholder screen with `testID="placeholder-home"`.
  - Metro works with npm workspaces: shared `packages/core` imports resolve.
  - Scripts `npm run web` and `npm run android` from the root.
- **Out:** theme, navigation shell (P1.9), Supabase client (P1.10). No legacy code copied wholesale.
- **Files:** `app/**` (app.json, package.json, tsconfig.json, `src/app/_layout.tsx`, `src/app/index.tsx`, metro config if needed), root `package.json` scripts, `CLAUDE.md` (Commands).
- **Verification:**
  - **Web:** `npm run web`, open http://localhost:8081 with the Playwright MCP, screenshot to `.screenshots/p1.2-web.png`, 0 console errors.
  - **Android:** `adb devices` shows the emulator; the app opens in Expo Go; mobile MCP screenshot to `.screenshots/p1.2-android.png`.
  - The screen imports a constant from `packages/core` and renders it, which proves workspace resolution.
  - `npm run typecheck` and `npm run lint` pass. Commands rows Start web and Start Android are filled.

### [x] P1.3 Add the Playwright web e2e harness
- **Slice:** tooling.
- **Goal:** `npm run e2e` starts Expo web and runs browser tests, for use by every later UI task.
- **Deps:** P1.2.
- **In:**
  - `@playwright/test` (Chromium only), with a config whose `webServer` starts Expo web on port 8081 (reusing a running server locally).
  - A 390 × 844 viewport project (baseline size) and one smoke test that finds `placeholder-home`.
  - Test output folders gitignored.
- **Out:** CI e2e (later; CI runs unit tests only in Phase 1), auth tests (P1.10).
- **Files:** `playwright.config.ts`, `e2e/smoke.spec.ts`, `e2e/tsconfig.json`, root `package.json`, `.gitignore` (already covered), `.prettierignore`, `CLAUDE.md` (Commands).
- **Verification:**
  - `npm run e2e` passes (paste the summary).
  - Changing the expected testID makes it fail. Revert it, and record the check.
  - Commands row E2E (web) is filled.

### [x] P1.4 Set up the GitHub repo and CI workflow
- **Slice:** ci.
- **Goal:** every push and PR runs typecheck, lint and unit tests on GitHub Actions.
- **Deps:** P1.3.
- ✅ **Decided (D-015):** `gh` is installed and logged in as LukaMS. Create the public repo `LukaMS/sarvis` (D-003). **The first push is outward-facing, so ask before pushing.**
- **In:**
  - `.github/workflows/ci.yml`: triggers on `push` and `pull_request`; Node 22; `npm ci` with the npm cache; `npm run typecheck`, `npm run lint`, `npm test`; a concurrency group that cancels superseded runs.
  - No secrets used. Default branch `main` (the local `master` is renamed or mapped).
- **Out:** e2e in CI, scheduled pipeline workflows (Phase 6), deploys.
- **Files:** `.github/workflows/ci.yml`, `docs/PROGRESS.md` (run link).
- **Verification:**
  - A push triggers a green Actions run. Put the run URL in PROGRESS.
  - A branch push with a lint error shows a red run. Revert it, and record both URLs.

### [x] P1.5 Supabase base schema: profiles, roles, `is_admin()`, RLS and type generation
- **Slice:** db-foundation.
- **Goal:** the dev project has the base schema with RLS, and TypeScript types are generated into the shared package.
- **Deps:** P1.1.
- **In:**
  - `supabase/migrations/` with timestamped files, plus `supabase/README.md` (naming, apply via `supabase-dev` MCP only, never the legacy project).
  - Migration `…_profiles_and_roles.sql`:
    - `profiles` (`id` → `auth.users` on delete cascade, `display_name`, `role` check `user` | `admin` default `user`, `share_prices_consent`, `consent_at`, timestamps; DATA_MODEL §3.9);
    - `handle_new_user` trigger (security definer, fixed `search_path`);
    - `is_admin()` (security definer, stable, fixed `search_path`);
    - RLS: users select and update only their own row, can't change `role` (column privilege or trigger), and admins select all. No anon access.
  - Types generated with the `supabase-dev` MCP `generate_typescript_types` into `packages/core/src/db/database.types.ts`, plus a root script stub `db:types` that documents the MCP step. A CLI-based script is optional only if you provide a personal access token, which isn't needed by default.
- **Out:** catalog tables (Phase 2), account deletion (P1.11), the app client (P1.10).
- **Files:** `supabase/migrations/*_profiles_and_roles.sql`, `supabase/README.md`, `packages/core/src/db/database.types.ts`, `CLAUDE.md` (Commands: Generate Supabase types).
- **Verification:**
  - `list_migrations` on supabase-dev shows the migration.
  - `get_advisors` (security) reports 0 issues for the new objects.
  - SQL checks via `execute_sql`, each in a transaction with `set local role` + `request.jwt.claims`:
    - anon reads 0 rows;
    - user A reads only A's row;
    - A's `update … set role='admin'` fails or is a no-op;
    - `is_admin()` is false for A and true for a test admin.
  - Paste the results.
  - `grep -ri service_role app packages` finds nothing. `npm run typecheck` passes with the generated types.

### [x] P1.6 Theme tokens from THEME.md
- **Slice:** theme.
- **Goal:** one typed theme module holding every colour, grade, rating, radius, spacing, type and elevation token that legacy actually uses.
- **Deps:** P1.2.
- **In:**
  - `app/src/theme/`: `colors.ts` (M3Colors plus the used AppColors), `grades.ts` (GradeColors, `scoreToGrade` thresholds per D-004), `ratings.ts` (RatingColors), `radius.ts`, `spacing.ts`, `typography.ts` (system font, weights 500–900 per THEME.md), `elevation.ts`, `index.ts`.
  - Unused legacy template tokens (THEME.md "all unused") are left out.
  - Fonts: system fonts (D-015).
- **Out:** components (P1.7, P1.8), dark mode (legacy has none).
- **Files:** `app/src/theme/**`, `app/src/theme/theme.test.ts`, `app/vitest.config.mts`, root `vitest.config.ts` (adds the `app` project).
- **Verification:**
  - A Vitest test parses THEME.md's token tables and asserts that every listed key used by legacy exists in the theme with the same value: 0 missing, 0 mismatched. Paste the output.
  - A `scoreToGrade` boundary test passes.
  - `npm run typecheck` and `npm run lint` pass.

### [ ] P1.7 Rating primitives and the component gallery route
- **Slice:** ui-primitives.
- **Goal:** GradeBadge, RatingPill, ScoreRing and SectionHeader rebuilt to THEME.md, shown on a dev-only gallery screen.
- **Deps:** P1.6.
- **In:**
  - `app/src/components/ui/` GradeBadge (all grades and sizes), RatingPill (Good / Mixed / Poor), ScoreRing (0–100 with track colour), SectionHeader. Each has a `testID` prop.
  - Route `/dev/gallery` that renders every variant. It's available only in development builds (redirects elsewhere).
- **Out:** buttons, chips, cards, states (P1.8); real screens (Phase 8).
- **Files:** `app/src/components/ui/{GradeBadge,RatingPill,ScoreRing,SectionHeader}.tsx`, `app/src/app/dev/gallery.tsx`, `e2e/gallery.spec.ts`.
- **Verification:**
  - **Web:** Playwright screenshot of `/dev/gallery` at 390 × 844 (`.screenshots/p1.7-gallery-web.png`). Compare by eye with `docs/baseline/web/13-product.png` (grade badge) and `16-company.png` (rating pills, score ring): colours, radii and weights match THEME.md. 0 console errors.
  - **Android:** mobile MCP screenshot of the gallery (`.screenshots/p1.7-gallery-android.png`).
  - `e2e/gallery.spec.ts` asserts each component's testID is visible.
  - typecheck, lint and tests pass.

### [ ] P1.8 Interaction and state primitives
- **Slice:** ui-primitives.
- **Goal:** the remaining shared building blocks from THEME.md, added to the gallery.
- **Deps:** P1.7.
- **In:**
  - PressableScale, buttons (primary / secondary / text, per THEME "Screen-level patterns"), chips (filter chips as in History and Search), the card container, EmptyState, ErrorState, StatusBarScrim, RouteErrorBoundary.
  - Every interactive element takes a `testID`. The gallery gets a section for each.
- **Out:** feature cards tied to data (home, search, history and scan cards are Phase 8).
- **Files:** `app/src/components/ui/*.tsx` (new files only), `app/src/app/dev/gallery.tsx`, `e2e/gallery.spec.ts`.
- **Verification:**
  - Web and Android gallery screenshots. Compare with baseline `07-search-empty.png` / `09-search-no-results.png` (empty state, chips) and `11-history-barcode-filter.png` (chips).
  - The e2e test presses a button and a chip by testID and checks the visible state change.
  - A thrown error inside a RouteErrorBoundary test screen renders ErrorState.
  - 0 console errors. typecheck, lint and tests pass.

### [ ] P1.9 App shell: tabs, stack routes and headers as placeholders
- **Slice:** navigation.
- **Goal:** the full legacy navigation map (SPEC "Navigation map") with placeholder screens, the floating tab bar and stack headers matching the baseline.
- **Deps:** P1.8.
- **In:**
  - Root stack and `(tabs)` group: Impact, Scan, Search, History, with legacy icons (MaterialCommunityIcons) and labels.
  - Stack routes `product/[id]`, `company/[id]`, `story/[id]`, `receipt/[id]`, `receipt-scan`, `receipt-results`, `stories`, `profile` (modal), `settings`, `privacy`, `help`, `about`.
  - Each placeholder shows its title and has a `testID` (`screen-<name>`).
  - Tab bar and header styling per THEME.md "Navigation chrome", plus StatusBarScrim.
  - Routes are public for now; P1.10 adds the gate.
- **Out:** screen content (Phase 8), auth gating (P1.10), admin routes (P1.12).
- **Files:** `app/src/app/_layout.tsx`, `app/src/app/(tabs)/**`, `app/src/app/<route>.tsx` placeholders, `app/src/components/navigation/TabBar.tsx`, `e2e/navigation.spec.ts`.
- **Verification:**
  - **Web:** screenshots of the Impact tab and one stack screen. Compare the tab bar with `docs/baseline/web/03-home.png` and the header with `13-product.png`.
  - **Android:** the same two screenshots via mobile MCP, compared with `docs/baseline/android/03-home.png` and `13-product.png`.
  - `e2e/navigation.spec.ts` taps all 4 tabs and opens every stack route by URL, asserting `screen-<name>`.
  - 0 console errors.

### [ ] P1.10 Email sign-up, sign-in, sign-out and AuthGate
- **Slice:** auth.
- **Goal:** email/password auth against the dev project, with the legacy auth screen look and route gating.
- **Deps:** P1.5, P1.9.
- ✅ **Decided (D-015), option (a):** Supabase's built-in email only reaches project team addresses and is heavily rate-limited, so e2e tests need pre-confirmed test users. The **dev** project's service-role key goes in `.env` as `SUPABASE_DEV_SERVICE_ROLE_KEY`, for a dev-only Node script that creates confirmed test users. It is never bundled and never used against the legacy project. 🟡 **Owner action before verification:** the owner adds the key to `.env`.
- **In:**
  - `app/src/lib/supabase.ts` (publishable/anon key from `EXPO_PUBLIC_*`; AsyncStorage on native, localStorage on web; `detectSessionInUrl` on web only).
  - `AuthProvider` + `useAuth`; AuthGate in the root layout (SPEC F1: no session → `/auth`, session → tabs).
  - `/auth` screen matching baseline `01`/`02`: sign-in/sign-up toggle, optional display name, password ≥ 8, mapped error messages, "Check your inbox" + resend, redirect scheme `sarvis://`.
  - Sign-out from the Profile placeholder.
  - `scripts/dev-create-test-user.ts` (option a) that refuses to run unless the URL is the dev project.
- **Out:** Google / Apple / guest (P1.14, skipped per D-015), a password-reset screen, email change, account deletion (P1.11).
- **Files:** `app/src/lib/supabase.ts`, `app/src/lib/auth/**`, `app/src/app/auth.tsx`, `app/src/app/_layout.tsx`, `scripts/dev-create-test-user.ts`, `e2e/auth.spec.ts`, `.env.example`.
- **Verification:**
  - `e2e/auth.spec.ts`:
    - signed out, `/` redirects to `/auth`;
    - a wrong password shows the mapped error;
    - a valid sign-in lands on the Impact tab;
    - a reload keeps the session;
    - sign-out returns to `/auth`;
    - the sign-up form validates its fields.
  - **Android:** sign in via mobile MCP, screenshot the tabs, then sign out.
  - The SQL check shows the `profiles` row the trigger created for the test user.
  - Auth screen screenshots compared with baseline `01-auth-sign-in.png` and `02-auth-sign-up.png` (web and Android).
  - 0 console errors. `grep` confirms no service-role key in `app/`.

### [ ] P1.11 Account deletion RPC and the Settings action
- **Slice:** account-deletion.
- **Goal:** a signed-in user can delete their own account and nothing else (SPEC F8; the legacy RPC was never applied).
- **Deps:** P1.10.
- **In:**
  - Migration `…_delete_own_account.sql`: `delete_own_account()` is security definer with a fixed `search_path`. It deletes `auth.users` where `id = auth.uid()` (cascades to `profiles` and future user tables). Execute is revoked from `public`/`anon` and granted to `authenticated`.
  - The Settings placeholder gets "Delete my account" with two confirmations (legacy copy), then signs out to `/auth`.
  - Types are regenerated.
- **Out:** data export, the web deletion page (Phase 10 privacy).
- **Files:** `supabase/migrations/*_delete_own_account.sql`, `packages/core/src/db/database.types.ts`, `app/src/app/settings.tsx`, `e2e/account-deletion.spec.ts`.
- **Verification:**
  - SQL checks: anon can't execute the function; user A's call removes only A (B is still there).
  - The e2e test creates a throwaway test user, deletes it via the UI, then confirms that signing in with it fails.
  - `get_advisors` (security) is clean for the new function.

### [ ] P1.12 Web-only `/admin` route group gated by role
- **Slice:** admin-gate.
- **Goal:** `/admin` exists on web only, is lazy-loaded, and is refused to non-admins both in the UI and on the server (D-005).
- **Deps:** P1.10.
- **In:**
  - An `(admin)` route group with an admin layout that redirects to the tabs on native and checks `is_admin()` via RPC on web. A non-admin sees a "Not authorised" ErrorState and a link home.
  - A placeholder admin home with `testID="admin-home"`.
  - Migration with RPC `admin_ping()`, which raises unless `is_admin()`. It proves the server-side check; real admin data comes with RLS in Phase 5.
  - Test admin role set via SQL on dev only.
- **Out:** admin pages (Phase 5).
- **Files:** `app/src/app/(admin)/**`, `supabase/migrations/*_admin_ping.sql`, `packages/core/src/db/database.types.ts`, `e2e/admin-gate.spec.ts`.
- **Verification:**
  - e2e: signed out, `/admin` → `/auth`.
  - e2e: a normal user sees "Not authorised", and the `admin_ping` RPC returns an error.
  - e2e: the admin user sees `admin-home`.
  - **Android:** opening the `/admin` deep link lands on the tabs (mobile MCP screenshot).
  - The production web bundle check shows the admin code in a separate lazy chunk (`npx expo export -p web`, then list the chunks).

### [ ] P1.13 Phase 1 exit check
- **Slice:** release-check.
- **Goal:** prove the Phase 1 exit criteria together on a clean checkout, and fix only gaps that come from Phase 1 tasks.
- **Deps:** P1.4, P1.11, P1.12.
- **In:**
  - A clean clone, `npm ci`, the full Commands table run row by row.
  - Web and Android sign-in.
  - `/admin` denied to non-admins.
  - The latest CI run is green.
  - Update CLAUDE.md Commands with anything missing (rows that only apply later, such as "Run a scraper on a sample", stay "TBD (Phase 2)").
- **Out:** new features. Any gap that isn't a Phase 1 regression becomes a new PLAN task.
- **Files:** `CLAUDE.md`, `docs/PROGRESS.md`.
- **Verification:**
  - A checklist in PROGRESS with evidence for each exit bullet: screenshots in `.screenshots/p1.13-*`, the e2e summary, the CI run URL, and the Commands table diff.

### [ ] P1.14 Optional: additional sign-in providers (skipped, D-015)
- **Slice:** auth.
- **Goal:** add Google (and/or guest) sign-in only if the owner wants it. Legacy shipped email only (SPEC F1).
- **Deps:** P1.10.
- ✅ **Decided (D-015):** none for now. Email only. Skip this task in Phase 1 and revisit if the owner asks. (Google would need an OAuth client from the owner. Apple is out on Android and web.)
- **In:** the chosen providers' buttons on `/auth`, OAuth redirect handling on web and Android, and the provider enabled in the dev project.
- **Out:** Apple; account linking UI.
- **Files:** `app/src/lib/auth/**`, `app/src/app/auth.tsx`, `e2e/auth.spec.ts`.
- **Verification:** sign in with each chosen provider on web (Playwright, a manual login by the owner where needed) and Android (mobile MCP). The `profiles` row is created.

### Phase 1 milestone coverage

| Milestone | Tasks |
|---|---|
| M1 Repo scaffold | P1.1 (workspaces, strict TS, ESLint, Prettier, Vitest, `.env.example`), P1.2 (Expo SDK 54 + Router), P1.3 (Playwright e2e) |
| M2 CI workflow | P1.4 |
| M3 Supabase wiring | P1.5 (migrations, type-gen, `profiles.role`, `is_admin()`, RLS, no service key in clients); client side in P1.10 |
| M4 Auth | P1.10 (email), P1.11 (account deletion RPC), P1.14 (other providers, skipped per D-015) |
| M5 Theme and UI primitives | P1.6 (tokens, font default), P1.7 (rating primitives + gallery), P1.8 (buttons, chips, cards, states) |
| M6 App shell | P1.9 (tabs and stack placeholders), P1.12 (web-only `/admin` gate) |
| Exit criteria | P1.13 |

## Phase 2 — Catalog core: schema and ingestion framework (outline)

**Exit:** a fixture source goes raw → stored → parsed → validated → upserted. Running it twice creates no duplicates, and every row carries provenance.

- [ ] **P2.0 Refine Phase 2 into session-sized tasks.** Deps: Phase 1.
- **Milestones:**
  - Catalog schema migrations from `docs/catalog/DATA_MODEL.md` §3, one domain per task: pipeline bookkeeping, ownership, products, stores and prices, matching and review, scoring and evidence, editorial, AI and audit. Types regenerated each time. Seed `sources` from SOURCES.md (verdicts included; jobs refuse non-`use` sources).
  - `packages/core`: pure TS zod schemas for every ingestible record, plus the validation library (required fields, price sanity, size/unit normalization hooks, duplicate detection).
  - `pipeline` package:
    - a polite HTTP client (robots.txt check, ~1 req/s/host, exponential backoff, on-disk cache);
    - a raw store (gzip → Supabase Storage, retention per D-010);
    - `ingestion_runs` bookkeeping;
    - idempotent upsert helpers keyed on GTIN/SKU/slug;
    - a CLI: `pipeline run <source> --sample N [--dry-run]`;
    - port the Keep/Adapt modules listed in `docs/legacy/CATALOG_REVIEW.md` §4 (errors, retry, logger, env, safeguards, change detection, run driver) instead of rewriting them;
    - every run records expected vs fetched totals (review lesson 3).
  - Re-import the legacy content (P0.2 JSON) with `legacy-import` provenance, using the mapping in DATA_MODEL §8. All legacy facts arrive as `pending` review.
  - Pipeline unit tests on fixtures, plus an end-to-end run-twice idempotency test of the driver against the dev DB (review lesson 6).
  - The dev DB size is checked after the seed against `docs/catalog/BUDGET.md` §3 (`pg_total_relation_size` per table).

## Phase 3 — Catalog sources (outline)

**Exit:** each approved source has been run on a sample, then scaled, with row counts, examples and validation results in PROGRESS. The DB and storage stay within budget.

- [ ] **P3.0 Refine Phase 3 into session-sized tasks.** Deps: Phase 2 and the owner's answers to the SOURCES.md decisions.
- **Milestones:** each source is its own task pair: (a) sample of ~100 records, (b) scale-up.
  - Open Food Facts, Canadian subset: products, GTINs, brand strings, categories, quantity.
    - Apply the BUDGET §4 import filter (~95k rows) and measure real row width in the sample task.
    - In-app attribution (ODbL, D-013 D1).
    - Publish the ODbL extract to the `public-exports` bucket; watch egress (BUDGET §6).
  - Wikidata: brand → company → parent ownership, with dates and Wikidata QIDs as stable IDs.
  - Open Prices: Canadian store price observations.
  - StatCan average retail prices, as a price-sanity reference.
  - Wikipedia summaries (S19) for company pages.
  - SEC EDGAR Exhibit 21 (S20) → `pending` company ownership edges.
  - Corporations Canada (S21, low priority): an identity check only.
  - Retailer catalog sources: **none** for now. All Ontario grocers, Walmart, Costco and Flipp are avoided (D-013). Revisit only if the owner gets written permission.
  - ✅ User-Agent contact (D-015): the repo URL only, `Sarvis/<version> (+https://github.com/LukaMS/sarvis)`. If SEC EDGAR rejects it without an email, stop and ask the owner.
  - A budget check after each scale-up task.

## Phase 4 — Normalization and matching (outline)

**Exit:** a labelled gold set (~200 product pairs, ~100 brand→company pairs) measures precision and recall. Auto-accept precision is ≥ 95%, and the rest goes to a review queue.

- [ ] **P4.0 Refine Phase 4 into session-sized tasks.**
- **Milestones:**
  - Size/unit parser and unit price (g/kg/ml/L/ct, multipacks, "x"), tested on real strings from P3. Seed the tests from legacy `normalizer.test.ts` and fix the gaps in CATALOG_REVIEW §4.1.
  - GTIN normalization: UPC-A/EAN-13/GTIN-14 check digits, PLU, and store-internal codes (rules in DATA_MODEL §1.4).
  - Category taxonomy: Sarvis taxonomy plus mappings from OFF categories (retailer categories only if a retailer is ever approved, D-013).
  - Product matcher: GTIN exact first, then fuzzy name/brand/size (`pg_trgm` plus scoring in core), with a confidence score and stored match decisions (`match_candidates`).
    - Includes **receipt-abbreviation → product** matching via `store_listings`. Receipts are the main price source (D-013 D7).
    - Calibrate the legacy `match_receipt_items` tiers on the gold set.
  - Brand → company resolver: exact, alias, Wikidata, fuzzy, plus the legacy BulkBrandLink rules (CATALOG_REVIEW §6). Unresolved brands go to the queue.
  - Gold-set evaluation script that reports precision and recall.

## Phase 5 — Admin portal: catalog tools (outline)

**Exit:** an admin can browse and edit every catalog entity with its provenance, bulk-import a CSV safely, review matches and ownership, and see the quality dashboard. Verified with Playwright screenshots.

- [ ] **P5.0 Refine Phase 5 into session-sized tasks.**
- **Milestones:**
  - Admin layout and navigation inside the Expo app's web-only `/admin` group (D-005, P1.12), with the legacy admin look (THEME.md).
  - DB browser/editor for companies, brands, ownership, products, stores and prices: provenance panel, and edits recorded as `manual` provenance.
  - Bulk import: CSV/JSON upload → preview → validation report → dry run → idempotent commit.
  - Ingestion runs list and detail (rows, errors, raw object links).
  - Match and ownership review queue.
  - Manual entry forms for certifications, external ratings and company events with a required citation URL (B Corp, Fairtrade and KnowTheChain are manual-only, D-013 D6).
  - Sources page: verdict, licence, terms and the last run per source.
  - Quality dashboard: rows per source, match rate, stale prices, unscored companies, unresolved brands, DB/storage usage against budget.
  - 🟡 Triggering pipeline runs from the admin portal needs a GitHub token held server-side (an edge function secret). The owner approves the token's scope.

## Phase 6 — Scheduling and operations (outline)

**Exit:** scheduled runs work on GitHub Actions for a full week with no manual steps. Failures open an issue, and budget alarms work.

- [ ] **P6.0 Refine Phase 6 into session-sized tasks.**
- **Milestones:**
  - Cron workflows per source with `workflow_dispatch`, concurrency groups, and `actions/cache` for the HTTP cache.
  - Supabase keep-alive.
  - Freshness policy: per-source refresh intervals and stale-price thresholds.
  - Raw-retention cleanup job (retention per DATA_MODEL §5), plus the row-retention purges (events, validation failures, candidates, queue).
  - A budget monitor (DB size, storage size, OpenRouter spend, egress) that warns at the thresholds in BUDGET §6.
  - Failure notification by opening a GitHub issue.

## Phase 7 — AI enrichment: scores and articles (outline)

**Exit:** a batch of 10 companies is scored with citations and confidence. All scores land in the review queue, approved scores show in the app, and cost per company is logged.

- [ ] **P7.0 Refine Phase 7 into session-sized tasks.**
- **Milestones:**
  - The single OpenRouter module (D-009): configurable model, zod-validated output, a token and cost log, a mock mode, a spend guard. **First task:** a spike proving the same module runs in a Deno edge function and in the Node pipeline.
  - 🟡 Rubric v1 (`docs/catalog/RUBRIC.md`): 5 categories × Good/Mixed/Poor, 0–100 and letter grade (D-004), evidence requirements, confidence levels. The owner approves the rubric before scoring runs.
  - Company scoring job → review queue (model, rubric version, sources, confidence).
  - Article collection: GDELT (weekly, because the API searches a rolling 3-month window) and RSS (the provisional list from SOURCES.md S24, with each feed's terms checked before it's added, D-013 D4), plus Wikipedia. Relevance and good/bad tagging → review queue.
  - Review queue UI in the admin portal.
  - 🟡 Auto-publish rule (D-006: none until the owner decides).

## Phase 8 — User app screens (outline)

**Exit:** every baseline screen is rebuilt, matches `docs/baseline/` on web and Android, and reads the new catalog. The e2e suite covers the main flows.

- [ ] **P8.0 Refine Phase 8 into session-sized tasks.**
- **Milestones:** one task per screen or flow.
  - Home.
  - Search: catalog-wide, by product, brand or company.
  - Product detail: ownership chain, rating, prices by store.
  - Company detail: scores with citations, articles.
  - Barcode scan.
  - Receipt scan: rebuilt `process-receipt` on the shared AI module and the P4 matcher, with user confirmation of matches.
  - History and spending tracking: by month, store and company.
  - Stories/articles.
  - Profile, settings, about, help, privacy. Offline cache.
  - Receipt prices feed the shared price catalog, and consenting users' prices may be contributed to Open Prices (D-013). 🟡 The owner approves the consent and privacy wording, and the k-anonymity rule for `price_points_weekly` (placeholder: ≥ 2 receipts; DATA_MODEL §9).
  - Receipt scan is the main source of store prices (D-013 D7), so build it early in this phase.
  - 🟡 Product grades: derive them from the owner company's published score (default; DATA_MODEL §9), or keep product-level scores.
  - 🟡 Community submissions (legacy F9): keep them as review-queue items, or drop them.

## Phase 9 — Ethical alternatives (outline)

**Exit:** for a test set of receipts, alternatives appear at the same store, are more ethical by the rubric, and cost the same or less per unit (or are flagged when they don't). Evaluated on a labelled set.

- [ ] **P9.0 Refine Phase 9 into session-sized tasks.**
- **Milestones:**
  - Define "similar": same taxonomy leaf and a size band compared by unit price.
  - Define "more ethical": a minimum score gap, and only published scores.
  - Same-store default. If the store has no data, fall back to the same chain, then other nearby chains, clearly labelled (D-011).
  - **Audit note:** with no retailer sources (D-013), "available at this store" is known only from receipts and Open Prices, so expect thin same-store coverage at first. Label the source of each alternative's price ("seen on a receipt at …", with its date).
  - Precomputed alternatives table refreshed by the pipeline.
  - UI on the product, receipt-results and history screens.

## Phase 10 — Release hardening (outline)

- [ ] **P10.0 Refine Phase 10 into session-sized tasks.**
- **Milestones:**
  - 🟡 Web hosting choice (free: EAS Hosting, Cloudflare Pages or Netlify).
  - 🟡 Android distribution (an EAS free build or a local Gradle APK; the Play Store costs $25, so flag it).
  - Privacy policy and data deletion. Open data attributions (OFF/Open Prices ODbL, Wikipedia CC BY-SA, GDELT, StatCan) on the About screen.
  - 🟡 A paid Supabase tier once the DB nears the 400 MB alarm (≈ 200–250 active users within a year, BUDGET §8), or archiving user history to Storage.
  - Accessibility pass, performance pass, full e2e run, security advisors clean (`get_advisors`).
