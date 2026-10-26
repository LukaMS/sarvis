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

## D-005 Admin portal lives in the same Expo app as web-only routes — Proposed (confirm in P0.12)
`/admin/*` routes in the Expo Router app, rendered only on web (native redirects away), gated by `profiles.role = 'admin'`. Authorization is enforced in the database (RLS with an `is_admin()` helper) and in edge functions, never by hiding UI. No service-role key in any client (the legacy admin SPA used one in the browser).
**Why:** one codebase, shared types, theme and Supabase client, one dev server and one web deploy. Data-heavy tables can use web-only components. Alternative considered: a separate Vite SPA, which is better for heavy data grids but doubles the tooling, and the legacy split is part of what made it messy.
**Risk:** admin code ships in the web bundle. That's acceptable because security lives in RLS; lazy-load the admin routes to keep the user bundle small.

## D-006 AI scores are never auto-published until the owner sets a rule — Proposed
Every AI score goes to the admin review queue. Unreviewed companies show "Not yet rated". An auto-publish rule (e.g. high confidence + 2 independent sources) is a 🟡 decision in Phase 7.

## D-007 Repo layout: npm workspaces — Proposed (confirm in P0.12)
`app/` (Expo user app + admin routes), `pipeline/` (Node + TS jobs run by Actions), `packages/core/` (pure TS: zod schemas, validation, units, matching), `supabase/` (migrations, edge functions).
**Why:** normalization and matching logic is shared by the pipeline, edge functions and the app; a pure package keeps it testable.

## D-008 One product table — Proposed (confirm in P0.11)
Legacy split products into an "ethical" `products` table and a grocery `catalog_products` table. The rebuild has one `products` table. Retailer listings and prices hang off it, and ownership goes product → brand → company through mapping tables.
**Why:** the split duplicated identity and made matching ambiguous.

## D-009 One OpenRouter module, runtime-agnostic — Proposed (confirm in P0.12)
`supabase/functions/_shared/ai/` written with `fetch` only, so both Deno edge functions (receipt parsing) and the Node pipeline (batch scoring) import the same code. Configurable model with a cheap default, zod-validated output, a per-call token and cost log table, and a mock mode for tests. The key exists only in edge function secrets and Actions secrets.

## D-010 Raw data storage and retention — Proposed (finalise in P0.11)
Raw responses are gzipped into a private Supabase Storage bucket, keyed `source/run_id/…`, with a content hash. Retention: the last 3 runs per source, 30 days at most. Bulk dumps (OFF, Wikidata) are processed on the Actions runner and never stored in Supabase; we store their URL, date and hash so a run can be reproduced. Total storage budget ≤ 700 MB.
**Why:** 1 GB free storage limit.

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
