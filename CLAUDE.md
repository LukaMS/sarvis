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
| Run a scraper on a sample | TBD (Phase 2) |

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
