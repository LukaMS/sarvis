# Sarvis rebuild plan

Single source of truth for what comes next. Work one task per session (`/next`), save state with `/handoff`.

**Legend**
- `[ ]` / `[x]` — open / done (done only when its verification passed)
- 🟡 **Decision** — needs an answer from the owner before the task starts (or before the marked step)
- **Deps** — task IDs that must be ticked first

**Ground rules that apply to every task** (from `CLAUDE.md`): never edit the legacy folder, never write to the legacy Supabase project, migrations only to `supabase-dev`, RLS on every table, provenance on every fact, free tiers only, `testID` on every interactive element, screenshots to `.screenshots/`.

**Legacy reference:** `C:/Users/lukam/Coding Projects/MobileDev/Ethical-App` (see D-001). Short name below: `LEGACY/`.

**Order:** tasks run in the order they appear in this file. The 2026-11-10 review (`docs/REVIEW.md`, D-080) added tasks and moved some earlier. A few tasks with Phase 1, 2 and 6 IDs therefore sit inside Phase 4 and Phase 4B, at the point where they run. A 🟡 task that is still waiting on the owner is skipped, and `/next` takes the task after it.

---

## Free-tier risk register

Every phase must keep these in view. Phase 0 (P0.11) turns them into numbers.

| Limit | Risk | Mitigation |
|---|---|---|
| Supabase DB 500 MB | Open Food Facts has hundreds of thousands of products; price history grows without bound. | Import only the Canadian subset and only the columns we use. Write a price row only when the price changes, and roll up history older than 90 days to monthly. Budget: catalog ≤ 350 MB, alarm at 400 MB. The quality dashboard shows DB size. |
| Supabase Storage 1 GB | Raw scraper responses and receipt images. | Gzip all raw data. Keep the last 3 runs per source and 30 days at most. Never store bulk dumps (OFF, Wikidata) in Supabase: process them on the Actions runner and keep only the filtered extract's hash and URL. Downscale receipt images and delete them after parsing unless the user opts in. Budget ≤ 700 MB, alarm at 800 MB. |
| Supabase pauses after 7 idle days | Breaks the app and the jobs. | The daily scheduled pipeline run counts as activity. P6.1 adds it, and it runs early, inside Phase 4 (D-080). |
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

### [x] P1.7 Rating primitives and the component gallery route
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

### [x] P1.8 Interaction and state primitives
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

### [x] P1.9 App shell: tabs, stack routes and headers as placeholders
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

### [x] P1.10 Email sign-up, sign-in, sign-out and AuthGate
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

### [x] P1.11 Account deletion RPC and the Settings action
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

### [x] P1.12 Web-only `/admin` route group gated by role
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

### [x] P1.13 Phase 1 exit check
- **Slice:** release-check.
- **Goal:** prove the Phase 1 exit criteria together on a clean checkout, and fix only gaps that come from Phase 1 tasks.
- **Deps:** P1.4, P1.11, P1.12.
- **In:**
  - A clean clone, `npm ci`, the full Commands table run row by row.
  - Web and Android sign-in.
  - Android: Settings → Delete my account shows both native confirmations with the legacy button labels (Cancel / Continue, Keep my account / Delete permanently). Use a throwaway `npm run dev:test-user` account, confirm both, and check that the app lands on `/auth`. P1.11 couldn't check this because the emulator was unresponsive.
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

### [x] P1.15 Password reset: handle the recovery link (added in P1.10)
- **Slice:** auth.
- **Goal:** "Forgot password?" on `/auth` sends Supabase's reset email (P1.10, matching legacy), but nothing handles the link yet. Legacy had the same gap: the link just signed the user in. Add a screen that lets them set a new password.
- **Deps:** P1.10.
- **In:** listen for the `PASSWORD_RECOVERY` auth event (web: `detectSessionInUrl`; Android: parse the deep link and `setSession`/`exchangeCodeForSession`), a "Set a new password" screen (≥ 8 characters, mapped errors), and the dev project's redirect URLs (`sarvis://`, Expo Go, web localhost) allowed in Auth settings.
- **Out:** email change, password change from Settings (Phase 8).
- **Files:** `app/src/lib/auth/**`, `app/src/app/reset-password.tsx`, `app/src/app/_layout.tsx`, `e2e/auth.spec.ts`.
- **Verification:** with a dev test user, generate a recovery link (admin `generateLink` in a dev script, so no real email is needed), open it on web and Android, set a new password, and sign in with it.

### [x] P1.16 Signed-out deep link to a guarded route shows a dev warning (added in P1.12)
- **Slice:** navigation.
- **Goal:** on Android, signed out, opening a deep link to any guarded route (e.g. `/settings`, `/admin`) lands correctly on `/auth` but shows a LogBox warning: "The 'state' or 'screen' passed in the params couldn't be applied to the navigator with the screens: 'auth', 'dev/gallery', 'dev/error-boundary'…". It's dev-only and has been there since P1.10, not caused by P1.12. Find out whether it's expected `Stack.Protected` behaviour or a fixable misuse, then fix it or record why it's harmless.
- **Deps:** P1.10.
- **Out:** remembering the deep-link target and returning to it after sign-in (Phase 8, if wanted).
- **Files:** `app/src/app/_layout.tsx`, `docs/DECISIONS.md`.
- **Verification:** Android, signed out, `/settings` and `/admin` deep links land on `/auth` with no LogBox warning, or a DECISIONS note explains why the warning is harmless. Signed-in deep links still work (mobile MCP screenshots).

### [x] P1.17 Owner: allow the `sarvis://` auth redirect in the dev project (added in P1.15)
- **Slice:** auth.
- **Goal:** email links (reset, sign-up confirmation) opened from a dev or release build return to the app. Today `sarvis://` isn't in the dev project's allowed redirect URLs, so Supabase sends those links to the Site URL (`http://localhost:3000`). Expo Go (`exp://127.0.0.1:8081/--/`) and web (`http://localhost:8081/`) already work (D-028).
- **Deps:** P1.15.
- **Owner action (dashboard, no MCP tool for it):** Authentication → URL Configuration → Redirect URLs → add `sarvis://**`. Optionally set the Site URL to `http://localhost:8081`.
- **Verification:** `npm run dev:recovery-link -- --email <dev user> --redirect sarvis://`, then GET the link with redirects off (`curl -s -o /dev/null -D -`). The `Location` header starts with `sarvis://#access_token=`.

### Phase 1 milestone coverage

| Milestone | Tasks |
|---|---|
| M1 Repo scaffold | P1.1 (workspaces, strict TS, ESLint, Prettier, Vitest, `.env.example`), P1.2 (Expo SDK 54 + Router), P1.3 (Playwright e2e) |
| M2 CI workflow | P1.4 |
| M3 Supabase wiring | P1.5 (migrations, type-gen, `profiles.role`, `is_admin()`, RLS, no service key in clients); client side in P1.10 |
| M4 Auth | P1.10 (email), P1.11 (account deletion RPC), P1.14 (other providers, skipped per D-015), P1.15 (password reset), P1.17 (`sarvis://` redirect, owner) |
| M5 Theme and UI primitives | P1.6 (tokens, font default), P1.7 (rating primitives + gallery), P1.8 (buttons, chips, cards, states) |
| M6 App shell | P1.9 (tabs and stack placeholders), P1.12 (web-only `/admin` gate) |
| Exit criteria | P1.13 |
| Added by the review (D-080) | P1.18 (auth hardening), P1.19 (small fixes), P1.20 (guest access). They sit in Phase 4B, where they run. |

## Phase 2 — Catalog core: schema and ingestion framework (full detail)

**Exit:**
- A fixture source goes raw → stored → parsed → validated → upserted.
- Running it twice creates no duplicates, and every row carries provenance.

- [x] **P2.0 Refine Phase 2** → done 2026-10-28 (this section; D-030).

**Milestones** (each one maps to tasks in the coverage table at the end of this phase):
- **M1 Schema:** catalog migrations from `docs/catalog/DATA_MODEL.md` §3, one domain per task, with types regenerated each time.
- **M2 Sources seed:** `sources` seeded from SOURCES.md, verdicts included. Jobs refuse sources that aren't `use`.
- **M3 Core records and validation:** pure TS zod schemas for every ingestible record in `packages/core`, plus the validation library: required fields, price sanity, size/unit normalization hooks, duplicate detection.
- **M4 Pipeline framework:**
  - a polite HTTP client (robots.txt, ~1 req/s/host, backoff, on-disk cache);
  - a raw store (gzip → Storage, retention per D-010);
  - `ingestion_runs` bookkeeping, recording expected vs fetched totals;
  - idempotent upsert helpers;
  - the CLI `pipeline run <source> --sample N [--dry-run]`;
  - the Keep/Adapt modules from `docs/legacy/CATALOG_REVIEW.md` §4, ported rather than rewritten.
- **M5 Legacy re-import:** P0.2 JSON → new tables with `legacy-import` provenance (DATA_MODEL §8). Everything arrives `pending`.
- **M6 Tests:** pipeline unit tests on fixtures, and an end-to-end run-twice idempotency test against the dev DB.
- **M7 Budget check:** dev DB size after the seed, measured against `docs/catalog/BUDGET.md` §3.

**Feature slices** (each task touches exactly one): `schema`, `sources-seed`, `core-records`, `core-validation`, `pipeline-runtime`, `pipeline-http`, `pipeline-raw`, `pipeline-runs`, `pipeline-db`, `pipeline-cli`, `legacy-import`, `release-check`.

**Rules for every `schema` task (P2.1, P2.3–P2.9):**
- One migration file per domain, applied with `supabase-dev` `apply_migration`, then renamed to the recorded version and listed in `supabase/README.md`.
- Columns, keys and RLS level exactly as in DATA_MODEL §3, with explicit per-role grants and then RLS (D-020 pattern). `+prov` and `+review` columns as in §1.2 and §1.5. `updated_at` uses the existing `private.set_updated_at()`.
- Types regenerated into `packages/core/src/db/database.types.ts`.
- An RLS check script, `supabase/tests/<domain>.sql`, runs inside `begin … rollback` through `execute_sql`. It switches role with `set local role` and `request.jwt.claims` and asserts:
  - `anon` sees only public rows (`approved` or active where the table has a status) and can't write;
  - `authenticated` non-admins can't read admin tables;
  - an admin can read and write.
- **Verification (all schema tasks):**
  - The RLS script passes, and its output is pasted into PROGRESS.
  - `get_advisors` (security and performance) shows no new warnings.
  - A query on `pg_class.relrowsecurity` shows RLS on every new table.
  - `npm run typecheck`, `lint` and `test` all pass.
- **Out (all schema tasks):** data, except P2.2 and fixed lookup rows the domain itself needs; pipeline code.

### [x] P2.1 Schema: pipeline bookkeeping, shared SQL helpers, `raw` bucket
- **Slice:** schema.
- **Goal:** the tables every run writes to, plus the SQL helpers later domains need.
- **Deps:** P1.13.
- **In:**
  - Extensions `pg_trgm` and `unaccent`, in the `extensions` schema.
  - `public.normalize_match_text(text)`: immutable, wrapping `unaccent`, lower-casing and collapsing spaces. Used by later trigram expression indexes.
  - A slug check domain or constraint with the §1.3 pattern.
  - Tables `sources`, `ingestion_runs`, `ingestion_run_events`, `raw_objects`, `validation_failures` (§3.1).
  - The public column-limited view over `sources` (§3.1 RLS).
  - The private Storage bucket `raw`: admin read, no client write. The pipeline writes with the service role.
- **Out:** as in the schema-task rules.
- **Files:** `supabase/migrations/*_catalog_pipeline_bookkeeping.sql`, `supabase/tests/pipeline_bookkeeping.sql`, `supabase/README.md`, `packages/core/src/db/database.types.ts`.
- **Verification:** the schema-task rules above. Also:
  - `normalize_match_text('Ben’s  ÉPICERIE')` returns `ben’s epicerie` or the documented equivalent;
  - the slug check rejects `Bad Slug` and accepts `bens-original`;
  - `anon` can't list the `raw` bucket.

### [x] P2.2 Seed `sources` from SOURCES.md
- **Slice:** sources-seed.
- **Goal:** one `sources` row for each S-id in SOURCES.md, plus the internal sources, so every fact can point at a source and jobs can check the verdict.
- **Deps:** P2.1.
- **In:**
  - A data migration that upserts on `key` (re-runnable).
  - S1–S30 with `sources_md_id`, name, homepage, licence, licence URL, attribution text, access method, terms URL, `terms_checked_at`, `verdict` (`use` / `manual_only` / `avoid`), `url_template` where one exists (S1 OFF product pages), and `rate_limit_per_sec` (≤ 1).
  - Avoided sources are seeded with `enabled = false`, so a later approval is a one-row change.
  - Internal sources: `manual`, `legacy-import`, `receipts`, `derived`, and `fixture` (test-only, `use`).
  - S24 RSS feeds are **not** seeded one per feed here. Each feed is added, with its terms checked, when Phase 3 or 7 adds it (D-013 D4).
- **Out:** the pipeline-side verdict check (P2.15).
- **Files:** `supabase/migrations/*_seed_sources.sql`, `supabase/README.md`, `docs/catalog/SOURCES.md` (a line saying the table is mirrored in `sources`).
- **Verification:**
  - A SQL count by verdict matches the SOURCES.md §1 summary table, with every S-id present.
  - Applying the migration's SQL a second time through `execute_sql` changes 0 rows.
  - `anon` reads the attribution fields through `source_attributions`, which hides avoided sources (D-031: the base table is public-read).

### [x] P2.3 Schema: matching and review
- **Slice:** schema.
- **Goal:** `match_candidates` and `review_queue` (§3.5). They come before ownership because `brand_ownership.match_candidate_id` references them.
- **Deps:** P2.1.
- **In:** both tables with keys, checks and admin RLS. The `+review` column convention (`review_status`, `reviewed_by`, `reviewed_at`, `decision_method`) is written as a reusable SQL snippet in the README, so later domains copy it exactly.
- **Out:** as in the schema-task rules.
- **Files:** `supabase/migrations/*_catalog_matching_review.sql`, `supabase/tests/matching_review.sql`, `supabase/README.md`, types.
- **Verification:** the schema-task rules. Also, a duplicate `(kind, subject_id, candidate_id, match_method_version)` insert fails.

### [x] P2.4 Schema: ownership (companies, brands, ownership edges, banners)
- **Slice:** schema.
- **Goal:** the ownership chain tables (§3.2), plus `banners` (§3.4). `banners` is moved here because `product_identifiers.banner_id` (P2.5) references it, and a banner is an operating-company link (D-030).
- **Deps:** P2.3.
- **In:**
  - `companies`, `brands`, `company_ownership` (with a cycle-rejecting trigger), `brand_ownership` (with a partial unique index allowing one current approved owner per brand), and `banners`.
  - Trigram indexes on `normalize_match_text(name)`.
  - Views `brand_current_owner` and `company_ultimate_parent` (§4), both `security_invoker`.
- **Out:** as in the schema-task rules.
- **Files:** `supabase/migrations/*_catalog_ownership.sql`, `supabase/tests/ownership.sql`, `supabase/README.md`, types.
- **Verification:** the schema-task rules. Also:
  - an edge A→B followed by B→A is rejected;
  - a second current approved owner for a brand is rejected;
  - `company_ultimate_parent` walks a three-level test chain;
  - `anon` doesn't see a `pending` ownership edge.

### [x] P2.5 Schema: products
- **Slice:** schema.
- **Goal:** the product tables (§3.3).
- **Deps:** P2.4.
- **In:**
  - Tables `categories`, `category_mappings`, `labels` (with a small fixed seed: organic, fair-trade, rspo and the codes listed in §3.3), `products`, `product_identifiers`, `product_sources`.
  - An immutable SQL GTIN check-digit function for the `products.gtin` check (the DATA_MODEL §1.4 rule; P2.10 writes the TS twin, and both use the same test vectors).
  - Trigram index on the product name.
  - Views `products_with_source_url` and `product_ownership_chain` (§4).
- **Out:** as in the schema-task rules.
- **Files:** `supabase/migrations/*_catalog_products.sql`, `supabase/tests/products.sql`, `supabase/README.md`, types.
- **Verification:** the schema-task rules. Also:
  - a bad check digit is rejected;
  - a duplicate `(source_id, external_id)` is rejected;
  - `products_with_source_url` rebuilds an OFF URL from `url_template`;
  - `product_ownership_chain` returns product → brand → company → parent for a test chain.

### [x] P2.6 Schema: stores and prices
- **Slice:** schema.
- **Goal:** the store and price tables (§3.4, except `banners`, which moved to P2.4).
- **Deps:** P2.5.
- **In:**
  - Tables `stores`, `store_listings` (with partial unique keys), `price_observations` (price check > 0 and ≤ 10,000), `price_points_weekly` (public only where `n_receipts ≥ 2`), `price_points_monthly`, `reference_prices`, `price_sanity_bounds`.
  - Views `current_prices` (the effective-price rule) and `price_observations_with_source_url`.
  - Unmatched `store_listings` are admin-only.
- **Out:** as in the schema-task rules.
- **Files:** `supabase/migrations/*_catalog_stores_prices.sql`, `supabase/tests/stores_prices.sql`, `supabase/README.md`, types.
- **Verification:** the schema-task rules. Also:
  - a price of 0 or 10,001 is rejected;
  - `current_prices` picks `sale` over `regular` and never `member`;
  - `anon` can't see an unmatched listing or a weekly point with `n_receipts = 1`.

### [x] P2.7 Schema: AI and audit
- **Slice:** schema.
- **Goal:** `ai_calls` and `audit_log` (§3.8). They come before scoring because `company_scores.ai_call_id` references `ai_calls`.
- **Deps:** P2.1.
- **In:** both tables, admin RLS, and checks on `purpose` and `status`. Also add `ai_call_id bigint references ai_calls on delete set null` (indexed) to `company_ownership` and `brand_ownership`, which P2.4 shipped without it (D-034), and to `category_mappings`, which P2.5 shipped without it (D-035).
- **Out:** as in the schema-task rules.
- **Files:** `supabase/migrations/*_catalog_ai_audit.sql`, `supabase/tests/ai_audit.sql`, `supabase/README.md`, types.
- **Verification:** the schema-task rules.

### [x] P2.8 Schema: scoring and evidence
- **Slice:** schema.
- **Goal:** the scoring and evidence tables (§3.6).
- **Deps:** P2.4, P2.5, P2.7.
- **In:**
  - Tables `rubrics`, `company_scores`, `score_citations`, `documents`, `document_entities` (exactly one of company/brand), `certifications` (exactly one of company/brand/product), `external_ratings`, `company_events`.
  - A deferred constraint trigger: an `approved` score needs at least one citation.
  - The view `published_company_scores` (§4).
  - Document visibility follows its links (§3.6).
- **Out:** as in the schema-task rules.
- **Files:** `supabase/migrations/*_catalog_scoring_evidence.sql`, `supabase/tests/scoring_evidence.sql`, `supabase/README.md`, types.
- **Verification:** the schema-task rules. Also:
  - approving a score with no citation fails at commit, and succeeds once a citation is added;
  - `anon` sees only approved, non-superseded scores;
  - a document with no visible link is hidden from `anon`.

### [x] P2.9 Schema: editorial
- **Slice:** schema.
- **Goal:** `product_features`, `transparency_steps` and `stories` (§3.7).
- **Deps:** P2.5.
- **In:**
  - `product_features`: icon allow-list check.
  - `transparency_steps`: `step` unique per product.
  - `stories`: public where `published_at <= now()`.
- **Out:** as in the schema-task rules.
- **Files:** `supabase/migrations/*_catalog_editorial.sql`, `supabase/tests/editorial.sql`, `supabase/README.md`, types.
- **Verification:** the schema-task rules. Also, a future-dated story is hidden from `anon`.

### [x] P2.10 Core: record schemas, slugs and GTIN
- **Slice:** core-records.
- **Goal:** the typed, validated shapes that every source parser produces, plus the two key builders that every import needs.
- **Deps:** P1.1. Can run before the schema tasks; field names must match DATA_MODEL §3.
- **In:**
  - `packages/core/src/records/`: zod schemas per record kind: company, brand, brand-ownership edge, company-ownership edge, product, product identifier, store, store listing, price observation, reference price, document. Each embeds a shared `provenance` schema (§1.2).
  - Tightening from CATALOG_REVIEW `providers/schemas.ts`: price > 0 and ≤ 10,000, a currency enum, URL checks, ISO datetimes.
  - `slugify()` per §1.3, plus a collision helper (`-ca`, `-2` …).
  - `normalizeGtin()` per §1.4: digits only, check digit, GTIN-14 padding, and classification of restricted 02/20–29 prefixes and 4–5 digit PLUs. Moved forward from Phase 4 because P2.17 and P2.18 key on it (D-030).
  - `runs.ts`: run modes and statuses (adapted from legacy `jobs/job-types.ts`).
  - `zod` becomes a runtime dependency of `@sarvis/core` (DECISIONS entry).
- **Out:** the size/unit parser (P4); the validation library (P2.11).
- **Files:** `packages/core/src/records/**`, `packages/core/src/slug.ts`, `packages/core/src/gtin.ts`, `packages/core/src/runs.ts`, `packages/core/src/index.ts`, tests beside them, `packages/core/package.json`, `docs/DECISIONS.md`.
- **Verification:**
  - Unit tests: slug examples from §1.3 ("Ben's Original" → `bens-original`, accents, `&`, 64-char cap); GTIN cases (UPC-A, EAN-13, EAN-8, a bad check digit, a 02 prefix, a PLU, and the 13 legacy barcodes from `docs/legacy/data/products.json`); one valid and one invalid sample per record schema.
  - `normalizeGtin()` gives the same answers as the SQL `gtin_is_valid` / `gtin_normalize` / `gtin_is_restricted` vectors in `supabase/tests/products.sql` (added in P2.5).
  - `npm run typecheck`, `lint` and `test` pass.
  - Metro still bundles the app with zod in core: `npm run web` loads `/` with no console errors.

### [x] P2.11 Core: validation library and safeguards
- **Slice:** core-validation.
- **Goal:** one function that turns a batch of parsed records into valid and invalid sets, with failure rows shaped for `validation_failures`.
- **Deps:** P2.10.
- **In:**
  - `validateBatch(kind, records, opts)`, covering the rules `schema`, `required_field`, `gtin_check_digit`, `price_sanity` (hard bounds plus an optional per-category bounds lookup), `unit_parse` (a hook interface that P4's parser plugs into, with a pass-through default) and `duplicate` (in-batch, on the record's stable key).
  - Failure payloads trimmed to ≤ 1 KB.
  - `contentHash()` (sha-256 over the imported fields, in stable key order), from legacy `fingerprintMetadata`.
  - Ported from legacy `jobs/safeguards.ts` and its tests: fail a batch over 50% invalid; fail on a drop from N to 0; warn on a drop over 50%. Extended with thresholds for duplicate rate and unit-parse success.
  - The pure legacy helpers `cleanText`, `stripHtml` and `parsePrice` (negative prices rejected), with their legacy test cases.
- **Out:** `parsePackageSize` and the unit parser (P4).
- **Files:** `packages/core/src/validation/**`, `packages/core/src/text.ts`, `packages/core/src/price.ts`, tests.
- **Verification:**
  - Unit tests cover each rule with a passing and a failing record.
  - The ported safeguards tests pass unchanged apart from imports.
  - `contentHash` is identical for reordered keys.
  - typecheck, lint and test pass.

### [x] P2.12 Pipeline runtime: env, logger, errors, retry, shutdown, DB client
- **Slice:** pipeline-runtime.
- **Goal:** the pipeline process basics, ported from legacy `catalog-worker` rather than rewritten.
- **Deps:** P1.5.
- **In:**
  - `env.ts`: zod-validated, `emptyToUndefined`, readable errors; no Fortinos variables.
  - `log.ts`: single-line JSON with recursive secret redaction, plus a rule that row data from user tables is never logged.
  - `errors.ts`: typed taxonomy with a `retryable` flag. A 403 or 429 is `SourceBlockedError`, which stops the source, never retries, and flags for an alert. Error classes are matched by status and type, not by message substrings.
  - `http/retry.ts`: `sleep` with abort, jitter, and `withRetry`.
  - `shutdown.ts`: SIGINT/SIGTERM → AbortSignal.
  - `db/client.ts`: a service-role client, using `SUPABASE_DEV_SERVICE_ROLE_KEY` locally. The production key is an Actions secret later (Phase 6).
  - The legacy tests for errors and async, ported.
  - Run TS with Node 22 `--experimental-strip-types` (already used by `scripts/`), so no `tsx`. `@supabase/supabase-js` becomes a pipeline runtime dependency (DECISIONS).
- **Out:** HTTP fetching (P2.13), runs (P2.15).
- **Files:** `pipeline/src/{env,log,errors,shutdown}.ts`, `pipeline/src/http/retry.ts`, `pipeline/src/db/client.ts`, `pipeline/test/**` or tests beside the files, `pipeline/package.json`, `.env.example`, `docs/DECISIONS.md`.
- **Verification:**
  - The ported tests pass.
  - A test asserts that a log line containing `service_role_key`, `authorization` or `password` prints `[redacted]`.
  - A smoke script connects to dev with the service role and counts `sources`, printing the count only.
  - typecheck, lint and test pass.

### [x] P2.13 Pipeline: polite HTTP client
- **Slice:** pipeline-http.
- **Goal:** one fetch path for every source that enforces CLAUDE.md's scraper rules.
- **Deps:** P2.12.
- **In:**
  - `http/client.ts`: the `Sarvis/<version> (+repo)` User-Agent (D-015) and a per-host token bucket. The rate defaults to 1 req/s and never exceeds `sources.rate_limit_per_sec`.
  - Exponential backoff with jitter on 5xx and network errors.
  - 403 and 429 throw `SourceBlockedError`. A 429 honours `Retry-After` once, then stops.
  - `http/robots.ts`: fetch and cache `robots.txt` per host, then check the User-Agent and path. A disallowed path throws before any request. A small in-repo parser for `User-agent`, `Allow`, `Disallow` and `Crawl-delay`, so no dependency. `Crawl-delay` raises the per-host delay.
  - `http/cache.ts`: an on-disk cache under `.cache/http/` (gitignored), keyed by method + URL, honouring ETag / Last-Modified and a per-source TTL. Phase 6 persists it with `actions/cache`.
  - `http/paginate.ts`: port of legacy `computeHasNextPage` and `pageFingerprint`, with their tests.
- **Out:** storing raw responses (P2.14).
- **Files:** `pipeline/src/http/**`, tests, `.gitignore`.
- **Verification:**
  - Tests against a local `node:http` server:
    - 5 requests to one host take ≥ 4 s, and two hosts interleave;
    - a 503 then 200 succeeds after a backoff;
    - a 403 throws `SourceBlockedError` with one request made;
    - a robots-disallowed path makes 0 requests to it;
    - a second fetch is served from cache (304 or a TTL hit).
  - The pagination tests pass. typecheck, lint and test pass.

### [x] P2.14 Pipeline: raw store
- **Slice:** pipeline-raw.
- **Goal:** save every raw response, gzipped, before parsing, and read it back for re-parsing (CLAUDE.md "Raw data"; D-010).
- **Deps:** P2.1, P2.12.
- **In:**
  - `raw/store.ts`: gzip (`node:zlib`), then upload to `raw/{source_key}/{run_id}/{seq}.json.gz`, then insert a `raw_objects` row (sha-256, byte size, request URL, HTTP status, `fetched_at`, `expires_at` from the §5 retention table).
  - `readRaw(id)` returns the decompressed body, and fails if the file was deleted.
  - `raw/redact.ts`: header allow-list and body-secret redaction (legacy `sanitize.ts`, generalised), applied before upload.
  - `retentionFor(sourceKey)`: a pure function, unit-tested. The cleanup job is Phase 6.
- **Out:** the cleanup job (P6).
- **Files:** `pipeline/src/raw/**`, tests.
- **Verification:**
  - Unit tests for redaction and retention.
  - A dev-DB check script uploads a 3-record fixture, reads it back byte-equal, shows the `raw_objects` row, then deletes the file and the row. Paste the output.
  - Storage usage before and after is unchanged.

### [x] P2.15 Pipeline: source interface and run driver
- **Slice:** pipeline-runs.
- **Goal:** the generic run lifecycle that every source plugs into, with bookkeeping in `ingestion_runs`.
- **Deps:** P2.2, P2.11, P2.13, P2.14.
- **In:**
  - `sources/source.ts`: the source interface `plan → fetch (via the HTTP client) → storeRaw → parse(raw) → validate → upsert`. `parse` takes only stored raw, so it can re-run from storage. Kept from legacy: capability flags and `verifyContext` before writing.
  - `sources/registry.ts` and `sources/index.ts`: legacy registry pattern and tests.
  - `runs/driver.ts`:
    - refuses a source unless `verdict = 'use'` and `enabled`;
    - sweeps stale `running` runs to `failed` at start;
    - creates the run row (job, version, mode, sample size, git sha, trigger);
    - checks for cancellation between pages and applies a politeness delay;
    - records `expected_total` and `counts`;
    - writes events (capped at 50) and `validation_failures` (capped at 50, with `counts.invalid` holding the full number);
    - applies the safeguards;
    - sets the final status (port of `jobs/progress.ts`);
    - deactivates conservatively: only a clean, full, uncancelled run may mark unseen rows inactive.
  - `--dry-run` runs everything except upserts and raw writes.
  - The upsert step is an injected function here; P2.16 supplies the real ones.
- **Out:** domain upserts (P2.16), the CLI (P2.17).
- **Files:** `pipeline/src/sources/**`, `pipeline/src/runs/**`, tests.
- **Verification:**
  - Unit tests with a fake source and an in-memory DB adapter:
    - an `avoid` source is refused;
    - a stale run is swept;
    - 60 invalid records store 50 failures and `counts.invalid = 60`;
    - a batch that is more than 50% invalid fails;
    - cancel mid-run gives `cancelled`, with no deactivation;
    - `expected_total` ≠ fetched gives `completed_with_errors`.
  - The ported progress and registry tests pass.

### [x] P2.16 Pipeline: idempotent upsert helpers
- **Slice:** pipeline-db.
- **Goal:** per-domain writers that upsert on stable keys, skip unchanged and locked rows, and always carry provenance.
- **Deps:** P2.6, P2.10, P2.15.
- **In:**
  - `db/` writers for companies and brands (on slug or QID), ownership edges, products (on GTIN, then `(source_id, external_id)`), product identifiers, stores, store listings (on SKU or listing key), and price observations (append on change, otherwise bump `last_confirmed_on`).
  - Chunked `.in()` reads (300) and upserts (500), from legacy `catalogue-repository.ts`.
  - `content_hash` comparison: unchanged rows count as `unchanged` and aren't written.
  - `locked_fields` are left alone and counted in `skipped_locked`.
  - Change detection ported from legacy `db/upsert.ts`: the 0.005 price epsilon, with its 10 tests.
  - Unmatched listings create `match_candidates` rather than products (review fix).
  - Generated types only. Each writer returns `inserted`, `updated`, `unchanged` and `skipped_locked`.
- **Out:** the matcher (P4); scoring and document writers (P7).
- **Files:** `pipeline/src/db/**`, tests.
- **Verification:**
  - The ported change-detection tests pass.
  - A dev-DB script under the `fixture` source upserts 5 products, 2 brands and 3 prices twice:
    - run 2 reports `inserted = 0` and `unchanged = 5 / 2 / 3`;
    - a changed price appends 1 row, and an equal price only bumps `last_confirmed_on`;
    - a locked field survives;
    - every row has a non-null `source_id`, `fetched_at`, `method` and `method_version`;
    - test rows are deleted afterwards.
  - Paste the counts.

### [x] P2.17 Pipeline: CLI, fixture source and run-twice e2e test
- **Slice:** pipeline-cli.
- **Goal:** meet the Phase 2 exit end to end.
- **Deps:** P2.16, P2.20.
- **In:**
  - `pipeline/src/cli.ts`, using `node:util` `parseArgs` with no dependency: `pipeline run <source> [--sample N] [--dry-run] [--mode full|delta]`. The run row records `triggered_by = cli`.
  - The root script is `npm run pipeline -- run <source> …`.
  - A `fixture` source serves about 20 synthetic, OFF-shaped product records (with brands and a few deliberately invalid ones), plus a `robots.txt`, from an in-process local HTTP server, so the full polite-client path runs.
  - An e2e test (Vitest, tagged and skipped when `SUPABASE_DEV_SERVICE_ROLE_KEY` is unset, so CI stays secret-free per D-019):
    - run 1, then run 2;
    - assert the same row counts and `inserted = 0` on run 2;
    - check the provenance columns on every row;
    - check one `raw_objects` row per page, with the stored file re-parsing to identical records;
    - check the invalid records appear in `validation_failures`;
    - clean up the `fixture` rows and files at the end.
  - CLAUDE.md Commands: fill "Run a scraper on a sample".
- **Out:** real sources (Phase 3).
- **Files:** `pipeline/src/cli.ts`, `pipeline/src/sources/fixture/**`, `pipeline/test/e2e/**`, `package.json`, `pipeline/package.json`, `CLAUDE.md`, `.env.example` if needed.
- **Verification:**
  - `npm run pipeline -- run fixture --sample 10 --dry-run` prints counts and writes nothing (row counts checked before and after).
  - The e2e test passes locally; paste the summary into PROGRESS.
  - `npm test` in CI stays green, with the e2e test skipped.

### [x] P2.18 Legacy re-import
- **Slice:** legacy-import.
- **Goal:** bring the P0.2 legacy content into the new schema as `pending` facts with `legacy-import` provenance (DATA_MODEL §8).
- **Deps:** P2.8, P2.9, P2.17.
- **In:**
  - A `legacy-import` source in the registry. It reads `docs/legacy/data/*.json` (local files, so no HTTP). Each file is still stored as a raw object.
  - Mapping per §8:
    - companies (slugs kept);
    - brands (slugs generated) plus `brand_ownership`;
    - `ethical_scores` → `company_scores` under a `legacy` rubric row (`approved_by_owner_at` null, D-030);
    - certifications, and boycotts/controversies → `company_events`;
    - products (barcode → GTIN via P2.10, with the brand link inferred from the name where a brand matches exactly; others left null and queued). The Patagonia Provisions Soup barcode `0850034340016` fails the check digit (found in P2.10): import it with a null `gtin` and put the bad barcode in its queue `reason`;
    - product features, transparency steps (mapped to the four steps by title, not `step_number`, per D-039), and stories (no body, cover image dropped until a licence check).
  - Every reviewable fact is `pending` with a `review_queue` row (`legacy_fact`). The P0.2 quality notes (Kashi, Ben's Original, Bolthouse, Sun-Brite) become the queue `reason` where they apply.
- **Out:** fixing the flagged errors (that's admin review, Phase 5); legacy product-level scores (dropped per §8).
- **Files:** `pipeline/src/sources/legacy-import/**`, tests, `docs/legacy/data/README.md` (a line on the re-import).
- **Verification:**
  - Run it twice with `npm run pipeline -- run legacy-import`. Run 2 shows `inserted = 0`.
  - Row counts per table match the README (11 companies, 49 brands, 55 scores, 13 products, …), with any intentional drops listed.
  - `anon` sees none of the pending facts. Show 3 example rows with provenance.

### [x] P2.19 Phase 2 exit check
- **Slice:** release-check.
- **Goal:** prove the exit criteria together, and measure the DB against the budget.
- **Deps:** P2.1–P2.18, P2.22, P2.23.
- **Status:** done 2026-10-29. Every check passed on `bf422c7`; CI, red there on the limiter, is green from `fdda6a8` (P2.23). The evidence is in PROGRESS.
- **In:**
  - Clean clone, `npm ci`, typecheck/lint/test, and the fixture e2e test (run twice).
  - `get_advisors` is clean.
  - `pg_total_relation_size` per catalog table and `pg_database_size`, compared with BUDGET §3 row widths (an empty-table baseline plus legacy rows).
  - Storage bucket usage.
  - The latest CI run is green.
- **Out:** new features. Gaps become PLAN tasks.
- **Files:** `docs/PROGRESS.md`, `docs/catalog/BUDGET.md` (an "Actuals" note).
- **Verification:** a checklist in PROGRESS with evidence for each exit bullet: test output, the size table, advisors output and the CI run URL.

### [x] P2.20 Make `@sarvis/core` loadable by Node strip-types (added in P2.12)
- **Slice:** core-records.
- **Goal:** the pipeline CLI can import core at runtime. Today `node --experimental-strip-types` fails with `ERR_MODULE_NOT_FOUND` on core's extensionless relative imports (`./gtin`); Vitest and Metro resolve them, Node doesn't. P2.12 only needed type imports from core, which Node erases.
- **Deps:** P2.11.
- **In:** relative imports in `packages/core/src/**` name the `.ts` file; core's tsconfig gets `allowImportingTsExtensions` and `erasableSyntaxOnly` (as `pipeline/` has); fix any non-erasable syntax.
- **Out:** any behaviour change.
- **Files:** `packages/core/src/**`, `packages/core/tsconfig.json`.
- **Verification:**
  - `node --experimental-strip-types -e "import('@sarvis/core')"` from `pipeline/` loads and lists the exports.
  - Metro still bundles: `npm run web` loads `/` with no console errors.
  - typecheck, lint and test pass.

### [x] P2.21 Make the HTTP rate-limit test immune to timing jitter (added in P2.17)
- **Slice:** pipeline-http.
- **Goal:** `npm test` is reliably green. `src/http/client.test.ts` "spaces 5 requests to one host at least 1 s apart" failed in about 1 of 5 full runs (P2.16, and once in P2.17 after 5014 ms) and passed on rerun. It most likely measures the gaps from the server's receive times, which can drift under CPU load even when the client spaced its sends correctly.
- **Deps:** none.
- **In:** capture which assertion fails (loop the test under load), then measure the spacing where the limiter acts (e.g. a send-time hook or an injected clock) or allow for the jitter; the same check for the two-host interleave test.
- **Out:** changing the limiter itself, unless the capture shows a real bug.
- **Files:** `pipeline/src/http/client.test.ts` (and `client.ts` only if needed).
- **Verification:** the test passes 20 runs in a row with `npm test` running alongside; typecheck, lint and test pass.

### [x] P2.22 Hide unreviewed companies, brands and products from users (added after P2.18)
- **Slice:** schema.
- **Goal:** users see no company, brand or product until it has been reviewed or has passed a written auto-approve rule. P2.18 left the 11 legacy companies, 49 brands and 13 products visible to `anon`, because those tables had no review block. The legacy details aren't reliable (wrong owners, outdated CEOs, non-grocery companies) and must not be shown.
- **Deps:** P2.18.
- **In:**
  - Add the §1.5 `+review` block (`review_status`, `reviewed_by`, `reviewed_at`, `decision_method`) to `companies`, `brands` and `products`, in one migration. Existing rows become `pending`.
  - Public RLS on all three becomes `review_status = 'approved'` plus the current status filter. Admins still see everything.
  - Writers: new rows arrive `pending`, and an import never changes `review_status`. A reviewed row stays frozen to the fields an admin locked, as today.
  - Legacy companies, brands and products each get a `legacy_fact` queue row. The company reasons carry the P0.2 notes (outdated Nestlé/Unilever CEOs; Patagonia not grocery). This makes `company_review_reason` possible on the company and brand records.
  - **Auto-approve rule (owner confirmed 2026-10-29, D-050):** OFF products that pass validation are auto-approved (`decision_method = 'auto'`). Legacy and AI-sourced entities are never auto-approved.
  - DATA_MODEL §1.6 and §3.2–3.3 are updated to match.
- **Out:** the admin review UI (Phase 5); the auto-approve code for OFF (Phase 3, using the rule recorded here).
- **Files:** `supabase/migrations/`, `supabase/tests/`, `packages/core` (records and types), `pipeline/src/db/writers/**`, `pipeline/src/sources/legacy-import/**`, `docs/catalog/DATA_MODEL.md`.
- **Verification:**
  - The schema-task checks: the RLS script, advisors, `relrowsecurity`, typecheck/lint/test.
  - `anon` and a non-admin user see 0 companies, brands and products on dev; an admin sees 11 / 49 / 13.
  - The legacy re-import run again gives `inserted = 0`, leaves every row `pending`, and the queue has one row per company, brand and product with no duplicates.
  - `check:writers` and the fixture e2e still pass.

### [x] P2.23 Host limiter: stamp the turn at the send, not when `acquire` returns (added in P2.19)
- **Slice:** pipeline-http.
- **Goal:** consecutive sends to a host are never less than the interval apart, as D-051 promises. CI on `bf422c7` failed `client.test.ts:100` "spaces 5 requests to one host at least 1 s apart" with `expected 999 to be greater than or equal to 1000` (https://github.com/LukaMS/sarvis/actions/runs/40944884023). `HostLimiter.acquire` records the turn time (`done(Date.now())`) in its `finally`, but `send()` then builds `AbortSignal.timeout`/`AbortSignal.any` before `fetch`. If the millisecond ticks in between, the first send is stamped 1 ms after its turn. The next send can then go out exactly one interval after that turn, which is 999 ms after the first send.
- **Deps:** P2.21.
- **In:** the turn is stamped right before `fetch` is called (e.g. `acquire` hands back a `sent()` callback, or the signal setup moves before `acquire`). A cancelled caller still counts as a turn. Add a deterministic test that delays the gap between acquire and send, so it fails on the current code.
- **Out:** changing the 1 req/s rule or other client behaviour.
- **Files:** `pipeline/src/http/client.ts`, `pipeline/src/http/client.test.ts`, D-051 (amend).
- **Verification:** the new test fails before the fix and passes after; `client.test.ts` passes 20 runs in a row with `npm test` looping alongside; typecheck, lint and test pass; the CI run for the commit is green.

### Phase 2 milestone coverage

| Milestone | Tasks |
|---|---|
| M1 Schema (8 domains) | P2.1 bookkeeping, P2.3 matching and review, P2.4 ownership, P2.5 products, P2.6 stores and prices, P2.7 AI and audit, P2.8 scoring and evidence, P2.9 editorial |
| M2 Sources seed and verdict refusal | P2.2 (seed), P2.15 (refusal) |
| M3 Core records and validation | P2.10 (schemas, slug, GTIN), P2.11 (validation, safeguards) |
| M4 Pipeline framework | P2.12 (env, logger, errors, retry, shutdown), P2.13 (HTTP client; limiter fixes P2.21, P2.23), P2.14 (raw store), P2.15 (driver, expected vs fetched), P2.16 (upserts, change detection), P2.17 (CLI) |
| M5 Legacy re-import | P2.18, P2.22 (nothing legacy is user-visible) |
| M6 Tests | Unit tests in P2.10–P2.16; run-twice e2e in P2.17 and P2.18 |
| M7 Budget check | P2.19 |
| Exit criteria | P2.17 (proof), P2.19 (checked together) |
| Added by the review (D-080) | P2.24 (run lock, database retries, POST cache). It sits in Phase 4 after P4.3, where it runs. |

**Open 🟡 decisions in Phase 2:** none. Every choice above follows from DATA_MODEL or an existing decision; the new ones are in D-030.

## Phase 3 — Catalog sources (full detail)

**Exit:**
- Each approved source has been run on a sample, then scaled, with row counts, examples and validation results in PROGRESS.
- The DB and storage stay within budget.

- [x] **P3.0 Refine Phase 3** → done 2026-10-29 (this section; D-053).

**Milestones** (each one maps to tasks in the coverage table at the end of this phase):
- **M1 Shared groundwork:** the contact email for sources that ask for one (D-015), streaming dump downloads, the missing writers (`reference_price`, `document`), and the schema additions Phase 3 needs (queue item types `company`/`brand`, a Wikipedia summary field, per-source provenance for companies).
- **M2 Open Food Facts (S1):** the Canadian subset with the BUDGET §4 import filter (~95k rows), real row width measured in the sample, the D-050 auto-approve, then daily deltas. The ODbL extract is published to `public-exports` (D-013 D1), with egress watched (BUDGET §6).
- **M3 Open Prices (S5):** Canadian price observations and their OSM stores.
- **M4 StatCan (S6):** average retail prices, Canada and Ontario, as the price-sanity reference.
- **M5 Wikidata (S17):** brand → company → parent ownership, with dates and QIDs as stable IDs.
- **M6 Wikipedia (S19):** summaries for company pages, with attribution.
- **M7 SEC EDGAR (S20):** Exhibit 21 subsidiaries → `pending` company ownership edges.
- **M8 Corporations Canada (S21, low priority):** an identity check only.
- **M9 Budget:** a check after each scale-up, and an exit check over all of Phase 3.

**Not in Phase 3:**
- Retailer catalog sources: **none**. All Ontario grocers, Walmart, Costco and Flipp are avoided (D-013). Revisit only if the owner gets written permission.
- Linking products to brands, creating brands from OFF brand strings, and the taxonomy: Phase 4. OFF products arrive with `brand_text` only (D-048), and Wikidata brands with QIDs; the P4 resolver joins them.
- `price_sanity_bounds`: Phase 4, once there are categories to derive them for. StatCan rows land in `reference_prices` here.
- In-app attribution for OFF, Open Prices and Wikipedia: Phase 8 (product and company screens) and Phase 10 (About screen). The app shows no catalog data before then.
- Scheduling: Phase 6. Phase 3 runs everything from the CLI on the dev machine against the dev project.

**Feature slices** (each task touches exactly one): `pipeline-runtime`, `schema`, `pipeline-http`, `pipeline-db`, `source-off`, `exports`, `source-open-prices`, `source-statcan`, `source-wikidata`, `source-wikipedia`, `source-edgar`, `source-corp-canada`, `release-check`.

**Rules for every source task (P3.5–P3.7, P3.9–P3.18):**
- The source lives in `pipeline/src/sources/<key>/` and is registered under its seeded `sources.key`. It uses the polite client, stores raw before parsing, and sets `method`/`method_version` (`<key>@<version>`).
- **Its first step is a terms check:** re-read the SOURCES.md entry's terms and robots.txt, and update `terms_checked_at` (SOURCES.md plus a `sources` migration) if anything changed. If the terms now prohibit automated access, stop and ask the owner (CLAUDE.md).
- Mapping and parsing are unit-tested on a small saved fixture of the real format (no personal data, D-012). No network in `npm test`.
- **Sample tasks (a):** `npm run pipeline -- run <key> --dry-run --sample 100`, then `--sample 100` for real, then the same command again.
- **Scale-up tasks (b):** a `--mode full` run, then a second one.
- **Verification (all source tasks):**
  - PROGRESS gets the run ids, `counts` from both runs, 5 example records (as stored, with provenance), and the `validation_failures` by rule. Failures are reported as they are.
  - The second run inserts 0 rows (`counts.inserted = 0`).
  - Every written row has `source_id`, `fetched_at`, `method`, `method_version`, `ingestion_run_id`, and either `source_url` or a `url_template` that rebuilds it (a SQL count of rows missing one is 0).
  - `raw_objects` rows exist for the run, and one file read back with `readRaw()` re-parses to the same records.
  - `npm run typecheck`, `lint` and `test` pass.
- **Extra verification for scale-up tasks:** the budget check. `pg_total_relation_size` for the tables the source writes, `pg_database_size`, and `raw` bucket bytes, compared with BUDGET §3 and §5, go in PROGRESS and in a BUDGET "Actuals" line. Anything over its estimate by more than 20% becomes a PLAN task before the next scale-up.
- **Out (all source tasks):** scheduling (Phase 6), matching and resolution (Phase 4), admin UI (Phase 5), app UI (Phase 8).

### [x] P3.1 Pipeline: contact email for sources that ask for one
- **Slice:** pipeline-runtime.
- **Goal:** sources whose terms ask for an email in the User-Agent (OFF, SEC EDGAR) get the owner's email; every other source keeps the repo URL (D-015, amended).
- **Deps:** P2.19.
- **In:**
  - `PIPELINE_CONTACT_EMAIL` in the env loader (optional, email-validated) and in `.env.example` as a placeholder.
  - A source capability, e.g. `contact: 'email'`. The client then sends `Sarvis/<version> (+https://github.com/LukaMS/sarvis; <email>)`, or the form the source's docs ask for (OFF: `AppName/Version (ContactEmail)`).
  - The driver refuses an email-requiring source with a configuration error **before** a run row exists when the variable is unset. The message names the variable, never a value.
  - The email is never logged, never stored in raw envelopes or run rows, and never printed by the CLI (log redaction gets the key).
- **Out:** the sources themselves.
- **Files:** `pipeline/src/env.ts`, `pipeline/src/http/client.ts`, `pipeline/src/sources/source.ts`, `pipeline/src/runs/driver.ts`, `pipeline/src/log.ts`, tests beside each, `.env.example`.
- **Verification:**
  - Unit tests: the UA with and without the capability; refusal when unset; the value is absent from log output and from a stored raw envelope.
  - The fixture e2e still passes (`npm run e2e --workspace @sarvis/pipeline`).
  - `npm run typecheck`, `lint` and `test` pass.

### [x] P3.2 Schema: Phase 3 additions
- **Slice:** schema.
- **Goal:** the small schema changes Phase 3 sources need, in one migration.
- **Deps:** P2.19.
- **In:**
  - `review_queue.item_type` gains `company` and `brand` (D-052 gap), and the writers' type mapping uses them for non-legacy records with a `review_reason`.
  - **`company_sources`**, mirroring `product_sources` (RLS **admin**): `company_id`, `source_id`, `external_id`, `source_url`, `fetched_at`, `last_seen_at`, `method`, `method_version`, `fields text[]` (the columns that source set), `ingestion_run_id`, `raw_object_id`. Unique on `(company_id, source_id)`. A company has one +prov block (its creating source); this records the provenance of fields that a second source fills in (Wikipedia revision, Corporations Canada number, SEC filing).
  - **`documents.summary`** text ≤ 2,000 characters, allowed only for `kind = 'wikipedia'` (BUDGET S19: one summary per company). It's a short extract shown with attribution, not full text (D-014).
  - Public read of a Wikipedia document when it's the page of an approved company: a `companies.wikipedia_document_id` FK plus a clause in the `documents` select policies. The summary is then visible exactly when its company is.
  - DATA_MODEL §3.2, §3.5, §3.6 and §7 updated to match.
- **Out:** the writers that fill these (P3.4, P3.14, P3.18).
- **Files:** `supabase/migrations/*_catalog_phase3_additions.sql`, `supabase/tests/phase3_additions.sql`, `supabase/README.md`, `packages/core/src/db/database.types.ts`, `pipeline/src/db/writers/review.ts`, `docs/catalog/DATA_MODEL.md`.
- **Verification:** the Phase 2 schema-task rules (RLS script, advisors, `relrowsecurity`, typecheck/lint/test). Also:
  - a `company` record with a `review_reason` from a non-legacy source gets one `review_queue` row of type `company` (unit test plus `check:writers`);
  - `anon` reads a Wikipedia document's summary only when its company is approved;
  - a non-Wikipedia document with a summary is rejected.

### [x] P3.3 Pipeline: streaming dump downloads
- **Slice:** pipeline-http.
- **Goal:** download large bulk files (OFF, Open Prices, Corporations Canada) to disk and read them as streams, because the polite client returns whole bodies as text (D-043).
- **Deps:** P3.1.
- **In:**
  - `download(url, opts)` on the polite client: the same robots check, host limiter, UA and retry policy. It streams to `.cache/dumps/<sha-of-url>` (gitignored), computes sha-256 while writing, keeps `etag` / `last-modified` in a sidecar and revalidates with them, so an unchanged file isn't fetched again.
  - `openLines(url | path, {gzip})`: an async iterator over the lines of a stream, which can stop early. A sample run then reads only the start of a dump, and stopping closes the connection.
  - The driver records `dump_url`, `dump_sha256` and `dump_fetched_at` on the run when a source reports them.
  - No new dependency: `node:zlib`, `node:stream`, `node:readline`.
- **Out:** parsing any specific format.
- **Files:** `pipeline/src/http/download.ts`, `pipeline/src/http/lines.ts`, tests beside them, `pipeline/src/runs/driver.ts`, `pipeline/src/sources/source.ts`.
- **Verification:**
  - Unit tests against a local `node:http` server serving a gzipped file: the sha-256 matches; a second call with an unchanged ETag gets a 304 and no new body; a robots disallow refuses; a 503 retries; stopping the line iterator after 10 lines closes the socket.
  - `npm run typecheck`, `lint` and `test` pass.

### [x] P3.4 Writers: reference prices, documents and company enrichment
- **Slice:** pipeline-db.
- **Goal:** writers for the two record kinds that core already validates (P2.10) but nothing writes yet, plus a way for a second source to fill in company fields.
- **Deps:** P3.2.
- **In:**
  - `reference_price` writer: key `(vector_id, ref_month)`, read-diff-write (D-046), unchanged rows untouched.
  - `document` writer: key `url_normalized`; `summary` and `wikipedia_revision_id` update in place on change.
  - Company enrichment: a source can set named fields on an **existing** company (matched by QID, slug or a listed id) without replacing its +prov block. The fields and their provenance go in `company_sources`. Locked fields are skipped (D-046).
  - `writerFor` gains these kinds; `check:writers` covers them.
- **Out:** the sources (P3.11, P3.14, P3.16, P3.18).
- **Files:** `pipeline/src/db/writers/prices.ts`, `pipeline/src/db/writers/documents.ts`, `pipeline/src/db/writers/ownership.ts`, `pipeline/src/db/writers/index.ts`, `pipeline/src/db/writers.devdb.ts`.
- **Verification:**
  - `npm run check:writers --workspace @sarvis/pipeline` writes the new kinds twice: the second pass is all `unchanged`, provenance is correct, and an enrichment leaves the company's own `source_id` alone while adding one `company_sources` row.
  - `npm run typecheck`, `lint` and `test` pass.

### [x] P3.5 OFF (a): Canadian sample
- **Slice:** source-off.
- **Goal:** the first real products. 100 Canadian OFF products go dump → filtered extract → parsed → validated → upserted.
- **Deps:** P3.1, P3.3.
- **In:**
  - Source `off`, email UA (P3.1). It reads the CSV export (`en.openfoodfacts.org.products.csv.gz`, ~0.9 GB, tab-separated) with `openLines`, which a sample stops early.
  - Filter: `countries_tags` contains `en:canada`, then the BUDGET §4 import filter (a name, and a brand or a category). Rows dropped by each rule are counted in the run's events.
  - Raw: the filtered extract (only the parsed columns), split into 10k-record `seq` files (D-044), with the dump URL and sha-256 on the run.
  - Mapping as in the fixture preview (D-048): `code` → `external_id` + normalized `gtin`, `brands` → `brand_text`, the quantity fields, `en:` label codes, `last_modified_t`, the image path as `image_key`, `source_url` null (rebuilt from `url_template`). Confirm the CSV column names against the real header first.
  - **D-050 auto-approve:** products from `off` that pass validation are written with `review_status = 'approved'`, `decision_method = 'auto'`, `reviewed_at = now()` on insert. An update never moves a row away from `rejected`, and no other source takes this path (a writer test proves `legacy-import` and `fixture` rows stay `pending`).
  - **Row width:** measure `pg_column_size` of the sample rows against BUDGET §3 (`products` 348 B) and note it in BUDGET "Actuals".
- **Out:** the full import (P3.6), deltas (P3.7).
- **Files:** `pipeline/src/sources/off/{index,map,csv}.ts` and tests, `pipeline/src/sources/registry.ts`, `pipeline/src/db/writers/products.ts`, `docs/catalog/BUDGET.md`.
- **Verification:** the source-task rules. Also: the sample's rows are `approved` / `auto`; the filter counts are in PROGRESS; the measured row width is in BUDGET.

### [x] P3.6 OFF (b): full Canadian import
- **Slice:** source-off.
- **Goal:** every Canadian OFF product that passes the filter (~95k estimated).
- **Deps:** P3.5.
- **In:**
  - `--mode full` over the whole dump, on the dev machine. The download lands in `.cache/dumps/`; the dump itself is never stored in Supabase (D-010).
  - Deactivation (`supportsDeactivation`): a product no longer in the Canadian set after a clean full run becomes `discontinued`, never deleted.
  - If a full run is too slow for one session (over ~1 h), record the timing and add a task, rather than cut the filter.
- **Out:** deltas (P3.7).
- **Files:** `pipeline/src/sources/off/*`, `docs/catalog/BUDGET.md`.
- **Verification:** the source-task rules, including the budget check (`products`, `product_sources`, `raw_objects`, the `raw` bucket). Also: the real row count against the ~95k estimate, and the second full run reports `unchanged` for nearly every row (the `content_hash` path).

### [x] P3.7 OFF: daily deltas
- **Slice:** source-off.
- **Goal:** keep products fresh between full imports, using OFF's daily delta files (`/data/delta/index.txt`, last 14 days).
- **Deps:** P3.6.
- **In:**
  - `--mode delta` (`supportsDelta`): fetch the delta files not yet imported (tracked by file name on earlier runs), filter them to Canada and the import filter as in P3.5, map the JSONL records with the OFF v2 mapping (D-048), and upsert.
  - Deltas never deactivate (they can't signal deletions; SOURCES.md S1), so the periodic full import stays.
  - Raw: the filtered delta extract, kept 30 days (D-044).
- **Out:** the schedule (Phase 6).
- **Files:** `pipeline/src/sources/off/*`.
- **Verification:** the source-task rules, with `--mode delta` in place of the sample commands: one delta run, then a second that fetches no new files and writes nothing.

### [x] P3.8 Publish the ODbL extract
- **Slice:** exports.
- **Goal:** meet the ODbL share-alike condition (D-013 D1) by publishing the OFF- and Open-Prices-derived tables.
- **Deps:** P3.6, P3.10.
- **In:**
  - The public Storage bucket `public-exports` (a migration: public read, no client write).
  - `npm run pipeline -- export odbl`: the OFF-derived `products` columns and the Open Prices `price_observations` and `stores` columns, as CSV.gz, plus a README naming the ODbL, the sources and the date. Only the latest 2 exports are kept (BUDGET §5: ≈ 8 MB each).
  - No user data: receipt-derived prices are excluded until the Phase 8 consent decision.
  - Egress: the export's size goes in the BUDGET §6 egress note.
- **Out:** a link to it in the app (Phase 10 About screen).
- **Files:** `supabase/migrations/*_public_exports_bucket.sql`, `pipeline/src/exports/odbl.ts` and test, `pipeline/src/cli.ts`, `docs/catalog/BUDGET.md`, `docs/catalog/SOURCES.md` (where the extract lives).
- **Verification:**
  - The export runs; the file downloads anonymously from its public URL; its row count equals a SQL count of OFF products; the README is present.
  - A second export leaves exactly 2 files.
  - `anon` can't write to the bucket. `get_advisors` shows no new warnings.
  - `npm run typecheck`, `lint` and `test` pass.

### [x] P3.9 Open Prices (a): Canadian sample
- **Slice:** source-open-prices.
- **Goal:** the first real store prices, from Open Prices' daily dump.
- **Deps:** P3.3, P3.6.
- **In:**
  - Source `open-prices`: `prices.jsonl.gz` and `locations.jsonl.gz` via `download` / `openLines`, filtered to `currency = CAD` and Canadian locations.
  - Locations → `stores` keyed on `(osm_type, osm_id)`, banner left null (D-036 allows it). Prices → `price_observations` keyed on `(source_id, external_id)` = the Open Prices price id, with `is_discounted` / `price_without_discount`.
  - A price whose product code isn't in `products` is skipped with a counted `unmatched_product` event and stays in the raw extract for a later re-parse.
- **Out:** the full CAD set (P3.10).
- **Files:** `pipeline/src/sources/open-prices/*` and tests, `pipeline/src/sources/registry.ts`.
- **Verification:** the source-task rules. Also: the unmatched-product count and the store count.

### [x] P3.10 Open Prices (b): all Canadian prices
- **Slice:** source-open-prices.
- **Goal:** every CAD price (697 on 2026-10-26).
- **Deps:** P3.9.
- **In:** `--mode full`. Watch the D-046 known limit (the price writer reads a store's whole history); add a "latest per series" RPC only if the run is slow.
- **Out:** contributing receipt prices back (Phase 8, D-013 D7).
- **Files:** `pipeline/src/sources/open-prices/*`, `docs/catalog/BUDGET.md`.
- **Verification:** the source-task rules, including the budget check. Also: the count against the Open Prices API total for CAD on the same day.

### [x] P3.10a Budget: store and price row widths (added in P3.10)
- **Slice:** source-open-prices.
- **Goal:** bring the `stores` and `price_observations` row widths back within 20% of BUDGET §3, or re-baseline §3 with a reason. P3.10 measured them over the line (the budget rule in "Rules for every source task").
- **Deps:** P3.10.
- **Found in P3.10:** `stores` rows average **429 B** (`pg_column_size`) against 278 B (+54%); at the §3 row count (3,000) that projects to 1.8 MB against 1.3 MB. Most of it is `address` (117 B on average), which is the whole OSM display name: it repeats the city, region, province, postal code and country that have their own columns. `price_observations` rows average **258 B** against 208 B (+24%); that projects to 8.1 MB against 7.0 MB (+16%, inside the line), mostly the per-row `source_url` (~48 B).
- **In:**
  - Open Prices `address`: keep only the street part (house number and street), dropping the segments that repeat `city`, `province`, `postal_code` and the country, and the regions in between. `open-prices@1.0.1`; a re-run updates the 100 stores in place.
  - Re-measure both tables. If `price_observations` is still over 20%, either add the checked `url_template` to the `open-prices` source row (a `sources` migration; `source_url` then null, D-032) or re-baseline §3 with the reason.
- **Out:** banner linking (P4).
- **Files:** `pipeline/src/sources/open-prices/map.ts` and test, `docs/catalog/BUDGET.md`, possibly `supabase/migrations/*_open_prices_url_template.sql`.
- **Verification:** the source-task rules for a scale-up (two `--mode full` runs: the first updates 100 stores and nothing else, the second writes nothing), the new widths in a BUDGET "Actuals" line, `npm run typecheck`, `lint` and `test` pass.

### [x] P3.11 StatCan reference prices
- **Slice:** source-statcan.
- **Goal:** monthly average retail prices (table 18-10-0245-01) for Canada and Ontario, as the price-sanity reference.
- **Deps:** P3.4.
- **In:**
  - Source `statcan-18100245`: WDS (`getCubeMetadata`, then data for the Canada and Ontario vectors), respecting `Crawl-delay: 2`.
  - Rows → `reference_prices` keyed on `(vector_id, ref_month)`, since 2017.
  - The source is small (~30k rows estimated in BUDGET §3), so the sample and the full run are one task.
- **Out:** `price_sanity_bounds` (Phase 4).
- **Files:** `pipeline/src/sources/statcan/*` and tests, `pipeline/src/sources/registry.ts`, `docs/catalog/BUDGET.md`.
- **Verification:** the source-task rules for **both** a sample and a full run, including the budget check. Also: one series checked by hand against the StatCan table page (value, month, geography).

### [x] P3.11a Budget: `reference_prices` row width (added in P3.11)
- **Slice:** source-statcan.
- **Goal:** bring `reference_prices` back within 20% of BUDGET §3, or re-baseline §3 with a reason (the budget rule in "Rules for every source task").
- **Deps:** P3.11.
- **Found in P3.11:** 25,520 rows (§3: 30,000) average **266 B** (`pg_column_size`) against 118 B heap (+125%); the table is **9.56 MB** (heap 7.0 + indexes 2.5) against 5.6 MB (+71%). The §3 figure left out the +prov block. Per row: `source_url` 65 B (the same table URL on every row), `method_version` 23 B, the +prov uuids and timestamps (~56 B), and `product_label` / `unit` / `geography` repeated per month (~31 B).
- **In:** pick the cheaper of: (a) a `url_template` route for the table URL (it needs an `external_id`-like key, e.g. the vector id, so it's a schema change to `reference_prices` and the view); (b) re-baseline §3 at ≈ 270 B, since the table is complete at ~26k rows and grows by 220 rows a month (≈ 0.7 MB a year). Record the choice in DECISIONS.
- **Out:** a series table for the repeated labels (only if (a) and (b) both fall short).
- **Files:** `docs/catalog/BUDGET.md`, possibly `supabase/migrations/*_reference_prices_*.sql`, `pipeline/src/sources/statcan/map.ts`.
- **Verification:** the new width or the re-baselined §3 line in a BUDGET "Actuals" line; if the schema changes, two `--mode full` runs (the first updates rows in place, the second writes nothing), `npm run typecheck`, `lint` and `test` pass.

### [x] P3.12 Wikidata (a): ownership sample
- **Slice:** source-wikidata.
- **Goal:** brands, owner companies and parent chains for OFF brand strings, from SPARQL.
- **Deps:** P3.2, P3.6.
- **In:**
  - Source `wikidata`: `plan()` reads the distinct OFF `brand_text` values (split on commas), most frequent first. Batched SPARQL (≤ 50 labels per query, POST) finds items whose English or French label or alias matches exactly, restricted to brand and business classes (P31/P279*). For each hit it walks P127 owned by / P749 parent organization upward (≤ 5 hops), with P580/P582 dates.
  - Records: `brand` and `company` with `wikidata_qid`, name, aliases, country, website, enwiki title, P5531 SEC CIK and P1320 OpenCorporates id where present; `brand_ownership` and `company_ownership` edges with dates and statement rank. The sample writes them `pending` with no `review_reason`; P3.13 adds the D-054 auto-approve.
  - Wikidata limits (SOURCES.md S17): one query at a time, the 60 s timeout, and a 429's `Retry-After`.
  - **Precision check for the owner:** hand-check 50 sampled brand → owner edges against Wikidata and the company's own site, and report how many are right. It's reported for information and doesn't block P3.13. It goes to the owner only if it shows a systematic error (D-054).
- **Out:** linking products to brands (Phase 4), the scale-up (P3.13).
- **Files:** `pipeline/src/sources/wikidata/{index,sparql,map}.ts` and tests, `pipeline/src/sources/registry.ts`.
- **Verification:** the source-task rules (`--sample 100` counts brand items). Also: the 50-edge precision check in PROGRESS, and a SQL check that every edge's endpoints exist and no cycle was written.

### [x] P3.12a Wikidata: tighten the match and clear stale sample rows (added in P3.12)
- **Slice:** source-wikidata.
- **Goal:** fix the precision problems the P3.12 check found before P3.13 auto-approves anything. Of 50 brand → owner edges, 42 were right, 5 were wrong matches and 3 were outdated in Wikidata itself.
- **Deps:** P3.12.
- **Found in P3.12:**
  - Wrong items: Beatrice → a GB magazine, Avril → a FR cosmetics chain, Co-op → the UK Co-operative Group (all three from the *brand-class* tier, and all have a non-CA/US country), PC → The Canadian Press (*CA* tier, a 2-letter alias), and Flamingo → a publisher (single candidate, P31 publisher).
  - Outdated owners, i.e. Wikidata data with no end date: Becel → Unilever (sold 2018; Becel also → Flora Food Group), Breyers → Unilever, Canada Dry → Dr Pepper Snapple Group.
- **In:**
  - In the brand-class and US tiers, drop candidates whose country is set and isn't CA or US.
  - Don't match strings of ≤ 2 letters by alias, only by label.
  - Restrict the business classes so publishers and media don't count, e.g. require a food, beverage, retail or consumer-goods P452 industry, or exclude publisher/media P31 classes. Pick whichever the sample shows is more precise.
  - Bump `wikidata@1.1.0` and re-run `--sample 100` twice.
  - **Stale rows:** P3.12 left 100 brands, 147 companies and 203 edges `pending`. Rows a fresh run no longer produces (an item that's no longer matched, or an edge no longer stated) must not be approved by P3.13. Either delete Wikidata rows not seen in the latest completed run, or make the D-054 approval cover only rows written or confirmed by that run. Record the choice in DECISIONS.
  - Outdated Wikidata owners are left to the D-054 rule (preferred rank, then latest start) and reported. Don't hand-edit them.
- **Out:** fuzzy matching (Phase 4).
- **Files:** `pipeline/src/sources/wikidata/*` and tests, `docs/DECISIONS.md`.
- **Verification:** the source-task rules for a sample. The 5 wrong matches above no longer match, a fresh 50-edge precision check is reported, and the stale-row rule is shown on SQL counts.

### [x] P3.12b Wikidata: brand-class tier precision (added in P3.12a)
- **Slice:** source-wikidata.
- **Goal:** the brand-class tier is the weakest one left. In the P3.12a sample, 5 of its 21 picks are wrong: Astro → a gas station chain, Chapman's → a department store chain, Prana → a clothing company, Primo → a NZ milk maker, Quest → a cigarette brand. None has an owner edge, so the 50-edge check doesn't see them. P3.13 would auto-approve them.
- **Deps:** P3.12a.
- **In:**
  - In the brand-class tier, count a candidate only if it's in a grocery brand class (food, drink, confectionery… brand, `P31/P279*`) or has a `TRADE_INDUSTRIES` P452. Use the P3.12a class cache. Offline on the P3.12a sample this drops 4 of the 5 wrong picks (Prana stays: P452 retail) and loses Castello and French's (P31 plain "brand").
  - Measure it on the top 400 OFF strings before choosing: wrong picks removed vs. right picks lost, as in D-066. Pick the more precise rule and record it in D-066.
  - Bump `wikidata@1.2.0` and re-run `--sample 100` twice.
- **Out:** fuzzy matching (Phase 4).
- **Files:** `pipeline/src/sources/wikidata/*` and tests, `docs/DECISIONS.md`.
- **Verification:** the source-task rules for a sample, plus the brand-class picks listed with right/wrong in PROGRESS.

### [x] P3.12c Wikidata: non-grocery retailers in the brand-class and US tiers (added in P3.12b)
- **Slice:** source-wikidata.
- **Goal:** after P3.12b, 2 of the sample's 18 brand-class picks are still wrong, and both get in through P452 *retail*: Prana → an American clothing company, and Best Buy → the electronics retailer (the OFF products are Sobeys' "Best Buy / Value Plus" private label). Both would also win the US tier. P3.13 would auto-approve them.
- **Deps:** P3.12b. ✅ **Decided (owner, 2026-11-03): P3.13 waits for it.**
- **In:**
  - Measure on the top 400 OFF strings (the P3.12b method) before choosing. Options: (a) bare `retail` / `retail chain` / `big-box store` / `e-commerce` count as grocery evidence only together with a food-side industry or a grocery store class (supermarket, grocery or convenience store chain); (b) exclude P452 industries that are clearly not grocery (clothing, consumer electronics, …) the way D-066 excludes classes. Report right picks lost (e.g. The Fresh Market, 7-Eleven, Starbucks).
  - Bump `wikidata@1.3.0` and re-run `--sample 100` twice.
- **Out:** fuzzy matching (Phase 4).
- **Files:** `pipeline/src/sources/wikidata/*` and tests, `docs/DECISIONS.md`.
- **Verification:** the source-task rules for a sample, plus the brand-class and US picks listed with right/wrong in PROGRESS.

### [x] P3.13 Wikidata (b): ownership scale-up
- **Slice:** source-wikidata.
- **Goal:** Wikidata ownership for every OFF brand string that has a match (budget: ~20k brands, ~5k companies).
- **Deps:** P3.12, P3.12a, P3.12b, P3.12c and D-054.
- ✅ **Decided (D-054): no manual review for Wikidata.** Every Wikidata brand, company, brand → owner edge and company → parent edge is auto-approved, with no queue row. Where several current owners are listed, one is picked by rule (preferred rank, then the latest start date). Remaining ties stay `pending` with no queue row, and the count goes in PROGRESS. Ended edges are approved as history. Admin decisions are never overridden.
- **In:** `--mode full`, plus the D-054 rule as code. It's applied through the per-batch `AUTO_APPROVE` path, so it covers only rows this run writes or confirms (D-066). P3.12 sample rows the full run still produces get approved, and stale ones (66 after P3.12c) stay `pending`. Tests cover each case: a stale `pending` row from an earlier run left alone, one current owner, two owners settled by rank, two settled by start date, a tie left `pending`, an ended edge approved as history, a company → parent edge, and an admin-rejected row left alone. No `review_queue` rows are written.
- **Out:** as P3.12.
- **Files:** `pipeline/src/sources/wikidata/*`, `docs/DECISIONS.md`, `docs/catalog/BUDGET.md`.
- **Verification:** the source-task rules, including the budget check (`brands`, `companies`, both ownership tables, `review_queue`). Also: the number of OFF brand strings matched, out of the total.

### [x] P3.13a Budget: ownership row widths (added in P3.13)
- **Slice:** source-wikidata.
- **Goal:** bring `brands`, `brand_ownership` and `company_ownership` back within 20% of BUDGET §3 per row, or re-baseline §3 with a reason (the budget rule in "Rules for every source task").
- **Deps:** P3.13.
- **Found in P3.13:** average `pg_column_size` per row: `brands` 321 B (§3: 228, +41%; 1,828 rows), `brand_ownership` 248 B (178, +39%; 1,570 rows), `company_ownership` 262 B (178, +47%; 659 rows). `companies` is under (361 vs 478). Row counts are far under §3 (brands 20,000, companies 5,000), so the totals are small (4.8 MB for all four tables against 22.7 MB), but Phase 4 may add brands for many more OFF brand strings.
- **In:** measure what each row carries (the +prov block, `source_url` per statement, `method_version`, aliases), then pick the cheaper of (a) a `url_template` route for `source_url` (the QID is already on the row for entities; edges would need the statement key) or (b) re-baselining §3 at the measured widths, with the brand count Phase 4 is expected to reach. Record the choice in DECISIONS.
- **Out:** changing what Wikidata matches or writes.
- **Files:** `docs/catalog/BUDGET.md`, possibly `supabase/migrations/*`, `pipeline/src/sources/wikidata/map.ts`.
- **Verification:** the new widths or the re-baselined §3 lines in a BUDGET "Actuals" line; if the schema changes, a `--mode full` Wikidata run writes 0 inserted, and `npm run typecheck`, `lint` and `test` pass.

### [x] P3.13b Budget: re-project §3 index bytes for the other +prov tables (added in P3.13a)
- **Slice:** release-check.
- **Goal:** an index column in BUDGET §3 that matches the indexes the schema actually has, so the whole-DB estimate (392 MB after P3.13a, ~8 MB under the 400 MB alarm) isn't low.
- **Deps:** P3.13a.
- **Found in P3.13a:** the §3 index figures predate the provenance FK indexes every +prov / +review table now has (`source`, `ingestion_run`, `raw_object`, `reviewed_by`, often `ai_call` and `merged_into`). For `brands` and both ownership tables the re-projection from `products`' per-entry sizes at 90k rows raised the index bytes per row by 34–145%. `companies` (11 indexes, §3 150 B) projects to ≈ 300 B the same way.
- **In:** for every §3 table, list its indexes from `pg_index` (tables that don't exist yet: from DATA_MODEL plus the +prov / +review index set), project bytes per row from the measured per-entry sizes (BUDGET P3.13a Actuals), and update §3, §1 and §8. If the whole-DB estimate passes 400 MB, say which §7 lever covers it and tell the owner.
- **Out:** dropping or changing indexes (a separate task if the numbers call for it).
- **Files:** `docs/catalog/BUDGET.md`.
- **Verification:** each changed §3 line names its index list and per-entry basis, the §1 totals add up, and a BUDGET "Actuals" line records the before and after subtotals.

### [x] P3.13c 🟡 Budget: pick the levers that bring the estimate back under the alarm (added in P3.13b)
- **Slice:** release-check.
- **Goal:** a 12-month estimate under the 350 MB catalog budget and the 400 MB whole-DB alarm, with the owner's choice of levers recorded.
- **Deps:** P3.13b.
- **Found in P3.13b:** with the indexes the schema actually has, the catalog estimate is ≈ 370 MB with bloat (budget 350) and the whole DB ≈ 450 MB (alarm 400, critical 450, limit 500). Actual today: 110 MB, so nothing is urgent before Phase 6's monitor.
- **🟡 Owner decision:** which §7 levers to adopt (BUDGET P3.13b Actuals has the savings): 2 monthly rollups 12 → 6 months (≈ 11 MB), 3 latest 2 score versions (≈ 13 MB), 4 `document_entities` ≤ 30 per company (≈ 12 MB), 1 tighter OFF filter (15–25 MB, costs product coverage). Levers 2–4 reach ≈ 410 MB; with lever 1, ≈ 385–395 MB. Other options: fewer target rows somewhere, dropping low-value indexes (measure first), or a paid tier later (Phase 10).
- **In:** record the decision in DECISIONS, apply it to BUDGET §3, §1, §4 or §7, and add PLAN tasks in the phases that build the affected tables (rollups Phase 8, scores Phase 7, documents Phase 7/9) so they're built that way.
- **Out:** building any of it now.
- **Files:** `docs/catalog/BUDGET.md`, `docs/DECISIONS.md`, `docs/PLAN.md`.
- **Verification:** §1 shows the catalog under 350 MB and the whole DB under 400 MB, and each adopted lever names the task that builds it.
- ✅ **Decided (D-070, owner delegated the choice 2026-11-04):** levers 2–4 plus natural keys on the rollups and pruning unlinked documents are adopted. Lever 1 is held in reserve, applied when the measured DB reaches 330 MB. **Verification amended:** the catalog is under 350 MB (≈ 321), but the whole DB is ≈ 412 MB, because measuring platform overhead raised it from 30 to 42 MB. With the reserve lever it's ≈ 384–395 MB. The owner can veto and adopt lever 1 now.

### [x] P3.14 Wikipedia (a): company summary sample
- **Slice:** source-wikipedia.
- **Goal:** a short summary for each company page, with attribution.
- **Deps:** P3.4, P3.12.
- **In:**
  - Source `wikipedia`: for companies with a `wikipedia_title` (from Wikidata), the REST summary endpoint, serially with `maxlag` (SOURCES.md S19).
  - A `document` (kind `wikipedia`, URL, title, revision id, `summary`), linked from the company by `wikipedia_document_id`, with `wikipedia_revision_id` set through the enrichment path (P3.4).
  - Raw is stored only when the revision changed (D-044; 3 kept per page).
  - Raw layout keeps Storage within the §3 bound of 6,000 `raw_objects` for all sources (P3.13c: each Storage object costs ≈ 1.9 KB of DB). One file per page would allow up to 15k for 5k pages. Pick a layout (e.g. one envelope per step) that stays inside the bound and record it in DECISIONS.
- **Out:** the scale-up (P3.15), the company screen (Phase 8).
- **Files:** `pipeline/src/sources/wikipedia/*` and tests, `pipeline/src/sources/registry.ts`.
- **Verification:** the source-task rules. Also: a second run stores no raw file for unchanged pages.
- ✅ Done 2026-11-04 (D-071): Action API in batches instead of the REST endpoint; retention is now the last 3 runs that stored a file.

### [x] P3.15 Wikipedia (b): all companies with a page
- **Slice:** source-wikipedia.
- **Goal:** summaries for every company with a Wikipedia title.
- **Deps:** P3.13, P3.14.
- **In:** `--mode full` (D-071 batches: 1,136 companies on 2026-11-04 → ~23 check and ~57 extracts requests, a few minutes; 5k pages ≈ 350 requests). The second full run fetches only the checks and stores nothing (`changesOnly`). The budget check compares the measured Wikipedia `documents` row (≈ 718 B in P3.14, vs the §3 average of 328 B for all documents).
- **Out:** as P3.14.
- **Files:** `pipeline/src/sources/wikipedia/*`, `docs/catalog/BUDGET.md`.
- **Verification:** the source-task rules, including the budget check (`documents`, `company_sources`, the `raw` bucket).
- ✅ Done 2026-11-04: runs `b1ef67a2` and `ec27b26a`. The budget check found two gaps (P3.15a) and a summary-text artifact (P3.15b).

### [x] P3.15a Budget: Wikipedia `documents` width and `company_sources` (added in P3.15)
- **Slice:** release-check.
- **Goal:** BUDGET §3 reflects the measured Wikipedia document rows and has a row for `company_sources`.
- **Deps:** P3.15.
- **Found in P3.15:** Wikipedia `documents` rows have **802 B** of heap each (the summary), against the 328 B §3 average for all documents (+145%), so ≈ +2.2 MB at 5k pages. `company_sources` (P3.2) has **no §3 row**: 606 B a row, ≈ 5k rows ≈ 3.5 MB. Together ≈ +5.7 MB before bloat, so the whole DB goes from ≈ 412 to ≈ 418 MB (under the 450 MB critical line).
- **In:** split the `documents` line into Wikipedia (5k at the measured width) and other documents (25k at the current width), or re-baseline it; add `company_sources` with its rows, measured width and index bytes from the real indexes (P3.13b method); re-add §1. If the whole DB moves past ≈ 420 MB, say so in PROGRESS for the owner (the D-070 reserve lever still covers it).
- **Out:** changing the summary length or the schema (a cap below 1,000 characters is an owner choice if it's needed).
- **Files:** `docs/catalog/BUDGET.md`.
- **Verification:** §1 re-added from §3; each new figure cites its measurement; `format:check` passes.
- ✅ Done 2026-11-04: +3.9 MB, catalog ≈ 325 MB with bloat, whole DB ≈ 416 MB (BUDGET P3.15a Actuals).

### [x] P3.15b Wikipedia: clean pronunciation leftovers from summaries (added in P3.15)
- **Slice:** source-wikipedia.
- **Goal:** no empty or separator-only brackets in summaries.
- **Deps:** P3.15.
- **Found in P3.15:** TextExtracts strips pronunciation markup and leaves brackets behind: 16 of 1,123 summaries have "()" (e.g. "Kraft Foods Inc. () was …"), and 13 start a bracket with a separator ("Findus (; Swedish: [ˈfɪndɵs])", "Guylian (, French: …)").
- **In:** in `summaryOf`, drop empty brackets and a leading `;`/`,` inside a bracket, then collapse spaces before punctuation. Bump `wikipedia@1.1.0`. Re-parse the stored rows without refetching, e.g. a check that also queues pages whose document's `method_version` is older than the source's (record the choice in DECISIONS). Re-run full.
- **Out:** other text changes.
- **Files:** `pipeline/src/sources/wikipedia/*` and tests.
- **Verification:** unit tests with the real examples; after a full run, the SQL counts of `\(\s*\)` and `\(\s*[;,]` in Wikipedia summaries are 0; a second full run inserts and stores nothing.
- ✅ Done 2026-11-04 (D-073): runs `e585a6ca` (65 pages re-extracted) and `202d2c35` (nothing written or stored).

### [x] P3.16 SEC EDGAR (a): Exhibit 21 sample
- **Slice:** source-edgar.
- **Goal:** parent → subsidiary evidence from US-listed parents' 10-K Exhibit 21 lists.
- **Deps:** P3.1, P3.4, P3.12.
- **In:**
  - Source `sec-edgar`, email UA (P3.1): for companies with a `sec_cik`, the submissions JSON, then the latest 10-K's Exhibit 21 document. 20-F filers (no Exhibit 21) are skipped and counted.
  - The filing becomes a `document` (kind `sec_filing`, accession, filed date), and the CIK's provenance goes in `company_sources`.
  - Exhibit 21 is free text (HTML tables or lines). Parse subsidiary name and jurisdiction. **Only subsidiaries whose normalized name matches an existing company or brand** become `pending` `company_ownership` edges citing the filing. The rest are counted, not created as companies (BUDGET: ~5k companies), and stay in the raw file.
- **Out:** fuzzy matching of subsidiary names (Phase 4).
- **Files:** `pipeline/src/sources/sec-edgar/*` and tests (two real Exhibit 21 formats as fixtures), `pipeline/src/sources/registry.ts`.
- **Verification:** the source-task rules (`--sample` counts filings, e.g. 10). Also: matched vs unmatched subsidiary counts per filing, and 10 edges checked by hand against the filing.
- ✅ Done 2026-11-04 (D-074): runs `54a03b1b` and `6deb8462`. The by-slug sample of 10 gave no new edges, so the hand check used a full dry run (`08dfcd98`): 9 edges, 6 right. A first-run overwrite of a Wikidata edge was repaired, and it led to a Phase 4 milestone (edges from several sources).

### [x] P3.17 SEC EDGAR (b): all companies with a CIK
- **Slice:** source-edgar.
- **Goal:** Exhibit 21 evidence for every company with a SEC CIK (about 50–100 parents).
- **Deps:** P3.13, P3.16.
- **In:** `--mode full`.
- **Out:** as P3.16.
- **Files:** `pipeline/src/sources/sec-edgar/*`, `docs/catalog/BUDGET.md`.
- **Verification:** the source-task rules, including the budget check.
- ✅ Done 2026-11-04: runs `6290bdab` and `b811852e`. 9 pending edges (as the P3.16 dry run predicted), budget well inside (BUDGET P3.17 Actuals).

### [x] P3.18 Corporations Canada: identity check (low priority)
- **Slice:** source-corp-canada.
- **Goal:** confirm Canadian companies' legal names and federal corporation numbers.
- **Deps:** P3.3, P3.4, P3.13.
- **In:**
  - Source `corp-canada`: the bulk CSVs (Open Government Licence – Canada; `Crawl-delay: 20`), streamed with `openLines`. Confirm the field list on the first file (SOURCES.md S21 has it as unknown).
  - Only companies with `country = 'CA'` whose normalized legal or display name matches exactly get `corp_canada_number` and `legal_name` through the enrichment path. Nothing else is stored.
  - Small enough that the sample and the full run are one task.
- **Out:** Ontario-incorporated companies (not in this dataset).
- **Files:** `pipeline/src/sources/corp-canada/*` and tests, `pipeline/src/sources/registry.ts`, `docs/catalog/SOURCES.md` (the field list).
- **Verification:** the source-task rules for a sample and a full run, including the budget check. Also: the match count, and 5 matches checked by hand on the Corporations Canada search page.
- ✅ Done 2026-11-04 (D-075): runs `ed156a4e`, `2859f150` (sample) and `adfcb843`, `61a10bcd` (full). 20 of 160 Canadian companies confirmed, 1 ambiguous, 0 malformed rows. Active files only, stricter legal-form list, no aliases.

### [x] P3.19 Phase 3 exit check
- **Slice:** release-check.
- **Goal:** prove the exit criteria together.
- **Deps:** P3.1–P3.18.
- **In:**
  - A table of every Phase 3 source with its last sample and full run: run ids, counts, validation failures by rule.
  - The budget: `pg_database_size`, per-table sizes against BUDGET §3, and storage bytes per bucket against §5. Both stay under their alarms.
  - `get_advisors` is clean; clean clone, `npm ci`, typecheck/lint/test; the fixture e2e; the latest CI run is green.
- **Out:** new features. Gaps become PLAN tasks.
- **Files:** `docs/PROGRESS.md`, `docs/catalog/BUDGET.md`.
- **Verification:** a checklist in PROGRESS with evidence for each exit bullet.
- ✅ Done 2026-11-04 on `cbad52b`: DB 112.5 MB, catalog 91.2 MB, storage 29.1 MB. Row widths over §3 became P3.19a.

### [x] P3.19a Budget: run-bookkeeping row widths (added in P3.19)
- **Slice:** release-check.
- **Goal:** BUDGET §3 reflects the measured widths of the tables P3.19 found over, with row counts that match what runs write.
- **Deps:** P3.19.
- **Found in P3.19:** `ingestion_run_events` 869 B a row vs 178 B, `validation_failures` 614 B vs 308 B, `review_queue` 234 B vs 148 B, `raw_objects` 306 B vs 248 B. At the §3 row counts that's ≈ +17 MB, so the catalog ≈ 344 MB and the whole DB ≈ 435 MB. But those two row counts are the 50-per-run cap over 240 runs, and the 75 runs so far average 12 events and 6 failures, which keeps both at or under their §3 MB.
- **In:** find what makes the rows wide (`pg_column_size` per column). Re-baseline the four rows with measured widths and index bytes (P3.13b method), and set the event and failure row counts from measured rates, with the assumption stated. Re-add §1. If the whole DB moves past ≈ 420 MB, say so in PROGRESS for the owner.
- **Out:** changing the schema, the per-run caps or the payloads. If a smaller payload is needed, add a task.
- **Files:** `docs/catalog/BUDGET.md`.
- **Verification:** §1 re-added from §3; each new figure cites its measurement; `format:check` passes.
- ✅ Done 2026-11-04: +3.6 MB, catalog ≈ 329 MB with bloat, whole DB ≈ 420 MB (BUDGET P3.19a Actuals).

### Phase 3 milestone coverage

| Milestone | Tasks |
|---|---|
| M1 Shared groundwork | P3.1 (contact email), P3.2 (schema additions), P3.3 (dump downloads), P3.4 (writers, enrichment) |
| M2 Open Food Facts | P3.5 (sample, row width, auto-approve), P3.6 (full), P3.7 (deltas), P3.8 (ODbL extract) |
| M3 Open Prices | P3.9 (sample), P3.10 (full) |
| M4 StatCan | P3.11 (sample and full) |
| M5 Wikidata | P3.12 (sample, precision check), P3.12a (match precision, stale rows), P3.12b (brand-class tier), P3.12c (non-grocery retailers), P3.13 (scale-up) |
| M6 Wikipedia | P3.14 (sample), P3.15 (full), P3.15b (summary cleanup) |
| M7 SEC EDGAR | P3.16 (sample), P3.17 (full) |
| M8 Corporations Canada | P3.18 (sample and full) |
| M9 Budget | each scale-up (P3.6, P3.10, P3.11, P3.13, P3.15, P3.17, P3.18), P3.13a, P3.13b, P3.13c, P3.15a, P3.19, P3.19a |
| Exit criteria | P3.19 |

**Open 🟡 decisions in Phase 3:** none. P3.13c (budget levers) was decided in D-070. P3.13's Wikidata visibility rule is decided: no manual review (D-054). The other choices follow from SOURCES.md, DATA_MODEL and existing decisions; the new ones are in D-053.

## Phase 4 — Normalization and matching (full detail)

**Exit:**
- A labelled gold set (~200 product pairs, ~100 brand→company pairs) measures precision and recall on data the thresholds weren't tuned on.
- Auto-accept precision is ≥ 95%.
- Anything below the threshold stays hidden from users. Brands on 20+ products go to the review queue, and the long tail doesn't (D-077).
- Added by the review (D-080): the brand strings on 20+ products that were already matched are audited, ownership chains end at an organisation, banners and generic items exist, and the exit report says how much of a real basket the catalog covers.

- [x] **P4.0 Refine Phase 4** → done 2026-11-05 (this section; D-077). Amended 2026-11-10 after the review (`docs/REVIEW.md`, D-080): P4.24 to P4.29 added; P4.3, P4.8, P4.10, P4.13, P4.15, P4.17, P4.18, P4.20 and P4.23 changed; P2.24 and P6.1 to P6.3 run here, after P4.3.

**Measured for this plan** (dev project and the 2026-10-30 OFF dump; D-077 has what each number decided):
- 90,672 products, 11 with a `brand_id`, 0 with a category. 0 `store_listings`, 0 `match_candidates`.
- 19,375 OFF brand strings, 18,816 after normalizing. 1,851 already match a brand name or alias, covering 28,084 of 81,779 brand mentions. The 525 strings on 20+ products cover 41,814 mentions. 12,720 strings appear on one product.
- The top strings are grocers' own brands, and many are missing from `brands` (Compliments, Irresistibles) or split across spellings (PC, President's Choice, Presidents Choice, Le Choix du Président).
- 37,783 of 90,662 OFF rows have categories (6,970 distinct tags). 52,879 (58%) have none.
- 1,110 of the 2,516 bad-check-digit codes are 8 digits long, and 633 of those are valid **UPC-E** (number system 0; P4.1 corrected the 707 first measured, D-078).

**Milestones** (each one maps to tasks in the coverage table at the end of this phase):
- **M1 Product identity:** UPC-E and EAN-8 rules, the writer fix that protects resolved columns, the OFF re-import of affected codes, the legacy takeover.
- **M2 Sizes:** the size/unit parser and unit price, applied to OFF.
- **M3 Derived jobs:** a runner for work that reads our own tables instead of fetching.
- **M4 Taxonomy:** the Sarvis taxonomy, OFF tag mappings, then categories from names for products with no tags.
- **M5 Brands:** brand keys, the private-label seed, brand rows from OFF strings, product → brand links.
- **M6 Brand → company:** evidence from several sources per edge, resolver candidates, the brand gold set, calibration.
- **M7 Product matcher:** candidate RPC plus scoring, the product gold set, calibration of the legacy tiers.
- **M8 Price sanity:** `price_sanity_bounds` from StatCan and observed prices, wired into validation.
- **M9 Coverage and data fixes (review, D-080):** the coverage probe, the audit of approved Wikidata matches, the lone-foreign-candidate rule, corporate top parents, generic items, the banner seed.
- **M10 Operations pulled forward (review, D-080):** pipeline hardening, the scheduled OFF refresh and keep-alive, dev-database checks in CI, raw retention.

**Not in Phase 4:**
- Admin UI for the review queue and match decisions: Phase 5. Phase 4 writes the queue rows and `match_candidates`.
- Scheduling the derived jobs after OFF deltas: Phase 6. Phase 4 runs them from the CLI.
- Receipt parsing and the user confirmation step: Phase 8. The matcher ships as a function and an RPC, because no listings exist to match yet.
- Merging OFF near-duplicates into one product. The matcher can find them, but nothing merges them. Add a task if the gold set shows search needs it.
- AI classification or matching: the OpenRouter module arrives in Phase 7, and categories from names use free rules. If the rules leave too many products without a category, P4.17 raises it with the owner as a cost decision.
- Filling Corporations Canada numbers through aliases (D-077). The P5 DB editor is where an admin can set one.
- A new source for missing sizes (D-077).

**Feature slices** (each task touches exactly one): `core-gtin`, `core-units`, `pipeline-db`, `pipeline-jobs`, `source-off`, `schema`, `taxonomy`, `brand-resolver`, `gold-set`, `product-matcher`, `price-sanity`, `release-check`. Added by the review: `source-wikidata`, `pipeline-runs`, `ops`, `ci`.

**Rules for every task in this phase:**
- **Provenance:** a derived fact keeps the `source_id` it came from, with `method = derived` and the rule in `method_version` (`brand-resolver@1.0.0`). Match decisions record `match_method`, `match_method_version` and `reason` in `match_candidates`.
- **Idempotent:** a second run of any job inserts 0 rows and updates 0 rows.
- **Decisions don't get overwritten:** a job never changes a row an admin reviewed, a locked field, or a merged or rejected row (D-046, D-052).
- **Legacy stays hidden:** no job approves a legacy row, apart from the takeover in P4.4 (D-077).
- **Gold sets are real data.** Pairs are sampled from the catalog, not invented. Each label has an evidence URL or a stated reason. Thresholds are tuned on one half and precision is reported on the other, with a confidence interval, because a sample this size is noisy.
- **Bulk updates:** use batches small enough not to time out. Report dead tuples and table size afterwards, and vacuum if needed.
- **Verification (all tasks):** `npm run typecheck`, `lint` and `test` pass. Data tasks run on a sample first, then report row counts, 5 example records and validation failures in PROGRESS. Bulk-write tasks add the budget check (the Phase 3 rule), and anything over its estimate by more than 20% becomes a PLAN task.

### [x] P4.1 GTIN: UPC-E expansion and restricted EAN-8
- **Slice:** core-gtin.
- **Goal:** barcodes printed as UPC-E normalize to the same GTIN-14 as their UPC-A, in TS and SQL.
- **Deps:** P3.19a.
- **In:**
  - Expand 8-digit UPC-E (number system 0 or 1, valid check digit) to UPC-A, then GTIN-14, in `normalizeGtin`, with the SQL twin in a migration. `gtin_is_valid` stays a plain mod-10 check.
  - **Ambiguity rule:** a code valid both ways is read as UPC-E. Check this on a sample first: the expanded manufacturer prefix should match other products of the same brand. **The check narrowed the rule to number system 0** (382 codes; number system 1 agreed on 0 of 155, so those 181 stay EAN-8, D-078).
  - EAN-8 restricted prefixes (left to Phase 4 by D-035).
  - Keep the TS and SQL twins on one shared vector list, plus real examples: `04139344` Kikkoman → `041390000034`, `05514100` Häagen-Dazs → `055000001410`.
  - Update DATA_MODEL §1.4.
- **Out:** re-importing OFF (P4.3). Leading-zero recovery, unless the data needs it.
- **Files:** `packages/core/src/gtin.ts`, `gtin.test.ts`, a new migration, `supabase/tests/`, `docs/catalog/DATA_MODEL.md`.
- **Verification:**
  - Twin tests pass on the same vectors in TS and SQL.
  - The prefix check on 50 ambiguous codes is in PROGRESS, with how many agree.
  - The generated types still match.
- ✅ Done 2026-11-05: `npm run check:gtin` passes, 23 of 50 sampled codes agree (control 1%), and types are regenerated (D-078).

### [x] P4.2 Product writer keeps resolved columns
- **Slice:** pipeline-db.
- **Goal:** an OFF re-import can't erase a product's `brand_id` or `category_id`.
- **Deps:** P3.19a.
- **In:**
  - Today the writer sends `brand_id: … ?? null` and `category_id: … ?? null`. Once a job has set them, the next OFF change to that product would clear them. A record with no `brand_slug` or `category_slug` must leave the stored value alone (the D-046 "missing is no opinion" rule). An explicit slug still writes.
  - The content hash excludes columns the source doesn't own, so a resolved row still reads as `unchanged`.
- **Out:** the jobs that set these columns.
- **Files:** `pipeline/src/db/writers/products.ts`, `products.test.ts`, `pipeline/src/db/writers.devdb.ts`.
- **Verification:**
  - A unit test and a dev-DB check: write a product, set `brand_id` and `category_id`, re-write it with a changed name, and both survive.
  - `npm run check:writers --workspace @sarvis/pipeline` passes.
- ✅ Done 2026-11-05: `check:writers` passes 7 of 7, and the new check fails on the old code (D-079).

### [x] P4.3 OFF: re-import UPC-E and bad-check-digit codes
- **Slice:** source-off.
- **Goal:** recover the rows validation dropped and correct GTINs stored from UPC-E codes.
- **Deps:** P4.1, P4.2.
- **In:**
  - The OFF mapping uses the new normalizer (D-078). About 633 UPC-E rows now pass. Of the stored 8-digit GTINs, 382 change to their UPC-A form, 226 (EAN-8 prefix 0 or 2) become restricted and lose their `gtin`, and the rest stay. `external_id` is unchanged, so each row keeps its id.
  - **Those 608 rows fail the `products` check on any update until this task rewrites them** (P4.1 tightened `gtin_is_restricted`), so don't run an OFF import before P4.3.
  - **The remaining ~1,883 bad-check-digit rows** get the same treatment as restricted in-store codes: kept on `external_id` with `gtin` null, unless they duplicate a kept product on normalized name + first brand (462 of the 2,516 did), in which case they're dropped and counted in a run event. Users can find them by search but not by scanning (D-077).
  - **A code that expands to a GTIN already in the catalog** (35 found: 28 new rows, 7 stored rows) stays on the existing product through `product_sources`. Check the writer does this when both rows come from one source, since D-046 only covers another source's product.
  - Bump the `off` `method_version`. Report any Open Prices codes that now resolve, and add a task if a re-run is worthwhile.
  - **The full run here is also the catch-up run** (review H-8): the last delta ran on 2026-10-30, and the 14-day delta window closes on 2026-11-13, so a delta alone can no longer be trusted.
- **Out:** size parsing (P4.6).
- **Files:** `pipeline/src/sources/off/map.ts`, its tests, `docs/catalog/BUDGET.md`.
- **Verification:**
  - `--dry-run --sample` first, then a full run and a second run that inserts 0 rows.
  - Before-and-after counts of products, GTINs and null GTINs, with 5 examples of each group.
  - Scan check: a UPC-E code and its UPC-A find the same row.
  - `select count(*) from products where gtin_is_restricted(gtin)` returns 0 (608 today).
  - The 35 collisions are looked at by hand: a different product under one GTIN means the code was an in-store code, not UPC-E.
  - Budget check.
- ✅ Done 2026-11-10: full run `83205eb0` (2,758 inserted, 1,345 updated, 0 invalid), run `5ca89bdc` 0 inserted / 0 updated, restricted GTINs 608 → 0, 35 collisions checked, products 74.1 MB (D-081).

### [x] P4.24 Coverage probe: is what the owner buys in the catalog? (added by the review)
✅ Done 2026-11-10 on 18 lines from 2 legacy receipts and no barcodes (D-082): 5 found, 3 missing, 5 with no barcode, 3 unidentified, 2 non-food (out of scope). 5 of 8 barcoded food lines found (63%). The first count, 5 of 10 with non-food, was under 60%, so P4B.6 was added. Results: `docs/catalog/gold/coverage_probe.md`.
- **Slice:** gold-set.
- **Goal:** measure, on real purchases, how much of a basket the catalog covers, before more is built on that assumption (review C-2).
- **Deps:** P4.3.
- **Owner input (changed 2026-11-10, D-082):** the plan asked for about 50 barcodes and about 100 receipt lines. The owner has neither, and asked that the task not hold up the plan. It ran on the owner's 2 receipts in the legacy app (18 lines). The barcode steps didn't run, and the 60% rule below was applied to the barcoded receipt lines.
- **In:**
  - Each barcode goes through `normalizeGtin` and a lookup. Record: found or not, has a brand string, brand has an owner.
  - Each receipt line gets a hand label: barcoded product in the catalog, barcoded product missing, or an item with no barcode (produce, meat, bakery, deli).
  - The receipt lines are saved for P4.20 under its privacy rules (line text and banner only, each line checked by hand).
- **Out:** the matcher (P4.18). Lines are labelled by hand here.
- **Files:** `docs/catalog/gold/coverage_probe.md`, `docs/catalog/gold/receipt_lines.csv`, `docs/catalog/gold/README.md`.
- **Verification:**
  - PROGRESS reports the barcode hit rate, the share of receipt lines in each of the three groups, and 10 examples of misses.
  - The P4.20 scan for long digit runs and the owner's name and email finds nothing.
  - If fewer than 60% of barcodes are found, add a task for an on-scan lookup through the OFF API (S2, already approved as a lookup fallback).

### [x] P2.24 Pipeline hardening before anything is scheduled (added by the review; runs here)
- **Slice:** pipeline-runs.
- **Goal:** scheduled and manual runs can't collide, and a network blip doesn't kill a long run (review M-4, M-7).
- **Deps:** P4.3.
- **In:**
  - A partial unique index on `ingestion_runs (source_id, job) where status = 'running'`. A second start is refused with a clear message. The stale sweep covers only the source being started.
  - `withRetry` around PostgREST reads and writes, for network errors and 5xx.
  - The HTTP cache stores POST 200 responses (the key already includes the body), so Wikidata and StatCan re-runs behave as `CLAUDE.md` says.
  - If this runs long, split the cache change into its own task.
- **Out:** resuming a failed run from the middle.
- **Files:** a new migration, `pipeline/src/runs/`, `pipeline/src/db/query.ts`, `pipeline/src/http/client.ts`, tests, `packages/core/src/db/database.types.ts`, `CLAUDE.md`.
- **Verification:**
  - Unit tests: a second run of one source is refused; a 503 from the database is retried and succeeds; a repeated POST is served from the cache.
  - `check:writers` and the pipeline e2e pass. Advisors are clean.
- ✅ Done 2026-11-10: unit tests for all three, a live lock check on dev, `check:writers` 8 of 8, pipeline e2e passes, advisors unchanged (D-083).

### [ ] P6.1 🟡 Scheduled keep-alive and OFF refresh (pulled forward by the review; runs here)
- **Slice:** ops.
- **Goal:** the dev project never pauses, and OFF stays fresh without anyone remembering (review H-8).
- **Deps:** P4.3, P2.24.
- **🟡 Owner action:** add three GitHub Actions secrets: the dev project URL, the dev service-role key, and the pipeline contact email. If they aren't there yet, build and test the workflow locally, leave the task unticked, and take the next one.
- **In:**
  - A workflow on a daily cron and `workflow_dispatch`: `pipeline run off --mode delta`. If the last completed delta is more than 13 days old, it runs `--mode full` instead.
  - It never runs on `pull_request`, so forks can't reach the secrets. One concurrency group, shared with P6.2.
  - `actions/cache` for `.cache/`. On failure, the workflow opens a GitHub issue.
- **Out:** other sources, the budget monitor (P6.0).
- **Files:** `.github/workflows/pipeline-off.yml`, `pipeline/src/sources/off/`, `CLAUDE.md`.
- **Verification:**
  - A manual dispatch completes, and its run row shows the Actions URL.
  - A forced failure opens an issue. The public log shows no key, email or row data.
- ⏳ 2026-11-10: built and tested locally (D-084): `--mode auto`, the workflow, unit and workflow tests, and a live `--mode auto` run on dev. Still open: the three secrets, a push of the workflow to `main`, then a manual dispatch (`gh workflow run pipeline-off.yml`) and a forced-failure dispatch (`-f force_failure=true`).

### [ ] P6.2 CI runs the dev-database checks (pulled forward by the review; runs here)
- **Slice:** ci.
- **Goal:** a broken writer or auth flow fails a build instead of waiting for a manual check (review M-3, M-8).
- **Deps:** P6.1.
- **In:** a job on pushes to `main` only: `check:gtin`, `check:writers`, the pipeline e2e, and the Playwright e2e (Chromium installed in the job). Same concurrency group as P6.1.
- **Out:** running these on pull requests.
- **Files:** `.github/workflows/ci.yml` or a new workflow, `CLAUDE.md`.
- **Verification:** a green run with all four. A deliberately broken writer on a throwaway branch, run through `workflow_dispatch`, turns it red. Record both run URLs.

### [ ] P6.3 Raw-retention cleanup (pulled forward by the review; runs here)
- **Slice:** ops.
- **Goal:** Storage stops growing without bound.
- **Deps:** P6.1.
- **In:** the cleanup job as the Phase 6 outline describes it (`retentionFor()`, `deleteRawFile()`, the per-subject rule for Wikipedia and EDGAR), run weekly from the P6.1 workflow. The latest OFF full extract must survive, because P4.9 re-parses it.
- **Out:** row-retention purges and budget monitoring (P6.0).
- **Files:** `pipeline/src/raw/`, `pipeline/src/cli.ts`, the workflow, tests, `CLAUDE.md`.
- **Verification:** a dry run lists what would go. After a real run, Wikidata keeps its last 3 runs, and the OFF extract is still readable with `readRaw`.

### [x] P4.4 Legacy products that hold an OFF GTIN: OFF takes over
- **Slice:** pipeline-db.
- **Goal:** the 3 legacy products with an OFF barcode show OFF's data (owner decision, D-077).
- **Deps:** P4.2.
- **In:**
  - When OFF brings a GTIN that a `legacy-import` product holds, the row takes OFF's imported fields and provenance and the D-050 auto-approve. The legacy record moves to `product_sources`, which keeps what the row was.
  - **Nothing legacy may show.** Check every field left on the row. `product_features` and `transparency_steps` filter on their own `review_status`, so they should stay hidden; confirm that, and the same for product `certifications`.
  - A row an admin reviewed isn't taken over.
  - Applies to Kashi Bars, Green Goodness and Scoobi Doo Pasta, and to later cases.
  - Add this exception to DATA_MODEL §1.5.
- **Out:** other legacy products.
- **Files:** `pipeline/src/db/writers/products.ts`, tests, `docs/catalog/DATA_MODEL.md`.
- **Verification:**
  - A dev-DB check as `anon` with the Supabase client: each of the 3 products reads with OFF's values, and its legacy features and certifications don't.
  - The other 10 legacy products are unchanged and hidden.
  - Re-running changes nothing.
- ✅ Done 2026-11-10: full OFF run `aef030a6` took over the 3 rows (3 updated), `check:takeover` passes as `anon`, the other 10 legacy rows are byte-identical, and the re-runs (`legacy-import` `68b38bd5`, OFF `34152f6e`) change nothing (D-085).

### [ ] P4.30 OFF deltas apply the bad-code duplicate rule (found in P4.4)
- **Slice:** source-off.
- **Goal:** a delta and a full run agree on which bad-check-digit rows are kept, so rows don't flip between active and discontinued.
- **Deps:** P4.3.
- **Found:** full run `aef030a6` (same dump as P4.3) discontinued 15 rows, all with `gtin` null and `source_modified_at` from 2026-11-01 to 2026-11-08, such as two "Oven Roasted Turkey Breast" codes (`0063100108734`, `0063100108730`). Deltas inserted them, and the full run drops them as duplicates of a kept product on normalized name + first brand (359 dropped). The delta path doesn't check new bad-code rows against the catalog, so the next delta that lists one revives it.
- **In:** in delta mode, a bad-code row (no GTIN) is dropped when an active product of the source already has the same normalized name + first brand, and the drop is counted in the `off_filter` event, as in a full run. Check what the D-081 rule does when the kept product itself arrives in the same delta.
- **Out:** merging near-duplicates (Phase 4 "Not in Phase 4").
- **Files:** `pipeline/src/sources/off/delta.ts`, `index.ts`, tests.
- **Verification:** a unit test with a delta that holds a bad-code duplicate of a stored product. A delta run on dev drops it, and the next full run on the same dump discontinues 0.

### [ ] P4.5 Size and unit parser
- **Slice:** core-units.
- **Goal:** turn real size strings into a base-unit quantity and pack count, and compute unit prices.
- **Deps:** P3.19a.
- **In:**
  - `parseSize()` in core returns `unit_parse_status`, `net_quantity`, `net_unit` (`g`, `ml`, `ct`) and `pack_count`, plugged into the `UnitParser` hook.
  - Cases, from CATALOG_REVIEW §4.1 and the P3.6 data: `N unit`, `N x M unit`, nested packs (`2 x 6 x 355 mL`), counts (`12 ea`, `6 pk`, `12 pcs`, `CTN24`), approximate weights (`approx. 1.2 kg`), per-weight text (`/kg`, `$/lb`), fractions, decimal commas, French units, `oz`, `lb`, `fl oz`, `cl`, and sizes containing commas. Bare numbers stay `unparsed` rather than guessing a unit. Mass and volume in one string is `ambiguous`.
  - `unitPrice()` returns the price per base unit, computed by us rather than trusted from a source.
  - Seed tests from legacy `normalizer.test.ts`, plus at least 150 real distinct strings from `quantity_text`, chosen across frequency and including the ~1.1k strings the D-057 rule can't read.
- **Out:** applying it to stored rows (P4.6).
- **Files:** `packages/core/src/units.ts`, `units.test.ts`, `packages/core/src/index.ts`.
- **Verification:**
  - Tests pass. Report the share of all distinct `quantity_text` values parsed, and 10 of what's left.
  - Every result satisfies the product schema's rules.

### [ ] P4.6 OFF: apply the size parser
- **Slice:** source-off.
- **Goal:** products get normalized sizes from the new parser.
- **Deps:** P4.3, P4.5.
- **In:**
  - OFF passes `parseSize` to validation, replacing the D-057 rule. OFF's `product_quantity` still wins when it agrees with the text. A disagreement goes in a run event with examples.
  - **Fallback:** when `quantity` is blank, parse a strict size pattern out of the name (about 216 products), marked in the method version.
  - Bump the `off` `method_version`. Changed hashes mean one large update run, so expect it to take a while.
- **Out:** a new size source (D-077).
- **Files:** `pipeline/src/sources/off/map.ts`, `index.ts`, tests, `docs/catalog/BUDGET.md`.
- **Verification:**
  - Before-and-after `unit_parse_status` counts, with 5 examples each of `ok`, `ambiguous` and `unparsed`.
  - A hand check of 30 changed rows against their source text, with errors reported.
  - A second run updates 0 rows. Budget check, including dead tuples.

### [ ] P4.7 Pipeline: derived-job runner
- **Slice:** pipeline-jobs.
- **Goal:** one way to run work that reads our own tables, with the same bookkeeping as a source.
- **Deps:** P3.19a.
- **In:**
  - `npm run pipeline -- job <name> [--sample N] [--dry-run]`, with the same exit codes as `run`. The `Source` interface doesn't fit, because `parse` only sees raw fetched data and these jobs fetch nothing.
  - An `ingestion_runs` row per job (`source_id` is required, so seed a `sarvis-derived` source row with `verdict = use` in a migration), counts, capped events, cancellation.
  - **Incremental by design:** a job reads rows that need work, in id-ordered batches, so an interrupted run resumes and a run after an OFF delta touches only new rows.
  - A `fixture` job for the tests.
  - Add the command to `CLAUDE.md`.
- **Out:** real jobs.
- **Files:** `pipeline/src/jobs/`, `pipeline/src/cli.ts`, tests, a new migration, `docs/catalog/SOURCES.md`, `CLAUDE.md`.
- **Verification:**
  - Unit tests: a dry run writes nothing, a sample stops at N, a cancelled job resumes, exit codes.
  - The fixture job run twice against dev updates nothing the second time.

### [ ] P4.8 Taxonomy and OFF tag mappings
- **Slice:** taxonomy.
- **Goal:** a Sarvis grocery taxonomy that alternatives and price bounds can use, mapped from OFF tags.
- **Deps:** P3.19a.
- **In:**
  - `docs/catalog/TAXONOMY.md`: 3 levels, about 200–400 nodes, with leaves narrow enough for "similar product" in Phase 9 (cheddar, not cheese or dairy). Design it from the OFF tag counts and the StatCan product list. Non-food aisles that OFF holds, such as supplements, get a node.
  - Mark the leaves that hold items sold without a barcode (produce, meat, seafood, bakery, deli, bulk). P4.28 seeds generic items from them (review H-5).
  - A data migration seeds `categories` (reference config, like `sources`).
  - `category_mappings` rows for OFF tags, covering at least 95% of the 37,783 categorised products. Tags already include their ancestors, so a product takes its deepest mapped tag and rare tags need no row of their own. Provenance: `method = derived` and the mapping file's version. Mappings are `approved` / `auto`.
  - `products.category_rule` smallint null: which rule set the category. A `match_candidates` row per product would cost ≈ 20+ MB, so one compact code is the provenance here (D-077).
- **Out:** assigning categories (P4.9). Retailer categories (D-013).
- **Files:** `docs/catalog/TAXONOMY.md`, a new migration, `packages/core/src/db/database.types.ts`, `docs/catalog/DATA_MODEL.md`.
- **Verification:**
  - Mapped share of categorised products, by level, against the dump's tag counts.
  - Every leaf has a parent chain, and no mapping points at a missing node.
  - Advisors are clean and RLS is on. Every StatCan product maps to a node.

### [ ] P4.9 Categories from OFF tags
- **Slice:** taxonomy.
- **Goal:** every OFF product with mapped tags gets a category.
- **Deps:** P4.2, P4.7, P4.8.
- **In:**
  - A `categorize-tags` job. Tags aren't stored on `products`, so it re-parses the stored OFF raw extract (`readRaw`), which is what raw storage is for. It falls back to the cached dump if retention removed a part.
  - The product takes its deepest mapped tag and a `category_rule` code.
  - Writes only `category_id` and `category_rule`, and leaves locked rows alone.
- **Out:** products with no tags (P4.17).
- **Files:** `pipeline/src/jobs/categorize-tags.ts`, tests, `docs/catalog/BUDGET.md`.
- **Verification:**
  - Sample, then full, then a second run with 0 updates.
  - Counts by level 1 node, and a hand check of 50 random products with errors reported.
  - Budget check.

### [ ] P4.10 Edges keep evidence from several sources
- **Slice:** schema.
- **Goal:** a second source confirming an ownership edge adds evidence instead of overwriting the first.
- **Deps:** P3.19a.
- **In:**
  - An `edge_sources` table for `brand_ownership` and `company_ownership`, shaped like `company_sources`. RLS admin. Writers keep the edge's +prov block from the first source and upsert one evidence row per source.
  - Wikidata, SEC EDGAR and the resolver write through it. SEC's skip of existing pairs (D-074) can become an evidence row. Existing edges keep their provenance.
  - A BUDGET row with its width estimate.
  - **Companies and brands too (review M-6):** `source_id` joins the kept columns in their writers, so a second source that names the same row can't take over its provenance, and the auto-approve guard keeps seeing the source that created it.
  - **A blocked owner change is visible (review M-5):** when an owner pick is refused by the one-current-owner index, the writer returns it, the run writes an event with the count and 5 examples, and each blocked edge gets one `review_queue` row. Today the result is discarded.
- **Out:** a confidence formula across sources.
- **Files:** a new migration, `pipeline/src/db/writers/ownership.ts`, tests, `docs/catalog/DATA_MODEL.md`, `docs/catalog/BUDGET.md`, `packages/core/src/db/database.types.ts`.
- **Verification:**
  - `check:writers`: two sources write one edge, and both are recorded with the first source's provenance intact.
  - `check:writers`: a second source writing an existing company leaves its `source_id` alone; a new owner for a brand that already has one ends `pending` with a queue row and a run event.
  - An RLS check in `supabase/tests/`. Advisors are clean.

### [ ] P4.11 Brand keys
- **Slice:** brand-resolver.
- **Goal:** one stable key per brand across spelling, case and accents.
- **Deps:** P3.19a.
- **In:**
  - `brandKey()` in core: splits OFF's comma lists and removes accents, case, apostrophes (`President's` = `Presidents`), `&`/`and`, trademark signs and legal suffixes.
  - A stoplist of strings that aren't brands (`Produit maison`, `Unknown`, `Generic`, `Sans marque`), with a test per entry.
  - A pure clustering step: key → variants, counts, and the most common spelling as the display name.
  - Which string names a product when `brand_text` lists several (1,659 products): the part that resolves to a known brand with an owner, else the first part. The rule is unit-tested here and used in P4.13.
- **Out:** database writes. Translated names such as `Sans nom` are aliases (P4.12), not keys.
- **Files:** `packages/core/src/brand.ts`, `brand.test.ts`, `packages/core/src/index.ts`.
- **Verification:**
  - Tests from the real top 500 strings.
  - Report strings → keys and the 20 largest clusters, with any wrong merge listed.

### [ ] P4.27 Ownership chains stop at an organisation (added by the review)
- **Slice:** schema.
- **Goal:** the parent shown to users, and scored later, is an organisation, not a person (review H-3).
- **Deps:** P3.19a.
- **In:**
  - `company_ultimate_parent` walks up only through parents whose `kind` is not `individual`. A company whose only parent is a person is its own top parent. `product_ownership_chain` follows.
  - The edges to individuals stay in `company_ownership`. Nothing is deleted.
  - Family holdings that Wikidata types as a company (the "Sobey family" row): list every top parent with 100+ product mentions, and correct `kind` where it's wrong, through the `manual` source with a citation and `kind` locked.
- **Out:** hiding individuals from the admin portal.
- **Files:** a new migration, `supabase/tests/ownership.sql`, `packages/core/src/db/database.types.ts`, `docs/catalog/DATA_MODEL.md`.
- **Verification:**
  - SQL checks as `anon`: Sobeys → Empire Company, St-Hubert → its corporate parent, Hershey's → The Hershey Company.
  - No row of `company_ultimate_parent` names an `individual` as the top parent.
  - Advisors are clean, and the types are regenerated.

### [ ] P4.29 🟡 Banner seed and store links (added by the review)
- **Slice:** brand-resolver.
- **Goal:** every Ontario grocery banner exists with its operator, and stores point at one (review H-6). `banners` has 0 rows today, and the matcher, the receipt gold set and the price rollups all key on a banner.
- **Deps:** P4.7.
- **In:**
  - A cited list of about 25 banners: Loblaws, No Frills, Real Canadian Superstore, Fortinos, Zehrs, Valu-mart, Your Independent Grocer, Shoppers Drug Mart, T&T, Metro, Food Basics, Sobeys, FreshCo, Foodland, Farm Boy, Longo's, Walmart, Costco, Giant Tiger, Whole Foods, and any other found in `stores`.
  - Each row: slug, name, operator company, the spellings a receipt header uses, and a citation URL.
  - **🟡 The owner approves the list** before it's written (a table in PROGRESS). Writes use the `manual` source.
  - Link the 100 existing stores by name through a job. Stores left unlinked are listed.
- **Out:** store locations beyond what Open Prices gave. Retailer sites (D-013).
- **Files:** `docs/catalog/BANNERS.md`, `pipeline/src/jobs/banner-seed.ts`, tests.
- **Verification:**
  - Every banner has an approved operator company. Stores linked and not linked are counted.
  - A second run changes nothing.

### [ ] P4.12 🟡 Private-label and high-impact brand seed
- **Slice:** brand-resolver.
- **Goal:** the brands on the most products have the right owner before anything automatic runs.
- **Deps:** P4.11.
- **In:**
  - A cited seed of the top brand strings that Wikidata missed or split, starting with Canadian grocers' own brands: Compliments, President's Choice with PC and Le Choix du Président, No Name with Sans nom, Western Family, Irresistibles, Selection, Kirkland with Kirkland Signature, Your Fresh Market, Co-op Gold, Great Value. The top 88 strings hold 24,373 of 81,779 mentions.
  - Each row: brand, aliases in both languages, owner, relation, `is_private_label`, and a citation URL. Set `is_private_label` on existing brands (0 today).
  - **Existing edges that look wrong** go in the list too, such as Selection → a company called "Selection" (likely Metro's own label) and Safeway. A correction to an approved Wikidata edge closes the old edge rather than deleting it.
  - **🟡 The owner approves the list** before it's written (D-050: AI-sourced rows are never auto-approved). It's a table of about 30–50 rows in PROGRESS. After approval, writes use the `manual` source and `method = manual`.
- **Out:** long-tail brands.
- **Files:** `docs/catalog/PRIVATE_LABELS.md`, `pipeline/src/jobs/brand-seed.ts`, tests.
- **Verification:**
  - Every row has a citation that was opened and read.
  - After the write, each seeded brand has one current approved owner, shown as `anon` through `brand_current_owner`.
  - A second run changes nothing.

### [ ] P4.25 🟡 Audit the approved matches on high-volume brands (added by the review)
- **Slice:** brand-resolver.
- **Goal:** the brand strings on the most products point at the right brand and owner before P4.13 links products to them (review H-1; amends D-054 for these brands only, D-080).
- **Deps:** P4.11, P4.12.
- **In:**
  - List every OFF brand key on 20+ products that already matches an approved brand (190 strings and 19,231 product mentions on 2026-11-10), with its brand, owner, owner country and top parent.
  - Check each against a source (the company's site, Wikipedia, a filing). Start from the 11 flagged in `docs/REVIEW.md` H-1: Leclerc, IGA, Dairyland, Ziggy's, PVL, POM, Allmax, Ace Bakery, Que Pasa, Wonderful, Kellogg's.
  - A string that covers two owners in Canada (Kellogg's) is split by a stated rule or left with no owner. Record the choice.
  - **🟡 The owner approves the correction list** (a table in PROGRESS, wrong rows only). Corrections are written with the `manual` source. A wrong approved edge is rejected or closed, never deleted, and the misleading alias is removed and locked so the string stops matching.
- **Out:** brands on fewer than 20 products.
- **Files:** `docs/catalog/BRAND_AUDIT.md`, `pipeline/src/jobs/brand-seed.ts` (reused), tests.
- **Verification:**
  - Every one of the 190 rows has a verdict and a source URL.
  - As `anon`, each corrected string resolves to the right owner through `brand_current_owner`, or to none.
  - A second run changes nothing. A Wikidata sample re-run doesn't undo a correction.

### [ ] P4.26 Wikidata: hold a lone foreign candidate (added by the review)
- **Slice:** source-wikidata.
- **Goal:** the class of error behind H-1 isn't approved again.
- **Deps:** P4.25.
- **In:**
  - In the `single` tier, a candidate whose country is set and is neither CA nor US is written with `auto_hold` (pending, hidden) when its string is on 20+ products, and gets one `review_queue` row. Below 20 products the current rule stays.
  - Bump the `wikidata` `method_version`, and record the rule under D-066.
- **Out:** re-matching the whole catalog. The P4.25 corrections stand.
- **Files:** `pipeline/src/sources/wikidata/`, tests, `docs/DECISIONS.md`.
- **Verification:**
  - Unit tests with the real cases: Leclerc, Dairyland and Ziggy's are held; Nestlé (CH) is held and queued; a lone CA or US candidate is approved as before.
  - A `--dry-run --sample` reports how many picks the rule holds.

### [ ] P4.13 Brand rows and product links
- **Slice:** brand-resolver.
- **Goal:** OFF strings become brands, and products get `brand_id`.
- **Deps:** P4.2, P4.7, P4.12, P4.25.
- **In:**
  - A `link-brands` job: match keys against brand names and aliases, add new spellings as aliases, create a brand for each remaining key, and set `products.brand_id`.
  - **Exception to "add new spellings as aliases" (review H-2):** 1,247 of the 1,759 approved brands share a Wikidata item with a company and carry the company's name ("Mondelez International", "Kraft Foods Group"). A key that reaches such a brand only through an alias becomes its own brand, named from the commonest OFF spelling, with a derived `owner` edge to that company (`brand-resolver` method version, approved because the Wikidata match already is). So Cadbury and Christie are two brands owned by Mondelez, not two aliases of a brand called "Mondelez International".
  - New brands are auto-approved (D-054): add `off` to `AUTO_APPROVE.brands`. `source_id` is OFF, `method = derived`, and `brand_text` stays on the product.
  - No per-product `match_candidates` rows. They would blow the budget, and an exact key match has no score to review.
  - Slugs from the key, with collisions handled.
- **Out:** owners for the new brands (P4.14–P4.16).
- **Files:** `pipeline/src/jobs/link-brands.ts`, `pipeline/src/db/writers/review.ts`, tests, `docs/catalog/BUDGET.md`.
- **Verification:**
  - Sample, then full, then a second run with 0 changes.
  - Counts: brands created, aliases added, products linked, and products with `brand_text` left unlinked (expected: only stoplisted strings).
  - As `anon`, a sample product returns its brand, and a legacy brand stays hidden.
  - As `anon`, a Cadbury product and a Christie product show their own brand names and the same owner.
  - Budget check (20,000 brands estimated).

### [ ] P4.14 Brand → company candidates
- **Slice:** brand-resolver.
- **Goal:** every brand without an owner gets scored candidates, with each rule's reason stored.
- **Deps:** P4.10, P4.13.
- **In:**
  - A `brand-candidates` job, writing `match_candidates` with `kind = brand_company`. Tiers: exact company name or alias; the legacy BulkBrandLink rules (text equals brand; name starts with brand, longest wins; company owns exactly one brand); trigram fuzzy through the expression index with `%`, not a full scan.
  - `features` holds the inputs. Common-word brands (Selection, Aurora, Cedar) need a guard, since a one-word exact match to an unrelated company is the likeliest false positive.
  - A score floor and at most 2 candidates per brand, to fit the 40,000-row budget.
  - Scores stay uncalibrated, and nothing is accepted yet.
- **Out:** accepting links (P4.16).
- **Files:** `pipeline/src/jobs/brand-candidates.ts`, `packages/core/src/match/brand.ts`, a new migration if an RPC is needed, tests, `docs/catalog/BUDGET.md`.
- **Verification:**
  - Counts per tier, brands with no candidate, and run time at full size.
  - 5 examples per tier. A second run changes nothing. Budget check.

### [ ] P4.15 Gold-set harness and the brand gold set
- **Slice:** gold-set.
- **Goal:** ~100 labelled brand → company pairs and a script that scores any matcher against them.
- **Deps:** P4.14.
- **In:**
  - `docs/catalog/gold/brand_company.csv`: stratified across tiers and product counts, with extra pairs near likely thresholds, and including brands with no real owner in the catalog so recall has a true denominator. A fixed 50/50 tune and test split by hash.
  - **Chains that are already approved are sampled too (review H-1).** At least 40 of the 100 rows are OFF string → brand → owner chains that Wikidata or the seed approved, drawn in proportion to product count. Without them the set measures only the new resolver, and the links users will see most go unmeasured.
  - Labels come from evidence (the company's site, Wikipedia, a filing), with the URL per row. **Claude does the labelling, so PROGRESS lists 15 rows for the owner to spot-check.**
  - `npm run pipeline -- eval <set>`: precision and recall per tier and threshold, Wilson intervals, and the wrong pairs by name.
- **Out:** choosing thresholds (P4.16).
- **Files:** `docs/catalog/gold/`, `pipeline/src/eval/`, tests, `CLAUDE.md`.
- **Verification:**
  - Unit tests on a small synthetic set with known precision and recall.
  - The script runs on the real set, and the per-tier table goes in PROGRESS.
  - Precision on the already-approved chains is reported on its own, per string and weighted by product count.
  - Every row has a label and evidence.

### [ ] P4.16 Calibrate and apply brand links
- **Slice:** brand-resolver.
- **Goal:** apply the links the evidence supports, and route the rest as the owner decided.
- **Deps:** P4.15.
- **In:**
  - Pick per-tier thresholds on the tune half, and report precision on the test half.
  - **Above the threshold:** the candidate is `accepted` / `auto`, and a `brand_ownership` edge with `match_candidate_id` is approved and visible. Respect the one-current-owner index; a conflict stays pending.
  - **Below it (D-077):** the candidate stays `pending`, and users see the brand with no owner. Brands on 20+ products get one `review_queue` row (`match_candidate`). A big brand with no candidate gets a `brand` row. The long tail gets no queue row.
  - If no tier reaches 95%, nothing is auto-accepted, and PROGRESS says so.
- **Out:** the review UI (Phase 5).
- **Files:** `pipeline/src/jobs/apply-brand-links.ts`, tests, `docs/catalog/BUDGET.md`, `docs/DECISIONS.md`.
- **Verification:**
  - `eval` on the test half: precision ≥ 95%, reported with its interval.
  - Coverage: the share of products whose brand has an owner, before and after.
  - Queue rows added (expected: at most ~525). As `anon`, a sample chain reads through `product_ownership_chain`, and a pending link doesn't.
  - A second run changes nothing.

### [ ] P4.28 Generic items for products with no barcode (added by the review)
- **Slice:** taxonomy.
- **Goal:** a receipt line for bananas or chicken breast matches something and counts in spending (review H-5). OFF holds almost none of these, and nothing else in the plan models them.
- **Deps:** P4.8. P4.24's no-barcode lines are used if they exist, but the task doesn't wait for them.
- **In:**
  - `products.is_generic` boolean, default false. A generic item has no GTIN and no brand, an `external_id` under the `sarvis-derived` source, and a leaf category.
  - A seed of about 150 to 300 items, built from the taxonomy leaves P4.8 marked for produce, meat, seafood, bakery, deli and bulk, and from the StatCan product list.
  - Each has an English and a French name, plus common receipt spellings as aliases for the matcher (P4.18).
  - Generic items never show an owner or a grade. The app labels them "fresh item, no brand" (Phase 8).
  - Provenance: `method = derived` and the seed file's version. Approved automatically, as reference data like the taxonomy.
- **Out:** PLU code lists (check the IFPS terms first; a separate task if wanted). Prices.
- **Files:** a new migration, `docs/catalog/GENERIC_ITEMS.md`, `pipeline/src/jobs/generic-items.ts`, tests, `packages/core/src/db/database.types.ts`, `docs/catalog/DATA_MODEL.md`.
- **Verification:**
  - Count by top-level category, and 10 examples.
  - If P4.24 has run: the share of its no-barcode lines that now have a generic item.
  - As `anon`, a generic item reads with no brand and no owner. A second run changes nothing. Advisors are clean.

### [ ] P4.17 Categories from product names
- **Slice:** taxonomy.
- **Goal:** cover the 58% of products OFF gives no category, without guessing.
- **Deps:** P4.9, P4.13, P4.15.
- **Timebox (review M-10, D-080):** one session. Apply the rules that reach 95%, report the coverage, and stop. The owner has approved a one-off AI classification for what's left (hard cap US$5), which runs in Phase 7 once the OpenRouter module exists and is measured on this task's gold sample.
- **In:**
  - A `categorize-names` job with free rules only: keyword rules on the name in English and French, then brand majority (a brand with ≥ 80% of its categorised products in one node).
  - Each rule has its own `category_rule` code.
  - A gold sample of ~200 uncategorised products, labelled and split as in P4.15. Rules that don't reach 95% aren't applied, so those products stay uncategorised.
  - **If coverage stays low**, report the gap. The AI classifier is approved (D-080) and is a Phase 7 task.
- **Out:** AI classification (Phase 7).
- **Files:** `pipeline/src/jobs/categorize-names.ts`, `packages/core/src/category-rules.ts`, `docs/catalog/gold/category.csv`, tests.
- **Verification:**
  - `eval`: precision per rule on the test half.
  - Share of all products with a category, before and after.
  - A second run changes nothing. Budget check.

### [ ] P4.18 Product matcher
- **Slice:** product-matcher.
- **Goal:** text in, ranked products out, with a score and a reason.
- **Deps:** P4.5, P4.13.
- **In:**
  - A SQL candidate RPC using `normalize_match_text` with the `%` operator on the existing trigram index. This fixes the legacy problem where no index applied (CATALOG_REVIEW §5).
  - `scoreProductMatch()` in `packages/core/src/match/`, in order: GTIN exact, listing exact (banner + normalized text, which replaces legacy `product_aliases`), name exact, brand + name, fuzzy name/brand/size. Size agreement counts through `parseSize`. The legacy tier values are the starting scores.
  - An abbreviation expander for receipt text (`BTRMLK`), table-driven and tested.
  - Generic items (P4.28) are candidates too, through their aliases, so a no-barcode line can match at category level. A branded product outranks a generic item at the same score.
  - A helper that writes a decision to `match_candidates` (`listing_product`), for Phase 8 to call.
  - Latency target: under 200 ms per line at 95k products, because a receipt has ~30 lines.
- **Out:** edge functions and the app. Choosing thresholds (P4.21).
- **Files:** `packages/core/src/match/product.ts`, tests, a new migration, `packages/core/src/db/database.types.ts`.
- **Verification:**
  - Unit tests per tier. `explain analyze` shows the trigram index in use, and the timings go in PROGRESS.
  - 10 example queries with results.
  - RLS check: the RPC returns only what the caller may see.

### [ ] P4.19 Product gold set: catalog pairs
- **Slice:** gold-set.
- **Goal:** ~100 labelled pairs from real catalog text.
- **Deps:** P4.15, P4.18.
- **In:**
  - `docs/catalog/gold/product_catalog.csv`: OFF near-duplicates and hard negatives (same brand and line, different size or flavour), sampled from trigram neighbours and stratified by score. Includes products with `gtin` null. Pairs sharing a GTIN through `product_sources` are easy positives, so they're capped at 10%.
  - Labels from OFF's pages and photos, with the URL per row. 15 rows for the owner to spot-check.
- **Out:** calibration (P4.21).
- **Files:** `docs/catalog/gold/product_catalog.csv`, `docs/catalog/gold/README.md`.
- **Verification:**
  - `eval` runs with the starting tiers, and the table goes in PROGRESS.
  - Every row has a label and evidence, and the balance of positives and negatives is reported.

### [ ] P4.20 Product gold set: receipt lines
- **Slice:** gold-set.
- **Goal:** the owner's real receipt lines labelled with their true product (18 lines; there were meant to be ~100, D-082).
- **Deps:** P4.18, P4.24.
- **In:**
  - **The lines are in** `docs/catalog/gold/receipt_lines.csv` from P4.24: 18 lines from 2 receipts, 15 identified. The owner has no more receipts (D-082), so the task runs on these and doesn't wait. Lines added later (Phase 8 receipt scans by the owner) are appended under the same rules. This task adds the true product for each line and runs the matcher on them.
  - `docs/catalog/gold/receipt_lines.csv` holds **only the line text**, the banner name and the label. The repo is public, so each line is checked by hand for card digits, loyalty numbers, names and addresses. No store location, date, totals or images are committed.
  - A line with no true match in the catalog is labelled `none`. That's useful in itself: it measures how much of what people buy the catalog covers.
- **Out:** receipt OCR (Phase 8). Lines are matched as typed.
- **Files:** `docs/catalog/gold/receipt_lines.csv`, `docs/catalog/gold/README.md`.
- **Verification:**
  - A scan for long digit runs and the owner's name and email finds nothing.
  - `eval` runs with the starting tiers, and the table goes in PROGRESS.
  - The share of lines labelled `none` is reported.

### [ ] P4.21 Calibrate the product matcher
- **Slice:** product-matcher.
- **Goal:** tier scores and thresholds that come from data, replacing the legacy hand-picked values.
- **Deps:** P4.19, P4.20.
- **In:**
  - Tune tier scores and the auto-accept threshold on the tune half of the catalog set. Report catalog pairs and receipt lines separately, because receipts will be worse and need their own threshold.
  - **The receipt set is too small to split** (15 identified lines, D-082). Report the matcher's result on all of it, with no tuning on it. Receipt matches need user confirmation until the set holds about 100 lines.
  - Record the thresholds in core and in DECISIONS, with a `match_method_version` bump.
  - If receipt lines can't reach 95% at a useful recall, say so. Every receipt match then needs user confirmation, which is an input to Phase 8's UX.
- **Out:** Phase 8 wiring.
- **Files:** `packages/core/src/match/product.ts`, tests, `docs/DECISIONS.md`.
- **Verification:**
  - `eval` on the catalog test half: auto-accept precision ≥ 95%, or the shortfall reported plainly. `eval` on all the receipt lines, reported as a small sample.
  - Recall at that threshold, and the wrong pairs by name.

### [ ] P4.22 Price sanity bounds
- **Slice:** price-sanity.
- **Goal:** a bad price fails validation before it's written.
- **Deps:** P4.5, P4.9.
- **In:**
  - Map each StatCan product to a category (`reference_prices.category_id`), and convert its units through `parseSize` (`200 grams`, `per kilogram`, `unit`).
  - **The `reference_price` writer has the P4.2 bug** (found there): it sends `category_id: … ?? null` and StatCan sends `category_slug: null`, so a re-run would erase the mapping. Fix it the same way, or have the source name the slug, and re-run StatCan to prove it (D-079).
  - A `price-bounds` job builds `price_sanity_bounds` per category × unit basis from StatCan history and observed `price_observations`, with wide margins (a sale isn't an error). A category with no data takes its parent's bounds, and a price with no bound passes unchecked. `basis` records how each bound was made.
  - Wire the bounds into `evaluateBatch` for Open Prices, through the existing `PriceBounds` hook.
- **Out:** receipt prices (Phase 8 uses the same bounds).
- **Files:** `pipeline/src/jobs/price-bounds.ts`, `pipeline/src/sources/open-prices/`, tests.
- **Verification:**
  - An Open Prices re-run: report `price_sanity` failures and examine each one. A good price that fails means the margin changes.
  - A unit test with a planted 100× price and a planted 1/100 price, both caught.
  - Coverage: the share of categories and of priced products with a bound.

### [ ] P4.23 Phase 4 exit check
- **Slice:** release-check.
- **Goal:** prove the exit criteria.
- **Deps:** every Phase 4 task.
- **In:**
  - `eval` on every gold set, and each exit line with its number.
  - Catalog coverage: the share of products with a brand, an owner chain, a category and a size, compared with the start of the phase. Add how many have both a leaf category and a size, since Phase 9 needs both.
  - **Basket coverage (review C-1, C-2):** the P4.24 numbers; the share of receipt gold lines the matcher gets right; the share of products with a leaf category and an owner (the pool alternatives can draw from); the count of products with any price, and of store × product pairs with one. State plainly what Phase 9 can and can't offer on this data.
  - Every job run twice, with no changes on the second run.
  - A visibility check as `anon` (nothing pending or legacy), advisors, BUDGET §1 re-added against the measured DB size, and the latest CI run.
- **Out:** fixing what it finds. Each gap becomes a task.
- **Files:** `docs/PLAN.md`, `docs/PROGRESS.md`, `docs/catalog/BUDGET.md`.
- **Verification:** every item above is in PROGRESS with its number. Failures are reported as they are, and the phase closes only when the exit lines pass or the owner accepts the gap.

### Phase 4 milestone coverage

| Milestone | Tasks |
|---|---|
| M1 Product identity | P4.1 (GTIN), P4.2 (writer), P4.3 (OFF codes), P4.4 (legacy takeover), P4.30 (delta duplicates) |
| M2 Sizes | P4.5 (parser), P4.6 (OFF) |
| M3 Derived jobs | P4.7 |
| M4 Taxonomy | P4.8 (taxonomy, mappings), P4.9 (from tags), P4.17 (from names) |
| M5 Brands | P4.11 (keys), P4.12 (seed), P4.13 (brand rows, product links) |
| M6 Brand → company | P4.10 (edge evidence), P4.14 (candidates), P4.15 (gold set), P4.16 (apply) |
| M7 Product matcher | P4.18 (matcher), P4.19 (catalog gold), P4.20 (receipt gold), P4.21 (calibration) |
| M8 Price sanity | P4.22 |
| M9 Coverage and data fixes | P4.24 (coverage probe), P4.25 (match audit), P4.26 (lone foreign candidate), P4.27 (corporate top parent), P4.28 (generic items), P4.29 (banners) |
| M10 Operations pulled forward | P2.24 (hardening), P6.1 (OFF refresh, keep-alive), P6.2 (dev-DB checks in CI), P6.3 (raw retention) |
| Exit criteria | P4.23 |

**Open 🟡 steps in Phase 4:**
- **P6.1:** the owner adds three GitHub Actions secrets. P6.2 and P6.3 wait on it.
- **P4.29, P4.12, P4.25:** the owner approves a short list each (banners, grocers' own brands, corrections to matched brands). P4.13 onward waits on P4.12 and P4.25.

## Phase 4B — First user slice (full detail; added by the review, D-080)

**Exit:**
- On web and Android, anyone can search the real catalog, scan a barcode, and see a product's brand, owner and parent company with its sources, without an account.
- The owner has looked up 30 products they know, and every wrong or missing result is logged as a task or a correction.

**Why here:** it puts the catalog in front of a person before the admin portal, scheduling and AI phases, with no AI cost and no new tables. The four screens were in Phase 8; this moves them. Phase 8 keeps home, history, receipts, stories, profile and settings, and polishes these.

**Starts when:** brand links are applied (P4.16) and chains end at an organisation (P4.27). It doesn't wait for the matcher tasks (P4.18 to P4.21).

**Feature slices** (each task touches exactly one): `auth`, `navigation`, `search`, `product`, `scan`, `company`, `release-check`.

**Rules for every task in this phase:** the CLAUDE.md "Verifying your work" rules (web with Playwright, Android on the emulator, screenshots against `docs/baseline/`, 0 console errors, a `testID` on every interactive element). Attribution appears next to OFF data and images (ODbL, CC BY-SA) and Wikipedia text (D-013 D1). A company or product with no published score shows "Not yet rated", never a placeholder grade.

### [ ] P1.18 Auth hardening before user data exists (added by the review; runs here)
- **Slice:** auth.
- **Goal:** a link can't swap the signed-in account, and an offline start doesn't sign the user out (review M-1, M-2).
- **Deps:** P1.15.
- **In:**
  - Move email links to the PKCE flow (`exchangeCodeForSession`). Tokens in a URL's query or fragment are no longer accepted.
  - A link for a different user while someone is signed in is refused with a message.
  - Start-up: after a short timeout with no network, keep the stored session and show an offline state with retry, instead of `/auth`.
  - On a warm start, set the recovery state before the session, so the tabs don't flash before "Set a new password".
  - Amend D-028.
- **Out:** encrypted session storage on Android (Phase 10).
- **Files:** `app/src/lib/auth/**`, `app/src/lib/supabase.ts`, `app/src/app/_layout.tsx`, `e2e/auth.spec.ts`, `scripts/dev-recovery-link.ts`, `docs/DECISIONS.md`.
- **Verification:**
  - e2e: the reset and confirmation flows still pass; a URL carrying another user's tokens doesn't change the session.
  - A test with the network blocked shows the offline state, not `/auth`.
  - Android: a recovery link opens "Set a new password" (mobile MCP screenshot).

### [ ] P1.19 Small app fixes from the review (added by the review; runs here)
- **Slice:** navigation.
- **Goal:** clear the low-severity items in one pass (review L-1, L-2, L-5, L-6, L-7).
- **Deps:** P1.13.
- **In:** a `+not-found` screen in the app's look; no public sitemap; dev routes left out of production builds; a root error boundary; `accessible` and a role on GradeBadge, RatingPill and ScoreRing; `aria-pressed` on filter chips; the duplicate `eslint-config-expo` entry removed.
- **Owner action:** turn on leaked-password protection in the Supabase Auth settings (review L-3).
- **Out:** new features.
- **Files:** `app/src/app/**`, `app/src/components/ui/**`, `app/package.json`, `e2e/`.
- **Verification:** a production export served locally: `/no-such-route` shows the new screen, and `/_sitemap` and `/dev/gallery` are not found. e2e passes.

### [ ] P1.20 Guest access to the catalog screens (added by the review; runs here)
- **Slice:** auth.
- **Goal:** search, scan, product and company pages work without an account (owner decision, D-080). RLS already lets `anon` read the approved catalog.
- **Deps:** P1.18.
- **In:**
  - The root guards open the tabs, `product/[id]`, `company/[id]`, about, help and privacy to signed-out users. History, receipts, profile and settings still need a session, and show a "Sign in to keep your history" state with a button to `/auth`.
  - The profile button becomes "Sign in" when signed out. After sign-in the user returns to where they were.
  - No write happens for a guest: nothing is logged to a user table.
- **Out:** anonymous Supabase sign-ins (D-015: none). Saving a guest's scans on the device.
- **Files:** `app/src/app/_layout.tsx`, `app/src/app/(tabs)/**`, `app/src/components/navigation/**`, `e2e/auth.spec.ts`, `e2e/navigation.spec.ts`, `docs/DECISIONS.md`.
- **Verification:**
  - e2e: signed out, `/` and `/product/<id>` open; `/settings` and `/admin` still land on `/auth`; the History tab shows the sign-in state.
  - Web and Android screenshots of the signed-out home and History tab.

### [ ] P4B.1 Search
- **Slice:** search.
- **Goal:** find a product, brand or company in the real catalog by typing.
- **Deps:** P4.16, P4.27, P1.20.
- **In:**
  - A `search_products` RPC (security invoker, the trigram index, limit and offset) returning name, brand, size, image key and owner. Generic items are left out.
  - The Search screen to baseline `07` to `09`: input, filter chips, results, empty and no-results states, loading and error states.
- **Out:** search history. Barcode entry (P4B.3).
- **Files:** a new migration, `supabase/tests/`, `packages/core/src/db/database.types.ts`, `app/src/app/(tabs)/search.tsx`, `app/src/components/search/**`, `app/src/lib/catalog/**`, `e2e/search.spec.ts`.
- **Verification:**
  - RLS check: the RPC returns only approved, active products as `anon`.
  - `explain analyze` shows the index and under 200 ms. e2e finds a known product.
  - Web and Android screenshots against the baseline.

### [ ] P4B.2 Product page
- **Slice:** product.
- **Goal:** a product shows who makes it and who owns them.
- **Deps:** P4B.1.
- **In:**
  - Baseline `13`: name, size, labels, the OFF image with its attribution, brand → owner → top parent from `product_ownership_chain`, and a link to the source page.
  - "Not yet rated" where there's no published score. A product with no brand or no owner says so plainly.
  - Loading, error and not-found states.
- **Out:** prices, alternatives, features and transparency steps (Phase 8, 9).
- **Files:** `app/src/app/product/[id].tsx`, `app/src/components/product/**`, `app/src/lib/catalog/**`, `e2e/product.spec.ts`.
- **Verification:** e2e opens a product with a full chain, one with no owner and an unknown id. Web and Android screenshots against the baseline.

### [ ] P4B.3 Barcode scan
- **Slice:** scan.
- **Goal:** scanning a barcode opens its product.
- **Deps:** P4B.2.
- **In:**
  - Camera scanning on Android with `expo-camera` (a new dependency, recorded in DECISIONS), and typed entry on web and as a fallback.
  - The code goes through `normalizeGtin` (UPC-E arrives as 8 digits, P4.1), then a lookup by GTIN.
  - A clear "not in the catalog yet" state for a miss, and a permission-denied state.
- **Out:** an OFF API lookup on a miss (P4B.6, added after P4.24). Receipt scanning (Phase 8). Saving the scan to history (Phase 8).
- **Files:** `app/src/app/(tabs)/scan.tsx`, `app/src/components/scan/**`, `app/app.json`, `app/package.json`, `e2e/scan.spec.ts`, `docs/DECISIONS.md`.
- **Verification:**
  - Emulator: a UPC-A and its UPC-E reach the same product (mobile MCP).
  - e2e for typed entry: a hit, a miss and an invalid code.

### [ ] P4B.6 OFF API lookup on a scan miss (added by P4.24)
- **Slice:** scan.
- **Goal:** a scanned barcode that isn't in the catalog still finds its product when OFF has it outside the Canadian set. P4.24 found 5 of 8 barcoded food lines (D-082).
- **Deps:** P4B.3.
- **In:**
  - On a miss, one server-side call to the OFF product API (S2, approved as a lookup fallback only), within its rate limits and with the pipeline's User-Agent.
  - A hit is shown with its source and stored through the OFF mapping (`off@` version, provenance, `review_status` as for OFF rows), so a second scan reads it from the catalog. A miss is cached so it isn't asked again soon.
  - The app never calls OFF directly.
- **Out:** name search against OFF. Non-food products (food only for now, D-082).
- **Files:** to be set when the task starts (an Edge Function or the API layer chosen in P4B.1), `docs/catalog/SOURCES.md`, `docs/DECISIONS.md`.
- **Verification:**
  - A code that's in OFF but not in the catalog is found and stored. A second scan makes no OFF call. A code OFF doesn't have shows "not in the catalog yet".
  - e2e with the OFF call mocked. One live call on a real code, reported in PROGRESS.

### [ ] P4B.4 Company page
- **Slice:** company.
- **Goal:** a company shows what it is, what it owns and who owns it.
- **Deps:** P4B.2.
- **In:** baseline `16`: the Wikipedia summary with its CC BY-SA link, the brands it owns, its parent chain (ending at an organisation, P4.27), and "Not yet rated". Loading, error and not-found states.
- **Out:** scores, articles and events (Phase 7, 8).
- **Files:** `app/src/app/company/[id].tsx`, `app/src/components/company/**`, `app/src/lib/catalog/**`, `e2e/company.spec.ts`.
- **Verification:** e2e opens a company with a parent and one without. Web and Android screenshots against the baseline.

### [ ] P4B.5 🟡 Owner walkthrough and exit check
- **Slice:** release-check.
- **Goal:** a person who knows the products judges the data, before more is built on it.
- **Deps:** P4B.1 to P4B.4, P4B.6.
- **In:**
  - **🟡 The owner looks up 30 products they know,** by search and by scan, and notes anything wrong, missing or odd.
  - Each note becomes a correction through the `manual` source, a PLAN task, or a stated "won't fix".
  - The exit lines above are checked, with the full e2e run and the latest CI run.
- **Out:** fixing what it finds. Each gap becomes a task.
- **Files:** `docs/PLAN.md`, `docs/PROGRESS.md`.
- **Verification:** the 30 results are in PROGRESS, each with a verdict. The phase closes when the owner accepts the list.

## Phase 5 — Admin portal: catalog tools (outline)

**Exit:** an admin can review matches and ownership, see the quality dashboard, and browse and edit every catalog entity with its provenance. Verified with Playwright screenshots. (Bulk CSV import left the exit when the owner deferred it, D-080.)

- [ ] **P5.0 Refine Phase 5 into session-sized tasks.**
- **Inputs from the review (D-080):**
  - **Build the review queue and the quality dashboard first.** Phase 4 leaves several hundred open queue rows and nothing can clear them. Review one company or brand per screen, not one row at a time.
  - **Deferred by the owner:** CSV bulk import, and triggering pipeline runs from the portal. Runs start from GitHub Actions (`workflow_dispatch`). Bring either back only if the owner asks.
  - Supabase Studio already browses and edits every table, so the DB editor comes after the queue.
- **Milestones:**
  - Admin layout and navigation inside the Expo app's web-only `/admin` group (D-005, P1.12), with the legacy admin look (THEME.md).
  - DB browser/editor for companies, brands, ownership, products, stores and prices: provenance panel, and edits recorded as `manual` provenance.
  - Bulk import: CSV/JSON upload → preview → validation report → dry run → idempotent commit. **Deferred by the owner (D-080).**
  - Ingestion runs list and detail (rows, errors, raw object links).
  - Match and ownership review queue.
  - Manual entry forms for certifications, external ratings and company events with a required citation URL (B Corp, Fairtrade and KnowTheChain are manual-only, D-013 D6).
  - Sources page: verdict, licence, terms and the last run per source.
  - Quality dashboard: rows per source, match rate, stale prices, unscored companies, unresolved brands, DB/storage usage against budget.
  - 🟡 Triggering pipeline runs from the admin portal needs a GitHub token held server-side (an edge function secret). The owner approves the token's scope. **Deferred by the owner (D-080).**

## Phase 6 — Scheduling and operations (outline)

**Exit:** scheduled runs work on GitHub Actions for a full week with no manual steps. Failures open an issue, and budget alarms work.

- [ ] **P6.0 Refine Phase 6 into session-sized tasks.**
- **Already done early (review, D-080):** P6.1 (scheduled OFF refresh and keep-alive), P6.2 (dev-database checks in CI) and P6.3 (raw-retention cleanup) sit in Phase 4, after P4.3. P2.24 added the run lock and database retries. P6.0 numbers its tasks from P6.4.
- **Inputs from the review (D-080):**
  - **Production:** the dev project becomes production at launch (owner decision). Plan the cut-over: remove test users and fixture rows, rotate keys, rename the env variables, and give the pipeline an explicit target that can't be set by accident. The dev-only checks (`check:*`, the e2e users) need somewhere to run afterwards.
  - **Backups:** the free plan has none. A weekly export of what can't be rebuilt from sources (review decisions, `manual` rows, `audit_log`) to private Storage, and a decision on user data.
  - **Schedules for the other sources,** each with the P6.1 concurrency group.
- **Milestones:**
  - Cron workflows per source with `workflow_dispatch`, concurrency groups, and `actions/cache` for the HTTP cache.
  - Supabase keep-alive.
  - Freshness policy: per-source refresh intervals and stale-price thresholds. OFF (P3.7): a daily `--mode delta` run plus a periodic `--mode full`. A gap of more than 14 days between delta runs loses files, so it should trigger a full run. A robots.txt 5xx fails a run (D-059), so the next scheduled run is the retry.
  - Raw-retention cleanup job (retention per DATA_MODEL §5, using `retentionFor()` and `deleteRawFile()` from P2.14; the per-subject limit for Wikipedia and EDGAR needs a subject derived from `request_url`, D-044), plus the row-retention purges (events, validation failures, candidates, queue).
  - A budget monitor (DB size, storage size, OpenRouter spend, egress) that warns at the thresholds in BUDGET §6, including the 330 MB trigger for the reserve lever 1 (D-070). Pick one unit for the thresholds: BUDGET is decimal MB, `pg_size_pretty` is 2^20 bytes (§2, found in P3.19a).
  - Budget purges adopted in P3.13c (D-070): store-level `price_points_monthly` rows older than 6 months roll up to the banner; `company_scores` versions beyond the latest 2 (with their `score_citations`); `documents` that no entity, score or company links to.
  - Failure notification by opening a GitHub issue.

## Phase 7 — AI enrichment: scores and articles (outline)

**Exit:** a batch of 10 companies is scored with citations and confidence. All scores land in the review queue, approved scores show in the app, and cost per company is logged.

- [ ] **P7.0 Refine Phase 7 into session-sized tasks.**
- **Inputs from the review (D-080, review H-4):**
  - **Evidence first.** Before any prompt is written, research evidence sources for each of the five rubric categories, with terms checked as in SOURCES.md. Include Canadian public registers (for example the federal supply-chain reports and the lobbying registry). A score built on a Wikipedia summary alone isn't publishable.
  - **Score in order of products covered, with a target.** On 2026-11-10, 10 top parent companies covered 50% of products with a known owner, and 69 covered 80%. The first target is those 69.
  - **Decide which company a score attaches to.** Recommended: the top corporate parent (P4.27), inherited by its subsidiaries and brands unless one has its own score.
  - **Review one company per screen:** five categories with their citations side by side.
  - **Trust and legal:** a public method page, the date and sources on every rating, wording that separates cited fact from Sarvis's rating, and a contact route for a company to dispute one.
  - **Article links:** decide whether a link from an allow-listed publisher may appear without review when it carries no good or bad tag. One reviewer can't read every article.
  - **AI category classification (owner-approved, D-080):** a one-off job over products that P4.17 left without a category. Hard cap US$5. Measured on P4.17's gold sample, and applied only if precision is at least 95%. It gets its own `category_rule` code.
  - If receipts are built before scoring, the module spike moves to the start of that work.
- **Milestones:**
  - The single OpenRouter module (D-009): configurable model, zod-validated output, a token and cost log, a mock mode, a spend guard. **First task:** a spike proving the same module runs in a Deno edge function and in the Node pipeline.
  - 🟡 Rubric v1 (`docs/catalog/RUBRIC.md`): 5 categories × Good/Mixed/Poor, 0–100 and letter grade (D-004), evidence requirements, confidence levels. The owner approves the rubric before scoring runs.
  - Company scoring job → review queue (model, rubric version, sources, confidence).
  - Article collection: GDELT (weekly, because the API searches a rolling 3-month window) and RSS (the provisional list from SOURCES.md S24, with each feed's terms checked before it's added, D-013 D4), plus Wikipedia. Relevance and good/bad tagging → review queue.
  - Budget (D-070): at most 30 `document_entities` per company or brand, keeping the most relevant, and only the latest 2 score versions are kept (the Phase 6 purge enforces both).
  - Review queue UI in the admin portal.
  - 🟡 Auto-publish rule (D-006: none until the owner decides).

## Phase 8 — User app screens (outline)

**Exit:** every baseline screen is rebuilt, matches `docs/baseline/` on web and Android, and reads the new catalog. The e2e suite covers the main flows.

- [ ] **P8.0 Refine Phase 8 into session-sized tasks.**
- **Already built in Phase 4B (review, D-080):** search, the product page, barcode scan, the company page and guest access. Phase 8 adds prices, scores, articles and history to them.
- **Inputs from the review (D-080, review M-12, M-13, H-7):**
  - **Receipt design questions to settle first:** how a receipt gets its store and banner (read from the header, picked by the user, or both); what a user can do with an unmatched line; whether one user's confirmed match becomes a listing other receipts match against, and how a wrong confirmation is kept from spreading; generic items shown as "fresh item, no brand" (P4.28).
  - **Receipt edge function:** it checks the caller's own JWT (the legacy function accepted any holder of the public key), enforces a per-user daily limit, and logs the cost of every scan against the cap.
  - **Receipt prices are shared per banner and month, not per store and week** (D-080, amending D-014). The user always sees their own prices. The floor of 2 receipts and the consent wording are still approved here.
  - **Sign-up email:** Supabase's built-in email only reaches team addresses. Pick a mail provider with a free tier (owner decision) before real users can register.
  - **A `client_errors` table** fed by the error boundary, so crashes are visible with no new service.
  - **A data export** for the user's own history and receipts (PIPEDA access).
- **Milestones:** one task per screen or flow.
  - Home.
  - Search: catalog-wide, by product, brand or company.
  - Product detail: ownership chain, rating, prices by store. Attribution next to OFF data and images (ODbL, CC BY-SA) and Open Prices prices (D-013 D1; moved here from Phase 3 in P3.0).
  - Company detail: scores with citations, articles, the Wikipedia summary with its CC BY-SA link (P3.14).
  - Barcode scan. Scanners report UPC-E as 8 digits, so the lookup goes through `normalizeGtin` (P4.1).
  - Receipt scan: rebuilt `process-receipt` on the shared AI module and the P4 matcher, with user confirmation of matches.
  - History and spending tracking: by month, store and company.
  - Stories/articles.
  - Story covers: a public Storage bucket for `stories.cover_image_path`, plus a licence check for each cover. Legacy Unsplash URLs aren't carried over (P2.9, D-039). Check the storage budget first.
  - Profile, settings, about, help, privacy. Offline cache.
  - Receipt prices feed the shared price catalog, and consenting users' prices may be contributed to Open Prices (D-013). 🟡 The owner approves the consent and privacy wording, and the k-anonymity rule for `price_points_weekly` (placeholder: ≥ 2 receipts; DATA_MODEL §9).
  - Receipt scan is the main source of store prices (D-013 D7), so build it early in this phase.
  - Before the first rollup row is written: `price_points_weekly` and `price_points_monthly` drop their surrogate `id` and use their unique natural keys as the primary key (D-070, ≈ 2.3 MB).
  - 🟡 Product grades: derive them from the owner company's published score (default; DATA_MODEL §9), or keep product-level scores.
  - 🟡 Community submissions (legacy F9): keep them as review-queue items, or drop them.

## Phase 9 — Ethical alternatives (outline)

**Exit (changed by D-080, which amends D-011):** for a test set of receipts, each matched product with a rated owner gets alternatives of the same kind from a better-rated company. A price is shown wherever one is known, with its source and date, and an alternative that costs more is flagged. "At this store" is a filter that appears only for stores with data. Evaluated on a labelled set.

- [ ] **P9.0 Refine Phase 9 into session-sized tasks.**
- **Inputs from the review (D-080, review C-1):**
  - **Start with a gate.** Refresh the P4.23 coverage numbers: products with a leaf category and a rated owner, and store × product pairs with a price. Build UI only for what the data supports, and report the numbers to the owner first.
  - **The default is "same kind of product, better-rated company".** Same-store and same-or-lower price were the original default (D-011), and the catalog can't support them: 521 prices in Canada and 64 in Ontario on 2026-11-10, with every retailer source avoided (D-013).
- **Milestones:**
  - Define "similar": same taxonomy leaf and a size band compared by unit price.
  - Define "more ethical": a minimum score gap, and only published scores.
  - Same-store filter (the default until D-080). Where the store has no data, show the same chain, then other chains, clearly labelled (D-011).
  - **Size gap:** 79% of OFF products have no size (D-077), so unit-price comparison reaches only part of the catalog. P4.23 reports how many products have both a leaf category and a size. Decide here how to treat a candidate with no size.
  - **Audit note:** with no retailer sources (D-013), "available at this store" is known only from receipts and Open Prices, so expect thin same-store coverage at first. Label the source of each alternative's price ("seen on a receipt at …", with its date).
  - Precomputed alternatives table refreshed by the pipeline.
  - UI on the product, receipt-results and history screens.

## Phase 10 — Release hardening (outline)

- [ ] **P10.0 Refine Phase 10 into session-sized tasks.**
- **Inputs from the review (D-080, review H-7, M-13):**
  - **Capacity:** the free database passes its warning line at about 110 to 125 active users (BUDGET §8). The owner has accepted a paid tier of about US$25 a month at that point. Flag it again before switching, as CLAUDE.md requires.
  - **Play Store:** check the current requirements before choosing it, including the fee, the closed-test rule for new personal developer accounts, and a web page where a user can ask for deletion.
  - **Privacy policy:** names OpenRouter as a processor of receipt images, and covers consent, access and deletion.
  - **Encrypted session storage on Android** (D-025 stores it in plain AsyncStorage).
  - **`npm audit`** rechecked after the next Expo SDK upgrade.
- **Milestones:**
  - 🟡 Web hosting choice (free: EAS Hosting, Cloudflare Pages or Netlify).
  - 🟡 Android distribution (an EAS free build or a local Gradle APK; the Play Store costs $25, so flag it).
  - Privacy policy and data deletion. Open data attributions (OFF/Open Prices ODbL, Wikipedia CC BY-SA, GDELT, StatCan) on the About screen.
  - 🟡 A paid Supabase tier once the DB nears the 400 MB alarm (≈ 200–250 active users within a year, BUDGET §8), or archiving user history to Storage.
  - Accessibility pass, performance pass, full e2e run, security advisors clean (`get_advisors`).
