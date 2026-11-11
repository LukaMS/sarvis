# Sarvis

Sarvis helps people track their grocery spending and see how ethical the companies behind their purchases are. Users scan receipts, or search for and add products by hand. The app matches each item to a product, brand and parent company, shows an ethical rating, saves the user's history, and links to articles (good and bad) about those companies. A planned feature recommends ethical alternatives at a similar or lower price.

An admin portal manages the data: direct database access, bulk product import, AI-assisted company scoring, and scrapers that build a catalog of products and prices at local grocery stores.

**The catalog is the core of the product.** Companies, brands, products and store prices need to be accurate, and there needs to be a lot of them. When trade-offs come up, data quality and coverage win.

## Folders

- **This folder** holds the rebuild. All new work goes here.
- **The legacy app** lives at the path in `.claude/settings.json` (`additionalDirectories`). It is reference only. You can read it and run it for comparisons, but never edit it. Its old names ("ethical-app", "Conscious Curator") become "Sarvis" in the rebuild.

## Working from the plan

Usage is limited, so work happens in small, resumable sessions.

| File | Purpose |
|---|---|
| `docs/PLAN.md` | Phased task list. The single source of truth for what comes next. |
| `docs/PROGRESS.md` | Session log, newest entry first. Read the top entry at the start of every session. |
| `docs/DECISIONS.md` | Short records of architecture and data decisions and the reasons for them. |
| `docs/legacy/` | Spec, theme and schema of the legacy app. |
| `docs/baseline/` | Screenshots of the legacy app, used as visual targets. |
| `docs/catalog/` | Catalog sources, research and pipeline notes. |

Rules:

- Do one task per session unless I say otherwise. `/next` starts a task and `/handoff` saves state if a session ends mid-task.
- Don't do work that isn't in the plan. If you find something that's needed, add it to `PLAN.md` as a new task and tell me.
- A task is done only when its verification passes. Then tick it in `PLAN.md`, add an entry to `PROGRESS.md`, and commit.
- If a decision is mine to make (cost, legal, product direction), stop and ask instead of guessing.
- Keep chat output short. Put detail in the docs files, not in the conversation.

## Environment

- **OS:** Windows. Use forward slashes in code paths, and keep npm scripts cross-platform (no `rm -rf`; use `rimraf` or Node).
- **Mobile testing:** Android emulator only. There is no iOS simulator on Windows.
- **Budget:** free tiers only.
  - Supabase free tier: 500 MB database, 1 GB storage, and the project pauses after a week without activity.
  - GitHub Actions: free minutes only.
  - OpenRouter: has a hard spend cap.
  - Flag anything that would cost money before adding it.

## Commands

Fill these in during Phase 1 and keep them current.

| Task | Command |
|---|---|
| Install | `npm install` (from the repo root; installs all workspaces). On a clean checkout or in CI: `npm ci`. Copy `.env.example` to `.env` and fill it in before running the app or e2e. |
| Start web | `npm run web` (Expo web at http://localhost:8081). The app scripts load the repo-root `.env` (Expo alone only reads `app/.env`). |
| Start Android | `npm run android` (emulator must be running; check with `adb devices`; opens in Expo Go). With Metro already running: `adb reverse tcp:8081 tcp:8081`, then `adb shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081/--/<route> host.exp.exponent` (e.g. `/--/dev/gallery`). The older `exp://10.0.2.2:8081` URL can reopen a stale cached bundle. |
| Typecheck / lint | `npm run typecheck` / `npm run lint` (format: `npm run format`, check only: `npm run format:check`) |
| Unit tests | `npm test` (Vitest, all workspaces) |
| E2E (web) | `npm run e2e` (Playwright, Chromium, 390 × 844; starts Expo web on :8081 or reuses a running one). Needs `.env` with the dev service-role key: global setup creates the e2e test users (one admin) and signs one in. Runs 4 workers. After adding or removing a route file, restart Metro: a running server can 404 or show "Unmatched Route" for it. Report: `npx playwright show-report` |
| Create a dev test user | `npm run dev:test-user -- --email <email> --password <8+ chars> [--name <name>] [--role user\|admin]` (confirmed user on the **dev** project only; idempotent; `--role admin` opens `/admin` on web) |
| Password-reset link for a dev user | `npm run dev:recovery-link -- --email <email> [--redirect <url>]` (dev project only; prints the link the reset email would contain, no email sent; default redirect `http://localhost:8081/`, Expo Go: `exp://127.0.0.1:8081/--/`) |
| Generate Supabase types | `supabase-dev` MCP `generate_typescript_types` → save verbatim to `packages/core/src/db/database.types.ts` (`npm run db:types` prints the steps; see `supabase/README.md`) |
| Check pipeline DB access | `npm run smoke:db --workspace @sarvis/pipeline` (service role on the **dev** project; prints the `sources` row count only) |
| Check the raw store | `npm run check:raw --workspace @sarvis/pipeline` (dev project; stores a 3-record fixture under a throwaway run, reads it back, deletes it; leaves nothing behind) |
| Check the SQL GTIN helpers | `npm run check:gtin --workspace @sarvis/pipeline` (dev project, read-only; runs `packages/core/src/gtin.vectors.json` through SQL and compares SQL with TS on 500 8-digit codes) |
| Check the writers | `npm run check:writers --workspace @sarvis/pipeline` (dev project; writes 2 brands, 5 products and 3 prices twice, plus the other writers, under the `fixture` source, checks the counts and provenance, then deletes everything) |
| Check the legacy takeover | `npm run check:takeover --workspace @sarvis/pipeline` (dev project, read-only; after an OFF run that saw them, the 3 legacy products with an OFF GTIN read as OFF's as `anon` with no legacy features, steps or certifications, and the other legacy products stay hidden) |
| Check the OFF delta duplicate rule | `npm run check:off-delta --workspace @sarvis/pipeline` (dev project, read-only, sends nothing to OFF; replays the stored extracts of the completed OFF delta runs through the delta path and checks that every discontinued no-GTIN OFF row is dropped and no active one is; run it after a full run; ~45 s) |
| Check the size parser on the catalog | `npm run check:units --workspace @sarvis/pipeline` (dev project, read-only; runs `parseSize` on every distinct `products.quantity_text` and prints the share `ok`, the reasons for the rest, and strings that differ from the stored D-057 status; `CHECK_UNITS_SHOW=N` lists N of each, default 20; ~5 s; fails if a result breaks the product schema) |
| Taxonomy seed | Edit `pipeline/src/taxonomy/tree.ts`, then `npm run taxonomy:sql --workspace @sarvis/pipeline` prints the seed migration (apply on dev with the `supabase-dev` MCP, save it under its version, point `TAXONOMY_MIGRATION` in `sql.ts` at it; `npm test` fails if the file and the generator differ). See `docs/catalog/TAXONOMY.md` |
| Check the taxonomy | `npm run check:taxonomy --workspace @sarvis/pipeline` (dev project, read-only; compares `categories` and `category_mappings` with the tree, checks anon can read them and every StatCan label maps, then reads the latest full OFF extract back and prints the share of categorised products mapped, by level and aisle; fails under 95%; ~10 s) |
| Run a scraper on a sample | `npm run pipeline -- run <source> --sample N` (dev project; add `--dry-run` to fetch, parse and validate without writing catalog rows or raw files; without `--sample`, `--mode full\|delta`). `npm run pipeline -- --help` lists the sources. Exit code 0 completed, 2 completed with errors, 1 failed, 130 cancelled |
| Run a derived job | `npm run pipeline -- job <name> [--sample N] [--dry-run]` (dev project; reads our own tables, only the rows that still need work, in id order, so an interrupted run resumes; one `ingestion_runs` row under the `sarvis-derived` source; same exit codes as `run`; no `--mode`). Jobs: `fixture` (sizes the `fixture` source's unparsed products; harmless on dev) |
| OFF daily delta | `npm run pipeline -- run off --mode delta` (dev project; imports the delta files a completed delta run hasn't stored yet, so a re-run fetches only the index; never deactivates) |
| OFF scheduled refresh | `npm run pipeline -- run off --mode auto` (dev project; delta while the last completed full or delta run is at most 13 days old, else full; logs the mode it chose). On GitHub: the `Pipeline OFF` workflow runs it daily at 09:17 UTC, or by hand with `gh workflow run pipeline-off.yml` (needs the `SUPABASE_DEV_URL`, `SUPABASE_DEV_SERVICE_ROLE_KEY` and `PIPELINE_CONTACT_EMAIL` Actions secrets); a failure opens a `pipeline-failure` issue |
| Dev-DB checks on GitHub | The `Dev DB checks` workflow runs `check:gtin`, `check:writers`, the pipeline e2e and the Playwright e2e on every push to `main` (~4 min), or by hand on any branch with `gh workflow run dev-db-checks.yml --ref <branch>`. Needs `SUPABASE_DEV_URL`, `SUPABASE_DEV_ANON_KEY` and `SUPABASE_DEV_SERVICE_ROLE_KEY`; fails at once if one is missing. Shares the `dev-db` queue with `Pipeline OFF` |
| Re-import legacy content | `npm run pipeline -- run legacy-import` (dev project; maps `docs/legacy/data/*.json` to pending facts with review-queue rows; idempotent, so a re-run inserts nothing) |
| StatCan reference prices | `npm run pipeline -- run statcan-18100245 --mode full` (dev project; 12 WDS requests at 0.5 req/s; Canada + Ontario, every month since 2017; a re-run within 12 h is served from the HTTP cache and writes nothing) |
| Wikidata ownership sample | `npm run pipeline -- run wikidata --sample N` (dev project; N counts matched brand items, and each one's owner chain is walked up to 5 hops; reads the OFF brand strings via `public.off_brand_strings()`; SPARQL one query at a time, plus a cached class lookup per match batch, so ~3–4 min for 100; a re-run within 12 h is served from the HTTP cache) |
| Wikipedia summaries sample | `npm run pipeline -- run wikipedia --sample N` (dev project; N counts companies with a `wikipedia_title`, by slug; revision checks of 50 titles, then extracts of 20 for pages that changed or have no document; a re-run with nothing changed fetches only the checks and stores no raw file) |
| SEC EDGAR Exhibit 21 sample | `npm run pipeline -- run sec-edgar --sample N` (dev project; N counts 10-K filings, by company slug; needs `PIPELINE_CONTACT_EMAIL`, sent as `Sarvis/<version> (<email>)` because SEC refuses a URL in the User-Agent; 2–3 requests per company; an exhibit a completed run of the same mode stored isn't fetched again, so a re-run writes nothing) |
| Corporations Canada identity check | `npm run pipeline -- run corp-canada --mode full` (dev project; `--sample N` keeps the first N matches by slug; reads the two active CSVs, 113 MB, through the dump cache at 1 request per 20 s, so an unchanged file costs one conditional request; stores only matches; a re-run updates nothing) |
| Publish the ODbL extract | `npm run pipeline -- export odbl` (dev project; OFF products and Open Prices stores and prices as CSV.gz plus a README, to the public `public-exports` bucket under `odbl/<UTC time>/`; keeps the latest 2 exports and deletes older ones; exit 0 or 1) |
| Pipeline e2e (run twice) | `npm run e2e --workspace @sarvis/pipeline` (dev project; runs `pipeline run fixture` twice through a local HTTP server, checks run 2 inserts nothing, provenance, raw files and validation failures, then deletes everything; also seeds 12 fixture products and runs `job fixture` dry, `--sample 4`, then full twice, checking run 2 updates nothing; skipped in `npm test` without the dev key) |

## Verifying your work

Never report a UI change as done from reading the code alone.

- **Web:** start the dev server and open the page with the Playwright MCP. Take a screenshot and check for console errors. Use the chrome-devtools MCP for console and network detail.
- **Android:** confirm the emulator is running and the app is open, then screenshot and tap through the changed flow with the mobile MCP.
- **Rebuilt screens:** compare against `docs/baseline/`. The look must match the legacy theme in `docs/legacy/THEME.md` unless the plan says otherwise.
- **Data and scraper work:** run against a small sample. Report row counts, show a few example records, and run the validation checks. Report failures honestly.
- Add a `testID` to every interactive element so the tools can find it.
- Save working screenshots to `.screenshots/` (gitignored). Only baselines go in `docs/`.

## Conventions

- **App:** Expo SDK 54, Expo Router, TypeScript in strict mode. Use one codebase for the mobile and web user app unless `DECISIONS.md` says otherwise.
- **Styling:** reuse the legacy colour theme and component look. Rebuild cleanly; don't redesign.
- **Supabase:**
  - Every schema change is a SQL migration file in `supabase/migrations/`.
  - Apply migrations only to the dev project (`supabase-dev` MCP). Never write to the legacy project.
  - Enable RLS on every table.
  - Regenerate TypeScript types after each schema change.
- **Keys:** companies and brands use slugs as stable, human-readable keys.
- **OpenRouter:**
  - All calls go through one server-side module. The API key never reaches the client.
  - Use a cheap model by default and make the model configurable.
  - Validate structured JSON output with zod.
  - Log tokens and cost per call.
  - Provide a mock mode for tests.
- **Secrets:** keep them in `.env` (gitignored) and keep `.env.example` up to date. Never print secret values.
- **Code changes:** extend existing modules instead of creating duplicate services. Prefer small, targeted changes.

## Catalog and data rules

- **Provenance:** every fact (product, price, ownership link, score, article) stores its source URL, its `fetched_at` time, and the method that produced it: scraper name and version, AI model and rubric version, or manual entry.
- **Raw data:** save raw scraper responses (compressed) to storage before parsing, so parsers can be re-run without fetching again.
- **Imports:** use idempotent upserts keyed on stable IDs (UPC/GTIN, store SKU, slug). Running an import twice must not create duplicates.
- **Ownership chain:** products link to brands, and brands link to companies and parent companies. Ownership is its own mapping, not a field on the product.
- **AI scores:**
  - Every score must cite its sources and include a confidence value.
  - Record the model and rubric version with each score.
  - New scores go into a review queue in the admin portal. Only reviewed scores (or ones passing the rule set in the plan) are shown to users.
- **Scrapers:**
  - Respect robots.txt and rate limits: at most about 1 request per second per host, with backoff on errors. Cache aggressively.
  - Record each source's access method and terms in `docs/catalog/SOURCES.md`.
  - Ask me before using a source whose terms prohibit automated access.
- **Validation before writing:** check required fields, price sanity, unit and size normalization, and duplicates.

## Don'ts

- Don't edit the legacy folder.
- Don't give any tool write access to production data.
- Don't add paid services, or new dependencies without a reason in `DECISIONS.md`.
- Don't mark a task done without running its verification.
