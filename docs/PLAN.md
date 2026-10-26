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

### [ ] P0.9 Write a frank review of the legacy catalog and scraper
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

### [ ] P0.10 Research and compare catalog sources → SOURCES.md
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
  - 🟡 After this task, the owner answers the decisions list before any P3 retailer task.

### [ ] P0.11 Design the catalog data model and free-tier budget
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

### [ ] P0.12 Refine Phase 1 into session-sized tasks
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

## Phase 1 — Foundation (outline)

**Exit:**
- The app runs on web and Android.
- Email sign-in works.
- Non-admins can't open `/admin`.
- CI is green.
- The Commands table in `CLAUDE.md` is filled in.

- [ ] **P1.0 Refine Phase 1** → done by P0.12.
- **Milestones:**
  - Repo scaffold: npm workspaces (D-007), Expo SDK 54 + Expo Router + strict TS, ESLint, Prettier, Vitest, Playwright e2e for web, `.env.example`.
  - CI workflow: typecheck, lint and unit tests on push/PR (GitHub Actions).
  - Supabase wiring: migrations folder, type-generation script, base schema (`profiles` with `role`, an `is_admin()` security-definer helper), RLS. No service-role key in any client.
  - Auth: providers per SPEC (email first; others as separate tasks, Apple likely out on Android/web). Account deletion RPC.
  - Theme tokens and UI primitives from THEME.md (GradeBadge, RatingPill, ScoreRing, cards, chips, buttons, empty/error states), with a component gallery route for screenshot checks.
    - 🟡 **Decision:** legacy renders in system fonts, but the Stitch designs specify Epilogue and Public Sans (see THEME.md › Fonts). Default: keep system fonts, matching the legacy app. Loading the Stitch fonts is a design change.
  - App shell: tabs and stack routes as placeholders whose layout matches the baseline. Web-only `/admin` route group gated by role (D-005).

## Phase 2 — Catalog core: schema and ingestion framework (outline)

**Exit:** a fixture source goes raw → stored → parsed → validated → upserted. Running it twice creates no duplicates, and every row carries provenance.

- [ ] **P2.0 Refine Phase 2 into session-sized tasks.** Deps: Phase 1.
- **Milestones:**
  - Catalog schema migrations from DATA_MODEL.md, split by domain: ownership, products, stores and prices, pipeline bookkeeping, scoring. Types regenerated each time.
  - `packages/core`: pure TS zod schemas for every ingestible record, plus the validation library (required fields, price sanity, size/unit normalization hooks, duplicate detection).
  - `pipeline` package:
    - a polite HTTP client (robots.txt check, ~1 req/s/host, exponential backoff, on-disk cache);
    - a raw store (gzip → Supabase Storage, retention per D-010);
    - `ingestion_runs` bookkeeping;
    - idempotent upsert helpers keyed on GTIN/SKU/slug;
    - a CLI: `pipeline run <source> --sample N [--dry-run]`.
  - Re-import the legacy content (P0.2 JSON) with `legacy-import` provenance.
  - Pipeline unit tests on fixtures. The dev DB size is checked after the seed.

## Phase 3 — Catalog sources (outline)

**Exit:** each approved source has been run on a sample, then scaled, with row counts, examples and validation results in PROGRESS. The DB and storage stay within budget.

- [ ] **P3.0 Refine Phase 3 into session-sized tasks.** Deps: Phase 2 and the owner's answers to the SOURCES.md decisions.
- **Milestones:** each source is its own task pair: (a) sample of ~100 records, (b) scale-up.
  - Open Food Facts, Canadian subset: products, GTINs, brand strings, categories, quantity.
  - Wikidata: brand → company → parent ownership, with dates and Wikidata QIDs as stable IDs.
  - Open Prices: Canadian store price observations.
  - StatCan average retail prices, as a price-sanity reference.
  - 🟡 Retailer catalog sources: only those marked **use**, or approved by the owner, in SOURCES.md (D-002). One task pair per retailer.
  - A budget check after each scale-up task.

## Phase 4 — Normalization and matching (outline)

**Exit:** a labelled gold set (~200 product pairs, ~100 brand→company pairs) measures precision and recall. Auto-accept precision is ≥ 95%, and the rest goes to a review queue.

- [ ] **P4.0 Refine Phase 4 into session-sized tasks.**
- **Milestones:**
  - Size/unit parser and unit price (g/kg/ml/L/ct, multipacks, "x"), tested on real strings from P3.
  - GTIN normalization: UPC-A/EAN-13/GTIN-14 check digits, PLU, and store-internal codes.
  - Category taxonomy: Sarvis taxonomy plus mappings from OFF and retailer categories.
  - Product matcher: GTIN exact first, then fuzzy name/brand/size (`pg_trgm` plus scoring in core), with a confidence score and stored match decisions.
  - Brand → company resolver: exact, alias, Wikidata, fuzzy. Unresolved brands go to the queue.
  - Gold-set evaluation script that reports precision and recall.

## Phase 5 — Admin portal: catalog tools (outline)

**Exit:** an admin can browse and edit every catalog entity with its provenance, bulk-import a CSV safely, review matches and ownership, and see the quality dashboard. Verified with Playwright screenshots.

- [ ] **P5.0 Refine Phase 5 into session-sized tasks.**
- **Milestones:**
  - Admin layout and navigation (legacy admin look, see THEME.md).
  - DB browser/editor for companies, brands, ownership, products, stores and prices: provenance panel, and edits recorded as `manual` provenance.
  - Bulk import: CSV/JSON upload → preview → validation report → dry run → idempotent commit.
  - Ingestion runs list and detail (rows, errors, raw object links).
  - Match and ownership review queue.
  - Quality dashboard: rows per source, match rate, stale prices, unscored companies, unresolved brands, DB/storage usage against budget.
  - 🟡 Triggering pipeline runs from the admin portal needs a GitHub token held server-side (an edge function secret). The owner approves the token's scope.

## Phase 6 — Scheduling and operations (outline)

**Exit:** scheduled runs work on GitHub Actions for a full week with no manual steps. Failures open an issue, and budget alarms work.

- [ ] **P6.0 Refine Phase 6 into session-sized tasks.**
- **Milestones:**
  - Cron workflows per source with `workflow_dispatch`, concurrency groups, and `actions/cache` for the HTTP cache.
  - Supabase keep-alive.
  - Freshness policy: per-source refresh intervals and stale-price thresholds.
  - Raw-retention cleanup job.
  - A budget monitor (DB size, storage size, OpenRouter spend) that warns at the thresholds.
  - Failure notification by opening a GitHub issue.

## Phase 7 — AI enrichment: scores and articles (outline)

**Exit:** a batch of 10 companies is scored with citations and confidence. All scores land in the review queue, approved scores show in the app, and cost per company is logged.

- [ ] **P7.0 Refine Phase 7 into session-sized tasks.**
- **Milestones:**
  - The single OpenRouter module (D-009): configurable model, zod-validated output, a token and cost log, a mock mode, a spend guard.
  - 🟡 Rubric v1 (`docs/catalog/RUBRIC.md`): 5 categories × Good/Mixed/Poor, 0–100 and letter grade (D-004), evidence requirements, confidence levels. The owner approves the rubric before scoring runs.
  - Company scoring job → review queue (model, rubric version, sources, confidence).
  - Article collection: GDELT/RSS plus Wikipedia, relevance and good/bad tagging → review queue.
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
  - 🟡 Whether prices read from users' receipts feed the shared price catalog (privacy and consent wording), per D-002.

## Phase 9 — Ethical alternatives (outline)

**Exit:** for a test set of receipts, alternatives appear at the same store, are more ethical by the rubric, and cost the same or less per unit (or are flagged when they don't). Evaluated on a labelled set.

- [ ] **P9.0 Refine Phase 9 into session-sized tasks.**
- **Milestones:**
  - Define "similar": same taxonomy leaf and a size band compared by unit price.
  - Define "more ethical": a minimum score gap, and only published scores.
  - Same-store default. If the store has no data, fall back to the same chain, then other nearby chains, clearly labelled (D-011).
  - Precomputed alternatives table refreshed by the pipeline.
  - UI on the product, receipt-results and history screens.

## Phase 10 — Release hardening (outline)

- [ ] **P10.0 Refine Phase 10 into session-sized tasks.**
- **Milestones:**
  - 🟡 Web hosting choice (free: EAS Hosting, Cloudflare Pages or Netlify).
  - 🟡 Android distribution (an EAS free build or a local Gradle APK; the Play Store costs $25, so flag it).
  - Privacy policy and data deletion.
  - Accessibility pass, performance pass, full e2e run, security advisors clean (`get_advisors`).
