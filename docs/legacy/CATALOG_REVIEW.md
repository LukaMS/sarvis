# Legacy catalog and scraper review (P0.9)

A frank keep / adapt / drop review of the legacy catalog code: `LEGACY/catalog-worker/`, the three edge functions, `match_receipt_items`, and the admin catalog tools. Reviewed 2026-10-26 from source plus read-only queries against the legacy DB.

Verdicts:
- **Keep**: port it with only mechanical changes.
- **Adapt**: keep the idea or part of the code, change it as described.
- **Drop**: don't carry it over.

"Rebuild home" uses the D-007 layout: `pipeline/` (Node jobs on Actions), `packages/core/` (pure TS), `supabase/` (migrations, edge functions), `app/` (Expo app + `/admin` routes, D-005).

---

## 1. Summary

- **The worker's engineering is better than its results.** It has a clean provider interface, typed errors, zod validation, safeguards, change-only price history and 61 passing unit tests. But in practice it ingested **96 products from 2 categories at 1 store**, and each category stopped after its first page (48 + 48).
- **The Fortinos access method is a dead end.** 7 of 12 jobs failed on Akamai "Access Denied" or session errors. Only a real, human-launched Chrome attached over CDP got through. Dropped per D-002 (§6).
- **The catalog had no real product identity.** Fortinos listing tiles carry no UPC, so all 96 `catalog_products` rows are `retailer_specific` copies of the listing (0 UPCs, 0 matched). Nothing links them to the ethical `products` table, which holds only 13 rows. The catalog never reached the ethical side of the app.
- **There's no provenance or raw storage.** Rows record `source_checked_at` and a `scrape_job_id` that has no FK. No raw response is kept, so a parser fix means fetching again. There's no robots.txt check and no HTTP cache.
- **What's worth carrying over:**
  - the generic plumbing: errors, retry and backoff, the logger, env validation, the registry and shutdown handling;
  - the pure parsing helpers;
  - the safeguards;
  - the change-detection rules for prices;
  - the listing vs store-price split.

## 2. What the legacy catalog actually holds

Read-only counts from the legacy DB, 2026-10-26:

| Measure | Value |
|---|---|
| `catalog_products` | 96, all `product_match_status = retailer_specific` |
| …with a UPC | **0** |
| …with no brand | 36 (38%) |
| …with no parsed package quantity | 22 (23%) |
| `retailer_products` / `store_products` / `store_product_price_history` | 96 / 96 / 96 (one observation each) |
| `store_products` on sale | 4 |
| Retailer categories configured / used | 2 / 2 (Dairy and Eggs: 48, Fruits and Vegetables: 48) |
| `scrape_jobs` | 12: 3 completed, 7 failed, 2 cancelled |
| Failure reasons | all 7 are `authentication_or_session_error`: "Could not discover the build id" ×2, "Access Denied (Akamai)" ×5 |
| Ethical `products` | 13, all with a barcode; 0 `auto_barcode` rows; 0 `product_aliases` |
| `brands` | 49, all linked to a company |

**Pagination never ran beyond page 1.** Exactly 48 products per category (= `defaultPageSize`) were stored. The template calls `pageParam: "page"` "a best guess", and no captured page-2 request exists. The run stopped either because the guessed parameter was ignored (the loop-fingerprint guard) or because `hasNextPage` was false. Either way, real coverage was never tested.

## 3. Test and typecheck state

Run in `LEGACY/catalog-worker` (no network, no DB):

- `npx vitest run`: **8 files, 61 tests, 61 passed, 0 failed** (1.34 s).
  - Breakdown: safeguards 5, paths 6, errors 6, provider-registry 3, upsert 10, progress 5, pagination 9, normalizer 17.
- `npx tsc --noEmit`: **6 errors**, all in `src/providers/fortinos/client.ts`. Code inside `page.evaluate` uses `document` and `HTML*Element`, but `tsconfig` has no `dom` lib. The `npm run typecheck` script therefore fails, so it can't have been in any CI.
- **What's not tested:** `job-runner.ts`, `catalogue-repository.ts`, `client.ts`, `provider.ts` and every command. That means none of the I/O and none of the orchestration.
- The legacy repo's `git diff` hash was identical before and after the run (`6f0b037…`).

---

## 4. Keep / adapt / drop: `catalog-worker/src/` (48 files)

### Entry, config, infrastructure

| File | Verdict | Reason | Rebuild home |
|---|---|---|---|
| `index.ts` | Drop | Entry for a long-running poll loop on the developer's machine. Actions runs one job per workflow (D-003). | `pipeline/src/cli.ts` |
| `env.ts` | Adapt | A good pattern: zod-validated env, `emptyToUndefined`, readable errors. Drop the Fortinos/CDP variables and add per-source settings. | `pipeline/src/env.ts` |
| `logger.ts` | Keep | Single-line JSON plus recursive redaction of secret keys. Exactly what public Actions logs need (D-003). Add a rule that row data from user tables is never logged. | `pipeline/src/log.ts` |
| `supabase.ts` | Keep | Service-role client used only inside a trusted server process. That's fine for Actions jobs, provided the key is an Actions secret only. | `pipeline/src/db/client.ts` |
| `util/args.ts` | Adapt | A hand-rolled `--k=v` parser. Use the built-in `node:util` `parseArgs` instead (no new dependency). | `pipeline/src/cli.ts` |
| `util/async.ts` | Keep | `sleep` with abort, jitter, and `withRetry` with exponential backoff that never retries a cancel. Matches the CLAUDE.md backoff rule. | `pipeline/src/http/retry.ts` |

### Provider abstraction

| File | Verdict | Reason | Rebuild home |
|---|---|---|---|
| `providers/types.ts` | Adapt | The normalized product shape is a solid start: separate regular / sale / member / effective prices, nullable availability, sponsored flag. But it's retailer-only; OFF, Wikidata and Open Prices aren't paginated store listings. Change it into per-record-kind schemas (product, identifier, listing, price observation, ownership edge), each with provenance fields. Drop the unimplemented `ProductAlternative*` stubs (Phase 9 designs its own). | `packages/core/src/records/*.ts` |
| `providers/retailer-provider.ts` | Adapt | Fetch and normalize are coupled, so nothing is stored in between. The rebuild's source interface must be **fetch → store raw (gzip) → parse(raw) → validate → upsert**, so parsers can re-run from storage (CLAUDE.md "Raw data"). Keep the capability flags and `verifyStoreContext` ("prove the price is for the right store before writing"). | `pipeline/src/sources/source.ts` |
| `providers/schemas.ts` | Adapt | zod at the trust boundary, which is right. Tighten it: price upper bound / sanity, a currency enum, a URL check, ISO datetimes, and required provenance (`source_url`, `fetched_at`, `method`, `method_version`). | `packages/core/src/records/*.ts` |
| `providers/provider-registry.ts` | Keep | A small factory map keyed by source key, with no per-source conditionals in generic code. | `pipeline/src/sources/registry.ts` |
| `providers/register.ts` | Keep | One place to register sources. | `pipeline/src/sources/index.ts` |
| `providers/errors.ts` | Adapt | Keep the typed taxonomy and the `retryable` flag. `classifyError` sniffs substrings: any message containing "network" or "cancel" gets classified, and a 403 is a terminal session error. In the rebuild, a 403 or 429 from a source should **stop the source and alert**, never retry around a block. | `pipeline/src/errors.ts` |
| `providers/errors.test.ts` | Keep | Port with the module. | `pipeline/test/` |
| `providers/provider-registry.test.ts` | Keep | Port with the module. | `pipeline/test/` |

### Fortinos provider (all access code dropped per D-002)

| File | Verdict | Reason | Rebuild home |
|---|---|---|---|
| `providers/fortinos/provider.ts` | Drop | Glue for the Playwright session, store cookies and the build-id refresh. Exists only to drive the blocked site. | — |
| `providers/fortinos/client.ts` | Drop | Playwright context, CDP attach, in-page `fetch` "so TLS matches the Chrome session", Access-Denied detection. This is a bot-protection workaround (§6). It's also the only file that fails typecheck. | — |
| `providers/fortinos/browser.ts` | Drop | Persistent profile or CDP attach to the user's own Chrome; deletes "poisoned" profiles. | — |
| `providers/fortinos/category-discovery.ts` | Drop | A stub that returns `[]`. | — |
| `providers/fortinos/request-template.ts` | Drop | Builds Next.js `/_next/data/{buildId}/…` URLs from a JSON template. Undocumented internal route, and the build id rolls over on every deploy. | — |
| `providers/fortinos/request-context.ts` | Drop | Page-index translation for that template. | — |
| `providers/fortinos/schemas.ts` | Drop | The template schema. Its field paths are useful *only* as a note on Loblaw tile fields if the owner ever approves a Loblaw source (P0.10). | Note in `docs/catalog/SOURCES.md` if relevant |
| `providers/fortinos/paths.ts` | Drop | Dot-path getters so field names can live in JSON config. That indirection hides typos from the compiler. Typed per-source parsers plus zod are clearer. | — |
| `providers/fortinos/paths.test.ts` | Drop | Tests the dropped module. | — |
| `providers/fortinos/sanitize.ts` | Adapt | The header allow-list and body-secret redaction are the right idea for raw objects saved to storage and for logs. Generalise them. | `pipeline/src/raw/redact.ts` |
| `providers/fortinos/normalizer.ts` | Adapt | **Keep the pure helpers**: `cleanText`, `stripHtml`, `parsePrice`, `splitPackageSizing`, `parsePackageSize`, `computeEffectivePrice`, `mapAvailability` and `fingerprintMetadata`. Fix the gaps in §4.1. Drop `normalizeFortinosProduct`. | `packages/core/src/text.ts`, `units.ts`, `price.ts` |
| `providers/fortinos/normalizer.test.ts` | Adapt | 17 cases for those helpers. Port the generic ones as the seed of the P4 unit-parser test suite. | `packages/core/test/` |
| `providers/fortinos/pagination.ts` | Adapt | Keep `computeHasNextPage` (prefers totals, falls back to a short page) and `pageFingerprint` (loop guard): both generic. Drop `findProductComponent` (Next.js tree walk). | `pipeline/src/http/paginate.ts` |
| `providers/fortinos/pagination.test.ts` | Adapt | Keep the `computeHasNextPage` and fingerprint cases. | `pipeline/test/` |
| `providers/fortinos/test-helpers.ts` | Drop | Loads Fortinos fixtures. | — |

#### 4.1 Gaps in the normalizer helpers (fix when porting)
- `parsePackageSize` only handles `N unit` and `N x M unit`. It misses:
  - nested packs (`2 x 6 x 355 mL`);
  - counts (`12 ea`, `6 pk`);
  - ranges and approximate weights (`approx. 1.2 kg`);
  - per-weight pricing (`$/lb`, `/kg`);
  - fractions;
  - unit-less numbers.
- The unit isn't normalized: `g` / `kg` / `mL` / `L` keep the source's casing, with no conversion to a base unit. The P4 task needs `g`, `ml` and `ct` as base units.
- `parseUnitPrice` leaves the quantity inside the unit string (`"100g"`), and `unitPriceQuantity` is always `null`. The rebuild should store a computed price per base unit rather than trust the source's unit price.
- `splitPackageSizing` splits on the first comma, so a size containing a comma breaks.
- `parsePrice` accepts negative numbers, and there's no upper sanity bound anywhere.
- `promotionEndAt` is a raw string, not parsed into a date.
- `fingerprintMetadata` uses SHA-1. That's fine for change detection; keep it but name it a content hash, not a security feature.

### Jobs and worker orchestration

| File | Verdict | Reason | Rebuild home |
|---|---|---|---|
| `jobs/job-types.ts` | Adapt | Statuses (`completed_with_errors` is useful) and run modes (`dry_run`, `count_only`) map onto `ingestion_runs.status` and the CLI's `--dry-run` / `--sample N`. Drop the queue states `claiming` and `cancelling`. | `packages/core/src/runs.ts` |
| `jobs/safeguards.ts` | Keep | Fail a batch over 50% invalid, fail when a category drops from N to 0, warn on a drop over 50%. Pure and tested. Extend it with the CLAUDE.md validation set: price sanity, unit normalization success rate, duplicates. | `packages/core/src/validation/safeguards.ts` |
| `jobs/safeguards.test.ts` | Keep | Port with the module. | `packages/core/test/` |
| `jobs/progress.ts` | Keep | Count arithmetic and final-status rule. | `pipeline/src/runs/progress.ts` |
| `jobs/progress.test.ts` | Keep | Port with the module. | `pipeline/test/` |
| `worker/job-runner.ts` | Adapt | **Keep the behaviours:** verify store context before writing; cancel between pages; politeness delay with jitter; dedupe within a category; per-page writes; **conservative deactivation** (only a clean, full, uncancelled sync may mark unseen listings as gone); store and category "last synced" markers. **Change the shape:** it's a 494-line function tied to `scrape_jobs` polling and the store × category model. Split it into a generic run driver and per-source plans, and record into `ingestion_runs`. | `pipeline/src/runs/driver.ts` |
| `worker/loop.ts` | Drop | Poll and claim loop for an always-on worker. Scheduled Actions workflows replace it (D-003). | — |
| `worker/heartbeat.ts` | Drop | Exists to re-claim abandoned queue jobs. Actions has job timeouts, and a run left in `running` past its timeout can be marked failed at the next run's start. | `pipeline/src/runs/driver.ts` (stale-run sweep) |
| `worker/shutdown.ts` | Keep | SIGINT/SIGTERM → AbortSignal. Actions sends SIGTERM when a run is cancelled. | `pipeline/src/shutdown.ts` |

### Database layer

| File | Verdict | Reason | Rebuild home |
|---|---|---|---|
| `db/catalogue-repository.ts` | Adapt | Keep chunked `.in()` reads (300) and chunked upserts with `onConflict` on stable keys (500). Use generated Supabase types instead of hand-written ones. Split it per domain instead of one 410-line class. Every write must carry provenance. | `pipeline/src/db/*.ts` |
| `db/upsert.ts` | Adapt | **Keep** the write order (identity → listing → category link → store price) and the change detection: `priceFieldsChanged` with a 0.005 epsilon, `availabilityChanged`, and a metadata hash. History is written **only on change**, matching the free-tier register. **Drop** creating a canonical product per unmatched listing: that's how 96 "canonical" rows became copies of 96 listings. Unmatched listings should create match candidates for the P4 matcher. **Fix:** writes are several requests with no transaction, so a failure mid-page leaves partial state. Idempotent upserts make it recoverable, but the run must report it. The `created` counter counts "new to retailer", not "new listing at this store". | `pipeline/src/db/upsert-listings.ts` |
| `db/upsert.test.ts` | Adapt | 10 cases for the change-detection helpers. Port them. | `pipeline/test/` |
| `db/types.ts` | Drop | Hand-written row types. Replaced by generated Supabase types. | `supabase` generated types |

### CLI commands

| File | Verdict | Reason | Rebuild home |
|---|---|---|---|
| `commands/capture-fortinos.ts` | Drop | Launches a visible browser for a human to browse while it records internal requests. Part of the workaround. | — |
| `commands/session-fortinos.ts` | Drop | Warms and "recovers" a browser session against Akamai, and prints Chrome CDP launch commands. | — |
| `commands/shared.ts` | Adapt | "Create a run record, then run it in-process" is the right model for a CLI and for Actions. Fold it into the one CLI. | `pipeline/src/cli.ts` |
| `commands/run-job.ts` | Drop | Re-runs a queued job by id. No queue in the rebuild. | — |
| `commands/sync-store.ts` | Adapt | Becomes `pipeline run <source> [--sample N] [--dry-run]` (PLAN Phase 2). | `pipeline/src/cli.ts` |
| `commands/test-category.ts` | Adapt | Count-only probe becomes `--dry-run --sample N`. | `pipeline/src/cli.ts` |

---

## 5. Edge functions and matching RPCs

| Item | Verdict | Reason | Rebuild home |
|---|---|---|---|
| `lookup-product` (OFF lookup + auto-draft) | Adapt | **Keep** the OFF fallback for barcodes missing from the catalog: it adds coverage cheaply. **Change:** <br>• normalize the GTIN (check digit, UPC-A ↔ EAN-13) before any lookup; <br>• look in our own imported OFF Canada subset first; <br>• cache misses; <br>• send a descriptive `User-Agent` with contact details, as OFF asks; <br>• resolve the brand through the P4 resolver with a confidence value, not "load all brands and take the longest substring"; <br>• auto-created products get `method = off-api` provenance and go to the review queue; <br>• require a signed-in user and rate-limit per user (today, anyone holding the anon key can create product rows). | `supabase/functions/lookup-product/` + `packages/core/src/gtin.ts` |
| `enrich-content` (company / product / brand_owner AI) | Adapt | **Keep** the validation approach: <br>• clamp and coerce values; <br>• use canonical category order; <br>• allow-list icons; <br>• check URLs; <br>• return every coercion as a `warnings[]` entry. <br>Re-express it as zod schemas. **Drop** its output shape, which has no citations, confidence, rubric version or saved model. Phase 7 requires all four. Batch scoring moves to the pipeline (D-009). The admin's single "research" action stays an edge function, gated to admins. | `supabase/functions/_shared/ai/` (D-009), Phase 7 |
| `process-receipt` | Adapt | Keep the model-chain fallback and output sanitising (max 100 items, finite numbers). Matching moves to the P4 matcher. Add auth, a spend guard and cost logging. Phase 8 owns the details. | Phase 8, `supabase/functions/process-receipt/` |
| `match_receipt_items` RPC | Adapt | **Keep** the tiered confidences (alias 1.0 > barcode 0.99 > exact name 0.98 > brand + name 0.95 > fuzzy × 0.9) and the idea of learned aliases. **Problems:** <br>• The trigram GIN indexes are on raw `name`, but the function compares `normalize_match_text(name)` with `similarity()` rather than the `%` operator. No index applies, so every query is a full scan. That's fine at 13 products, but not at 100k. <br>• The confidence values are hand-picked, not calibrated. P4's gold set should set them. <br>• `barcodes_match` strips leading zeros and accepts a code that is one digit longer with the same prefix. That tolerates a missing check digit, but it can also match two different short codes. Use real GTIN normalization instead. <br>Rebuild: stored normalized columns with a trigram index and the `%` operator; GTIN exact first; aliases; matching decisions stored. | Phase 4 matcher (`packages/core` scoring + SQL candidate RPC) |

## 6. Admin catalog tools

| Item | Verdict | Reason | Rebuild home |
|---|---|---|---|
| `pages/catalog/Overview.tsx` | Adapt | KPI tiles and recent runs become the P5 quality dashboard. Add rows per source, match rate, stale prices, unresolved brands, and DB/storage against budget. | `app/(admin)/catalog/index` |
| `pages/catalog/Retailers.tsx` | Adapt | Edit-only list of seeded retailers. In the rebuild, chains and banners are rows in the DB browser; there's no `provider_key`/base-URL config in the UI. | P5 DB browser |
| `pages/catalog/Stores.tsx` | Adapt | Store CRUD stays (in the DB browser). **Drop** "queue job per store": runs come from Actions schedules or `workflow_dispatch` (P5 🟡 token decision). | P5 DB browser |
| `pages/catalog/Categories.tsx` | Drop | Edits Fortinos `url_path`/`navid` scrape targets. Replaced by the P4 category taxonomy and its source mappings. | P4 / P5 taxonomy mapping |
| `pages/catalog/Jobs.tsx` | Adapt | Becomes the ingestion runs list (status, counts, source). | P5 runs list |
| `pages/catalog/JobDetails.tsx` | Adapt | **Keep** the counters, the event log (severity, event, category/page, message) and live polling. Add links to raw objects and validation failures. "Cancel" and "retry" map to Actions run controls, if approved. | P5 run detail |
| `pages/catalog/ProductExplorer.tsx` | Adapt | Per-store price table: regular, effective, unit price, checked-at. Extend it to the full product → listings → price history view with a provenance panel. | P5 product browser |
| `components/BulkBrandLink.tsx` | Adapt | Three explainable rules: text brand equals a brand name; name starts with a brand (longest wins); company owns exactly one brand. Each proposal shows its reason and the admin confirms it. **This is the right UX for the review queue.** The rules become P4 resolver steps with confidence values. | P4 resolver + P5 review queue |
| `lib/enrich.ts` | Adapt | Thin client for the edge functions. Rebuild it with the admin's own JWT, not a service-role key. | `app/src/admin/ai.ts` |
| `lib/catalog-api.ts` | Drop | Every catalog query runs with the service-role key in the browser (SPEC "Backend and admin: issues" #1). Replaced by RLS-guarded queries plus `is_admin()`. | — |
| `lib/catalog-types.ts` | Drop | Hand-written types. Replaced by generated types. | — |
| `lib/external.ts` | Adapt | OFF and Wikipedia are called straight from the browser with no cache. Move them server-side (pipeline, edge function) with caching, a `User-Agent` and rate limits. | `pipeline/src/sources/off/`, `wikipedia/` |
| `components/EnrichProgress.tsx` | Keep (idea) | Progress overlay plus an unload guard during long AI calls. Useful UX. | P7 admin UI |

## 7. Concepts and cross-cutting decisions

| Concept | Verdict | Reason | Rebuild home |
|---|---|---|---|
| **Akamai / CDP session-attach workaround** | **Drop** (D-002) | (1) It's a deliberate bot-protection workaround: in-page `fetch` "so TLS matches", reusing a real user's Chrome over `--remote-debugging-port`. That's a ToS and legal risk, and an IP-block risk on the owner's home connection. (2) It can't run unattended: a human launches Chrome and keeps it open, so it can't run on Actions. (3) It failed most of the time anyway: 7 of 12 jobs. (4) It depends on an undocumented Next.js data route and a build id that changes on every deploy. (5) It leaves a full Chrome profile with live cookies in the legacy folder (`catalog-worker/.fortinos-cdp-profile/`, gitignored). Retailers stay listed in SOURCES.md for the owner to decide one by one. | `docs/catalog/SOURCES.md` (P0.10) |
| Split between ethical `products` and grocery `catalog_products` | **Drop** (D-008) | No link exists between them. 96 catalog rows, 0 with a UPC, 0 matched, so prices never reached a rated product. One `products` table with identifiers and listings. | P0.11 data model |
| Listing (chain-level product) vs store price | Keep | `retailer_products` (one per retailer SKU) vs `store_products` (price per store) is right: Loblaw-family prices vary by store. | P0.11: `store_listings` + `price_observations` |
| Price history only on change | Keep | Required by the 500 MB budget. Add a provenance + `ingestion_run_id` FK (legacy `scrape_job_id` has none) and a 90-day monthly rollup (free-tier register). | P0.11 / P2 |
| Effective price = sale, else regular; member price stored apart | Keep | A clear, documented rule (the PC Optimum member price never counts as effective). Record it in DATA_MODEL.md. | P0.11 |
| Metadata content hash to skip unchanged writes | Keep | Cuts writes and makes "updated" counts meaningful. | P2 upsert helpers |
| Conservative deactivation of unseen listings | Keep | Only after a complete, clean, full-coverage run. This prevents a broken scrape from wiping a store. | P2 run driver |
| DB job queue (`scrape_jobs` + `claim_scrape_job` with `SKIP LOCKED`, heartbeats) | Drop | Built for an always-on local worker. Actions schedules plus `ingestion_runs` bookkeeping cover it (D-003). | P2 `ingestion_runs` |
| Event log per run (`scrape_job_events`) | Adapt | Useful for debugging. Cap the rows per run and add retention to protect the DB budget. | P2 `ingestion_run_events` |
| Request templates stored as JSON (`retailer_request_profiles`, 0 rows; `listingPage.template.json`) | Drop | Config-driven scraping of internal APIs. Never used in the DB. | — |
| Politeness: 1–2 s jittered delay, page cap, retries | Adapt | Matches about 1 req/s/host. **Missing:** a robots.txt check, an HTTP cache (ETag/Last-Modified, on-disk), a global per-host limiter, and backoff on 429 that stops the source instead of pushing on. | P2 polite HTTP client |
| Raw response storage | **Gap** | Not done. CLAUDE.md requires gzipped raw responses before parsing (D-010). | P2 raw store |
| Provenance (`source_url`, `fetched_at`, `method`, `method_version`) | **Gap** | Only `source_checked_at`. No `method` or version anywhere. | P0.11 standard columns |
| Validation before writing | Partial | zod shape plus invalid-rate safeguards exist. Missing: price sanity, unit normalization checks, duplicate detection across sources. | `packages/core/src/validation/` |

---

## 8. Lessons

1. **Prove access before building on it.** About 2,000 lines of provider, session and capture code were written against a site that blocked the worker most of the time. In the rebuild, a source gets code only after SOURCES.md marks it **use** (P0.10), and phase 3 starts every source with a ~100-record sample task.
2. **Identity is the hard part, not fetching.** A scraper that writes rows without a GTIN produces a list, not a catalog. Get identity from sources that carry GTINs (OFF, Open Prices) first, then attach listings to it through the matcher. Never make a new "canonical" row per listing.
3. **Coverage needs measuring, not assuming.** Pagination was a guess, and no check caught that every category stopped at exactly one page. Runs should report expected vs fetched totals and fail loudly when they look capped.
4. **Store raw, parse later.** Without raw storage, every parser fix or new field means fetching again, which costs politeness budget and risks blocks.
5. **Keep the good small pieces.** Typed errors, retry, safeguards, change-only history and conservative deactivation were sound and tested. Port them deliberately instead of rewriting.
6. **Test the orchestration, not just the helpers.** 61 tests cover pure helpers; nothing covers the runner or the DB writes, which is where the partial-write and counting problems are. Phase 2 should run the driver end to end against a fixture source and a dev DB (idempotency check: run twice, no duplicates).
7. **Server-only keys.** The worker used the service role correctly (server-side). The admin used the same key in a browser. The rebuild keeps service-role use to Actions and edge functions only.
8. **Typecheck in CI.** The legacy `typecheck` script fails today (6 DOM-lib errors), so nothing enforced it.

## 9. Inputs to later tasks

- **P0.10 SOURCES.md:** record Fortinos/Loblaw as "Akamai-protected; internal Next.js data route; automated access blocked in practice". Legacy evidence: 7 of 12 jobs blocked. Their listing tiles exposed no UPC/GTIN.
- **P0.11 DATA_MODEL.md:** one `products` table; listings vs store price observations; effective/member price rule; content hash; `ingestion_run_id` FKs; event-log retention; normalized-name columns with trigram indexes for matching.
- **Phase 2:** port the modules marked Keep/Adapt in §4 (destinations above), and add the missing pieces: robots.txt, HTTP cache, raw store, transaction-or-report on partial writes, orchestration tests.
- **Phase 4:** seed the unit-parser tests from `normalizer.test.ts` and fix the §4.1 gaps. Turn the `match_receipt_items` tiers and BulkBrandLink rules into calibrated, gold-set-measured steps.
