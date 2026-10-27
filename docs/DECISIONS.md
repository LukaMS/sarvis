# Decisions

Short records of architecture and data decisions. Newest at the bottom. Status is **Accepted** (owner-confirmed or final), **Proposed** (my default; confirm or amend in the named task), or **Open** (owner must decide).

---

## D-001 Legacy reference location — Accepted (2026-10-26)
The path configured in `.claude/settings.json` (`Coding Projects/Ethical-App`) held only an empty folder skeleton. The real legacy app is `C:/Users/lukam/Coding Projects/MobileDev/Ethical-App` (package `ethical-app`, Expo SDK 54, plus `admin/` Vite SPA and `catalog-worker/`). An earlier rebuild attempt at `MobileDev/Sarvis` is **ignored**. `settings.json` now points at `MobileDev/Ethical-App`.
**Why:** owner's choice; one reference avoids conflicting specs.

## D-002 Price sourcing: permitted sources + receipts, no bot-protection workarounds — Accepted (2026-10-26)
Store prices come only from sources whose terms allow automated access (e.g. Open Prices), plus prices read from users' scanned receipts. The legacy approach of attaching Playwright to a real Chrome session to get past Akamai on Fortinos is dropped. Each retailer that blocks or forbids automation is listed in `docs/catalog/SOURCES.md` for the owner to decide individually.
**Why:** legal and ToS risk. Workarounds for bot protection break easily and can get the owner's IP blocked.
**Open follow-up:** consent and privacy wording before receipt prices feed the shared catalog (Phase 8).

## D-003 Scheduled jobs run on GitHub Actions in a public repo — Accepted (2026-10-26)
Scrapers, imports, matching and AI batch jobs run as scheduled GitHub Actions workflows. The repo will be public, which makes Actions minutes unlimited.
**Why:** free, always available, supports Playwright and long runs, unlike Supabase edge functions (~150 s, no browser).
**Implications:** secrets only in Actions secrets; never commit `.env`, scraped data or user data; logs must not print user data. The daily run doubles as a Supabase keep-alive.

## D-004 Rating model kept from legacy — Accepted (2026-10-26)
Five categories (environment, labour, animal welfare, politics & tax, human rights), each rated Good/Mixed/Poor, rolled up into a 0–100 score shown as a letter grade (A+…F, legacy `scoreToGrade` thresholds). New: every category score carries cited sources, a confidence value, the model and rubric version.
**Why:** owner likes it; the UI already expresses it.

## D-005 Admin portal lives in the same Expo app as web-only routes — Accepted (P0.12)
`/admin/*` routes in the Expo Router app, rendered only on web (native redirects away), gated by `profiles.role = 'admin'`. Authorization is enforced in the database (RLS with an `is_admin()` helper) and in edge functions, never by hiding UI. No service-role key in any client (the legacy admin SPA used one in the browser).
**Why:** one codebase, shared types, theme and Supabase client, one dev server and one web deploy. Data-heavy tables can use web-only components. Alternative considered: a separate Vite SPA, which is better for heavy data grids but doubles the tooling, and the legacy split is part of what made it messy.
**Risk:** admin code ships in the web bundle. That's acceptable because security lives in RLS; lazy-load the admin routes to keep the user bundle small.
**Confirmed in P0.12:**
- The legacy admin's 19 pages (P0.8 baseline) are tables, forms and modals. They can be built with web-only components inside the `(admin)` group.
- The audit found that every legacy admin write depended on a browser-held service-role key (SPEC "Backend and admin: issues" #1), so server-side checks are needed whatever the hosting.
- P1.12 proves the gate, and P1.12 verification checks that the admin code lands in a separate lazy chunk.

## D-006 AI scores are never auto-published until the owner sets a rule — Proposed
Every AI score goes to the admin review queue. Unreviewed companies show "Not yet rated". An auto-publish rule (e.g. high confidence + 2 independent sources) is a 🟡 decision in Phase 7.

## D-007 Repo layout: npm workspaces — Accepted (P0.12)
`app/` (Expo user app + admin routes), `pipeline/` (Node + TS jobs run by Actions), `packages/core/` (pure TS: zod schemas, validation, units, matching), `supabase/` (migrations, edge functions).
**Why:** normalization and matching logic is shared by the pipeline, edge functions and the app; a pure package keeps it testable.
**Confirmed in P0.12:** the audit added more shared code (GTIN rules, unit parser, safeguards, change detection; CATALOG_REVIEW §4). Expo SDK 54's Metro resolves npm workspaces, and P1.2 verifies it by importing from `packages/core`. Generated DB types live in `packages/core/src/db/` so the app and pipeline share them (P1.5).

## D-008 One product table — Accepted (P0.11; schema in `docs/catalog/DATA_MODEL.md` §3.3)
Legacy split products into an "ethical" `products` table and a grocery `catalog_products` table. The rebuild has one `products` table. Retailer listings and prices hang off it, and ownership goes product → brand → company through mapping tables.
**Why:** the split duplicated identity and made matching ambiguous.

## D-009 One OpenRouter module, runtime-agnostic — Accepted with amendments (P0.12)
`supabase/functions/_shared/ai/` written with `fetch` only, so both Deno edge functions (receipt parsing) and the Node pipeline (batch scoring) import the same code. Configurable model with a cheap default, zod-validated output, a per-call token and cost log table, and a mock mode for tests. The key exists only in edge function secrets and Actions secrets.
**Amendments (P0.12):**
- The module must not touch runtime globals (`Deno.env`, `process.env`). Config (key, model, budget) is passed in by the caller.
- Bare imports such as `zod` resolve through an import map in `supabase/functions/deno.json` on Deno and through npm on Node.
- Calls are logged to `ai_calls` (DATA_MODEL §3.8); full responses go to Storage via `raw_objects`.
- Phase 7's first task is a spike proving one file runs in both runtimes. If it fails, fall back to a copy-free build step and record a new decision.

## D-010 Raw data storage and retention — Accepted (finalised in P0.11; detail in `docs/catalog/DATA_MODEL.md` §5)
- **Where:** raw responses are gzipped into the private `raw` bucket as `raw/{source_key}/{run_id}/{seq}.json.gz`. Each file has a `raw_objects` row (sha256, size, request URL) linked from the facts parsed from it.
- **Retention:** the last 3 runs per source and 30 days at most, with the exceptions listed in DATA_MODEL §5 (SEC filings, scoring responses).
- **Bulk dumps (OFF, Wikidata):** never stored. The run records the dump URL, date and sha256. **Amended:** for OFF we also store the *filtered Canada extract* (only the fields we parse, ≈ 20 MB gz, last 3), so parsers can re-run without the multi-GB download.
- **Not stored at all:** product images and logos (hotlinked with attribution).
- **Budget:** storage ≤ 700 MB, estimated ≈ 289 MB (`docs/catalog/BUDGET.md`).

**Why:** the 1 GB free storage limit, and CLAUDE.md's "re-run parsers without fetching again".

## D-011 Alternatives default to the same store — Accepted (owner brief), fallback Proposed
Alternatives are products at the store the user shopped at. If that store has no data for the category, fall back to the same chain, then other nearby chains, clearly labelled as "at another store".
**Why:** a swap is only realistic where the user already shops; the fallback avoids empty results while store coverage is thin.

## D-012 Screenshots and fixtures carry no personal data — Accepted (P0.6)
The repo is public (D-003). Screenshots in `docs/baseline/` and `.screenshots/`, test fixtures, and logs must not show real names, emails or account data. Real-account captures replace them in the page DOM before capture (name → "Alex", email → `you@example.com`), with a leak check. Tool working folders that can hold typed input (`.playwright-mcp/`) are gitignored and deleted after use. Credentials are never written to files.
**Why:** baselines need a real signed-in session, but anything committed to a public repo is permanent.

## D-013 Catalog source choices — Accepted (2026-10-26, owner answers to SOURCES.md §7)
- **D1:** Accept ODbL share-alike for Open Food Facts and Open Prices. Keep OFF-derived tables separable, publish an ODbL extract, and attribute in the app.
- **D2:** Avoid every Ontario grocer website (Loblaw banners, Sobeys/Voilà/FreshCo/Foodland, Metro/Food Basics, Longo's, Farm Boy, Giant Tiger), and Walmart.ca and Costco.ca.
- **D3:** No Flipp (or Reebee) scraping, and no data partnership for now.
- **D4:** Publisher RSS is in use with a provisional list chosen by me (see SOURCES.md S24). The owner narrows it later. Each feed's terms are checked before it's added.
- **D5:** Skip UPCitemdb.
- **D6:** B Corp, Fairtrade and KnowTheChain evidence is entered manually per company with a citation URL. No bulk import.
- **D7:** Users' receipts are the main source of store prices. Consenting users' prices may be contributed to Open Prices. Consent wording is approved in Phase 8.

**Why:** grocer terms limit use to personal, non-commercial purposes and several sites block automation (D-002). Open sources cover products and ownership well.
**Consequence:** store-price coverage depends on receipt volume. Phase 3 has no retailer tasks.
**Still open:** the pipeline User-Agent contact, and whether Sarvis is commercial.

## D-014 Catalog schema conventions — Accepted (P0.11)
- **Ids:** uuid ids for entities. `bigint` identity for high-volume rows (prices, events, logs, candidates, queue, receipt lines).
- **Stable keys:** every stable natural key is unique, and imports upsert on those keys.
- **Provenance:** every fact carries `source_id`, `source_url`, `fetched_at`, `method`, `method_version`, `ingestion_run_id` and `raw_object_id`. `source_url` may be null only when `sources.url_template` + `external_id` rebuilds it exactly, and a view exposes it.
- **Product identity:** the primary GTIN (normalized to GTIN-14) lives on `products`. `product_identifiers` holds only secondary codes.
- **Ownership:** a product links to a brand only. The company comes from `brand_ownership` → `company_ownership` (CLAUDE.md ownership rule). There's no company column on products.
- **Chains:** the operating chain is a `companies` row referenced by `banners`, so there's no separate chains table. Banner-specific names and receipt abbreviations are `store_listings`, replacing legacy `product_aliases`.
- **Receipt prices:** they reach the shared catalog only as weekly aggregates (`price_points_weekly`, with a k-anonymity floor) of consenting users' lines. They're never copied per line.
- **Review:** reviewable facts carry `review_status`, and RLS shows `approved` only. `review_queue` tracks the work.
- **Evidence:** citations and articles share one `documents` table. Full text is never stored.

**Why:** these keep the catalog at ≈ 294 MB against a 350 MB budget (`docs/catalog/BUDGET.md`; the first pass was ≈ 425 MB), and they satisfy every CLAUDE.md catalog rule (DATA_MODEL §6, 27/27).

## D-015 Phase 1 and pipeline owner answers — Accepted (2026-10-27)
- **Repo:** public `LukaMS/sarvis` (D-003). `gh` is installed and logged in. Claude creates the repo in P1.4 and still asks before the first push.
- **Test users (P1.10):** option (a). The **dev** project's service-role key goes in `.env` as `SUPABASE_DEV_SERVICE_ROLE_KEY`, for a dev-only script that creates confirmed test users. Email confirmation stays on.
- **Fonts (P1.6):** system fonts, as in legacy. Epilogue and Public Sans are not loaded.
- **Sign-in providers (P1.14):** email only for now. P1.14 is skipped.
- **Pipeline User-Agent contact:** the repo URL only, e.g. `Sarvis/<version> (+https://github.com/LukaMS/sarvis)`, with no email. If a source rejects that (SEC EDGAR asks for an email), stop and ask the owner.
- **Commercial status:** non-commercial for now and probably for a while, but it may become commercial. Prefer sources whose licences allow commercial use. When a source is non-commercial-only, flag it and keep its data separable so it can be dropped later.
**Why:** owner answers to the open 🟡 list from P0.12.

## D-016 Root tooling and dev dependencies — Accepted (P1.1)
Root dev dependencies only. The workspaces have no runtime dependencies yet.

| Package | Version | Reason |
|---|---|---|
| `typescript` | ~5.9.3 | Strict type checking. Pinned to 5.9 because Expo SDK 54 expects ~5.9 and typescript-eslint supports < 6.1. TS 7 (the Go port) isn't supported by either yet. |
| `eslint` + `@eslint/js` | ^9.39 | Linting (flat config). npm marks 9 as end-of-life, but `eslint-plugin-react` and `eslint-plugin-import`, which `eslint-config-expo` needs in P1.2, only support ESLint ≤ 9. Move to 10 when they do. |
| `typescript-eslint` | ^8.72 | TypeScript rules and parser for ESLint. |
| `eslint-config-prettier` | ^10.1 | Turns off ESLint rules that clash with Prettier. |
| `globals` | ^17.13 | Node globals for the flat config. |
| `prettier` | ^3.9 | One code format. `.prettierignore` skips Markdown, `docs/` and `.claude/`, so hand-written docs aren't reflowed. |
| `vitest` | ^5.0 | Unit tests. It runs TS directly with no build step, and the same runner works for the app later. |
| `rimraf` | ^6.1 | Cross-platform `clean` script (CLAUDE.md: no `rm -rf`). |
| `@types/node` | ^22.20 | Node types for `pipeline/` (Node 22, as in CI). |

- **Vitest projects:** the plan named `vitest.workspace.ts`, but Vitest 4+ removed workspace files. The root `vitest.config.ts` uses `test.projects`, and each package has its own `vitest.config.ts` (`defineProject`).
- **Typecheck:** each workspace has `tsc -p tsconfig.json` (`noEmit`, extending `tsconfig.base.json`), and the root script runs them all with `--workspaces --if-present`.
- **ESM:** the root and workspace packages are `"type": "module"`. `packages/core` is consumed as source (`main: src/index.ts`), with no build step.

## D-017 Expo app setup — Accepted (P1.2)
- **Template:** `create-expo-app` with `expo-template-blank-typescript@sdk-54`, plus Expo Router added with `npx expo install`, instead of the default tabs template. The tabs template ships example screens, themes and components that would have to be deleted, and the shell is rebuilt to the baseline in P1.9 anyway. Routes live in `app/src/app/`.
- **Removed from the template:** `app/AGENTS.md`, which duplicates CLAUDE.md and conflicts with it (`npx expo lint` vs the root scripts), and `app/.claude/settings.json`, which enabled the `expo@claude-plugins-official` plugin. Turning on a Claude plugin is the owner's call.
- **Runtime dependencies** (all SDK 54 versions picked by `expo install`): `expo-router` with its peers `react-native-safe-area-context`, `react-native-screens`, `expo-linking` and `expo-constants`; `expo-status-bar`; and `react-dom` plus `react-native-web` for web. `@sarvis/core` is used as source through the workspace.
- **Dev dependency:** `eslint-config-expo` ~10.0.0 (the SDK 54 version; a bare `expo install -- -D` picked 58.x, so it's pinned by hand). It adds React, hooks, import and Expo rules. The root `eslint.config.mjs` scopes every block to `app/**`, so they don't apply to Node packages.
- **tsconfig:** `app/tsconfig.json` extends `["../tsconfig.base.json", "expo/tsconfig.base"]`, and Expo's settings (lib, module, jsx) win. `strict` and `noUncheckedIndexedAccess` are set again explicitly.
- **Metro:** no `metro.config.js` is needed. SDK 54 resolves npm workspaces out of the box, as the `@sarvis/core` import proves.

## D-018 Web e2e harness — Accepted (P1.3)
- **Dependency:** `@playwright/test` ^1.64.1 (dev, root). It runs web e2e against Expo web and uses the same engine as the Playwright MCP used for manual checks. Only Chromium is installed and used.
- **Config:** `playwright.config.ts` at the root, tests in `e2e/`. There's one project, `mobile-web`, at 390 × 844 (the baseline size). `webServer` runs `npm run web` on :8081 and reuses a running server locally (never in CI). Traces are kept on failure.
- **Smoke test conventions:** tests find elements by `testID` (`getByTestId`) and fail on any console error.
- **Typecheck:** `e2e/tsconfig.json` covers `e2e/` and `playwright.config.ts`, and the root `typecheck` script runs it after the workspaces. Vitest doesn't pick up `e2e/` (its projects are `packages/core` and `pipeline`).

## D-019 GitHub repo and CI — Accepted (P1.4)
- **Repo:** https://github.com/LukaMS/sarvis, public (D-003), default branch `main` (the local `master` was renamed).
- **Commit identity:** before the first push, all local commits were rewritten from the owner's Gmail address to the GitHub noreply address `13386597+LukaMS@users.noreply.github.com` (owner's choice). The rewrite changed only author and committer emails, and the tree was identical before and after. This repo's `git config user.email` is set to the noreply address.
- **CI:** `.github/workflows/ci.yml` runs on every push and PR: `actions/checkout@v7`, `actions/setup-node@v7` (Node 22, npm cache), `npm ci`, then typecheck, lint and test. `permissions: contents: read`, no secrets, a 15-minute timeout, and a concurrency group per ref that cancels superseded runs. E2E stays local in Phase 1.
- **Public by design:** `.mcp.json` (Supabase project refs, not keys) and `.claude/settings.json` (a local folder path) are in the public repo. No keys, tokens or personal emails were found in the history before the push.

## D-020 Base schema security pattern — Accepted (P1.5)
- **`private` schema for security-definer helpers:** `private.is_admin()` and `private.handle_new_user()` live in a schema the Data API doesn't expose. Only `authenticated` has `USAGE` on it and `EXECUTE` on `is_admin()`, which RLS policies need. Functions in `public` would be callable through `/rpc` and are flagged by the security advisor. Every later RLS policy uses `(select private.is_admin())`. The admin gate (P1.12) reads `profiles.role` for the signed-in user instead of calling an RPC.
- **Privileges first, then RLS:** `profiles` revokes everything from `anon` and `authenticated`, then grants `select`, plus `update` on only `display_name`, `share_prices_consent` and `consent_at`. Clients can't change `role`, `id` or the timestamps, so no guard trigger is needed. anon gets "permission denied" rather than 0 rows. Later tables follow the same pattern: explicit grants per role, with RLS on top.
- **One permissive policy per action** (`own or admin`) instead of separate own/admin policies, which avoids the performance advisor's "multiple permissive policies" warning. `auth.uid()` and `is_admin()` are wrapped in `(select …)` so they're evaluated once per query.
- **Migration file names** use the version that `apply_migration` records (`supabase/README.md`).
- **Types** come from the `supabase-dev` MCP and are saved verbatim (Prettier-ignored) to `packages/core/src/db/database.types.ts`. `@sarvis/core` re-exports `Database`, `Json`, `Tables`, `TablesInsert` and `TablesUpdate`. `role` is typed `string`, because it's a check constraint, not an enum.
