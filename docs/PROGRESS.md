# Progress log

Newest entry first.

## 2026-10-29 — P2.20 Make `@sarvis/core` loadable by Node strip-types

**What changed**
- 24 files in `packages/core/src/**`: relative imports now name the `.ts` file, or `index.ts` for directory imports (`./records`, `./validation`, `../records`). No behaviour change.
- `packages/core/tsconfig.json`: `allowImportingTsExtensions` and `erasableSyntaxOnly`. Core had no non-erasable syntax to fix.
- `app/tsconfig.json`: `allowImportingTsExtensions` too. This file wasn't in the task's list, but without it the app's typecheck fails with TS5097 on every core import, because `tsc` follows core's sources (D-047).

**Verification**
- From `pipeline/`: `node --experimental-strip-types -e "import('@sarvis/core')"` loads and lists **77 exports** (`APP_NAME`, the record schemas, `normalizeGtin`, `validateBatch`, `contentHash`, ...).
- Metro: `npm run web --clear`, then `/` (which redirects to `/auth`) loads with **0 console errors and 0 warnings**. The auth screen renders `APP_NAME` from core at runtime, so Metro bundled the new `.ts` specifiers. Screenshot: `.screenshots/p2-20-web-home.png`.
- `typecheck`, `lint` and `format:check` pass. All tests: **305 pass**.

**Notes for you**
- Pipeline code can now import core at runtime under plain Node. That unblocks P2.17.

**Next:** P2.17 Pipeline: CLI, fixture source and run-twice e2e test.

---

## 2026-10-29 — P2.16 Pipeline: idempotent upsert helpers

**What changed**
- `pipeline/src/db/`:
  - `change.ts`: change detection ported from legacy `db/upsert.ts` (`priceFieldsChanged` with the 0.005 epsilon, and `listingStateChanged`), plus a column diff that copes with how PostgREST returns values, and the `listing_key` twin.
  - `query.ts`: chunked `.in()` reads (300, paged past the 1,000-row cap), chunked inserts (500) that retry row by row on an integrity error, and updates by id.
  - `keyed.ts`: the shared write rule (D-046). It matches on stable keys, then inserts, or counts the row as unchanged or skipped_locked, or updates only the unlocked columns that changed.
  - `refs.ts`: bulk lookup from slugs, GTINs and refs to ids.
  - `writers/`: one writer each for companies, brands, both ownership edges, products (plus `product_sources` when a GTIN already belongs to another source), product identifiers, stores, store listings and price observations. Look one up with `writerFor(db, kind)`.
- Unmatched listings never create products. When a source names the product, the writer creates one pending `listing_product` match candidate instead.
- Driver: when the writer returns `rejected` records, the driver writes a `records_not_written` event and the run ends `completed_with_errors`. One new driver test covers this.
- `npm run check:writers --workspace @sarvis/pipeline` runs a dev-DB check (`*.devdb.ts`, with its own Vitest config, not part of `npm test`).

**Verification**
- The ported change-detection tests pass (5 price, 4 listing state, 1 key normalisation), plus 7 tests for the diff, the accent-stripping key, the hash and rounding.
- Dev-DB check under the `fixture` source and one throwaway run. It passed on the first try:
  - run 1: brands 2 inserted, products 5 inserted, prices 3 inserted;
  - run 2 (same input): `inserted = 0`, with **unchanged 2 / 5 / 3**;
  - run 3: product 1's admin-locked name survived (`skipped_locked = 1`), and product 2's changed size text gave `updated = 1`. Price 1 changed and appended 1 row. Price 2 was equal a day later, so it only moved `last_confirmed_on` to 2026-10-29 (`unchanged`). Price 3 stayed `unchanged`. That leaves 4 price rows in total;
  - provenance: 11 rows checked, 0 with a null `source_id`, `fetched_at`, `method` or `method_version`;
  - other writers, run twice. Company, brand edge (`pending`), 2 listings and 1 identifier: run 2 had `inserted = 0` and everything `unchanged`. There was exactly 1 pending `gtin_exact` candidate, linked to the SKU listing;
  - cleanup: a SQL count afterwards found 0 test companies, brands, products, identifiers, listings, candidates, stores, banners and runs.
- All tests: **305 pass**. `typecheck`, `lint` and `format:check` pass.

**Notes for you**
- **One test failure I couldn't reproduce:** the first full `npm test` after the change had 1 failure, and 3 reruns passed. I didn't capture which test it was. It's most likely one of the timing tests (the HTTP rate limit, or the driver's politeness delay) under load. Look out for it in CI.
- **The `RunStore` Supabase adapter has now run against dev.** The check creates its run with `createRun`.
- **Banners have no writer yet,** because there's no banner record kind. The check inserts its test banner directly. Phase 3 store sources will need one.
- **Price writer scale (D-046):** it reads a store's whole history for the source. That's fine for samples. Watch it in the Open Prices scale-up.
- `deactivateUnseen` isn't implemented on any writer. No current source needs it. The driver skips it when it's absent.

**Next:** P2.20 Make `@sarvis/core` loadable by Node strip-types (P2.17 depends on it).

---

## 2026-10-29 — P2.15 Pipeline: source interface and run driver

**What changed**
- `pipeline/src/sources/`:
  - `source.ts`: the `Source` interface (plan → fetch → parse, with capability flags and `verifyContext`).
  - `registry.ts`: the legacy factory map, ported.
  - `index.ts`: `registerAllSources()`. Nothing is registered yet; the fixture source comes in P2.17.
- `pipeline/src/runs/`:
  - `driver.ts`: `runSource(source, opts, deps)`, the whole lifecycle (D-045), plus `storageRawWriter(db)`.
  - `progress.ts`: `computeFinalStatus` and `addCounts`, ported, with a `failed` input added.
  - `store.ts`: the `RunStore` interface, with a Supabase adapter and an in-memory adapter.
- `raw/store.ts`: a sync `envelopeOf()` split out of `encodeRaw`, so dry runs parse exactly what would be stored.

**Verification**
- Driver tests (fake source, in-memory store), **18 pass**:
  - An `avoid` source is refused, and so are `manual_only`, disabled and unknown ones. None creates a run.
  - A stale run (7 h) is swept to `failed`, and a recent one is left.
  - 60 invalid records store 50 failures and give `counts.invalid = 60`.
  - A batch that is 60 % invalid isn't upserted and the run is `failed`. A bad batch inside a mostly valid run gives `completed_with_errors`.
  - A cancel mid-run, or during the politeness delay, gives `cancelled` with no deactivation.
  - `expected_total` 5 ≠ fetched 2 gives `completed_with_errors`.
  - Also covered: dry run (no raw writes, no upserts), sample cap, a 403 failing the run with an alert, a recoverable fetch error, a failed `verifyContext`, a 40 → 0 drop, and the 50-event cap.
- Ported progress tests (6) and registry tests (4) pass. All tests: **287 pass**. `typecheck`, `lint` and `format:check` pass.

**Notes for you**
- **The Supabase `RunStore` adapter hasn't run against the dev DB yet.** It typechecks against the generated types, and the P2.17 run-twice e2e will exercise it.
- **The driver imports `@sarvis/core` at runtime**, so it runs under Vitest but not plain Node until P2.20. P2.17 already depends on P2.20.
- **The stale sweep covers every source, not only the one being run.** Any `running` row older than 6 h is dead, since Actions kills a job at 6 h.

**Next:** P2.16 Pipeline: idempotent upsert helpers.

---

## 2026-10-29 — P2.14 Pipeline: raw store

**What changed**
- New in `pipeline/src/raw/`:
  - `store.ts`: `storeRaw(ctx, seq, response)` redacts the response, wraps it in a `sarvis-raw/1` JSON envelope, gzips it and uploads it to `raw/{source}/{run}/{seq}.json.gz`, then inserts the `raw_objects` row (sha-256 of the body, gz size, URL, status, `fetched_at`, `expires_at`). `readRaw(db, id)` downloads the file, checks it against the sha-256 and returns the body. It throws `NotFoundError` if the row is marked deleted or the file is missing. `deleteRawFile` is there for the Phase 6 cleanup.
  - `redact.ts`: a header allow-list, JSON/NDJSON body-secret redaction (generalised from legacy `sanitize.ts`), and URL credential redaction.
  - `retention.ts`: `retentionFor(sourceKey, {delta})` follows the DATA_MODEL §5 table, and `expiresAt()` turns a policy into a date.
  - `check.ts`, run with `npm run check:raw --workspace @sarvis/pipeline`: the dev-project round trip. Added to the Commands table in CLAUDE.md.
- D-044 records the format, hash and retention readings. The P6 outline now names the helpers the cleanup job reuses.

**Verification**
- Raw unit tests: **27 pass** (redaction 11, retention 8, codec and paths 8). All tests: **259 pass**. `typecheck`, `lint` and `format:check` pass.
- `check:raw` on dev (output trimmed):
  ```
  stored          storagePath raw/fixture/8af5077d-…/000001.json.gz  sha256 449aaacd…  byteSize 349  expiresAt 2026-10-30T14:45:53Z
  raw_objects row source_id 3ac5529c-… (fixture)  run_id 8af5077d-…  content_type application/json
                  request_url https://example.test/fixture/products?page=1  http_status 200  deleted_at null
  read back       byteEqual true  bodyBytes 307  records 3  headers {"content-type":"application/json"}  (set-cookie dropped)
  file deleted    filesLeftInRunFolder 0
  readRaw after delete fails as expected: "Raw object … was deleted at … (retention)."
  readRaw with the file missing fails as expected: "Raw file raw/fixture/…/000002.json.gz could not be downloaded."
  cleaned up      runDeleted true  rawRowsLeft 0
  ```
- Storage usage (`storage.objects`) was **0 files / 0 bytes before and after**. Afterwards there were 0 `raw_objects` rows and 0 check runs.

**Notes for you**
- **`content_sha256` hashes the redacted body, not the gz file.** The same response therefore always gets the same hash, which the "write only when changed" sources (GDELT, RSS, Wikipedia) need.
- **The OFF Canada extract should be split into several files in P3** (for example 10k records each), because a whole envelope is parsed in memory.
- **The check script reads the version from `package.json` instead of importing `index.ts`.** Importing it still fails under Node strip-types because of `@sarvis/core` (that's P2.20).

**Next:** P2.15 Pipeline: source interface and run driver.

---

---

## 2026-10-29 — P2.13 Pipeline: polite HTTP client

**What changed**
- New in `pipeline/src/http/`:
  - `client.ts`: `createHttpClient()` with the Sarvis User-Agent and a per-host limiter (at most 1 req/s, lowered by the source row or Crawl-delay). It does backoff with jitter on 5xx and network errors, throws `SourceBlockedError` on 403/429 (after one Retry-After wait for a 429), follows redirects by hand, and has a 30 s timeout.
  - `robots.ts`: an in-repo RFC 9309 parser and matcher (User-agent, Allow, Disallow, Crawl-delay, `*`, `$`).
  - `cache.ts`: an on-disk cache in `.cache/http/` with a TTL and ETag / Last-Modified revalidation.
  - `paginate.ts`: `computeHasNextPage` and `pageFingerprint`, ported from legacy.
- `PIPELINE_VERSION` is added for the User-Agent. D-043 records the details.

**Verification**
- Pipeline tests: **73 pass**. All tests: **232 pass** (`npm test`). Against a local `node:http` server:
  - 5 requests to one host: each gap is ≥ 990 ms and the total is ≥ 4 s.
  - Two hosts (`127.0.0.1` and `localhost`, 3 requests each): they finish in 3–5 s, not 7 s, and the order alternates.
  - Crawl-delay 2 spaces requests ≥ 2 s apart.
  - A 503 then a 200 succeeds after a backoff, with 2 requests. A dropped socket is retried as a `NetworkError`.
  - A 403 throws `SourceBlockedError` after 1 request. A 429 with `Retry-After: 1` makes 2 requests, then blocks. A 429 without Retry-After makes 1 request.
  - A robots-disallowed path gets 0 requests, and so does a redirect into one. A 404 robots.txt allows everything. An unreachable robots.txt disallows the host.
  - A second fetch inside the TTL makes 0 requests (`cache: 'ttl'`). After the TTL it sends `If-None-Match`, gets a 304 and serves the cached body. Errors aren't cached.
- The 4 ported pagination tests pass, plus 1 new one for `totalPages`.
- `npm run typecheck`, `lint` and `format:check` pass.

**Notes for you**
- **`npm test` now takes about 30 s** because the client tests use the real 1 s spacing. That's deliberate, since the spacing is what they check.
- **A host whose robots.txt returns 5xx or can't be reached is skipped for the whole run.** RFC 9309 says to assume it is fully disallowed. If a real source hits this in Phase 3, it will show up as `RobotsDisallowedError`.
- **The rate is capped at 1 req/s even if a source row says more.** Raising the cap for an API whose terms allow it would be your call.
- `.gitignore` needed no change: `.cache/` was already ignored.

**Next:** P2.14 Pipeline: raw store.

---

## 2026-10-29 — P2.12 Pipeline runtime: env, logger, errors, retry, shutdown, DB client

**What changed**
- New in `pipeline/src/`, ported from legacy `catalog-worker`:
  - `env.ts`: zod-validated, with `emptyToUndefined`. Errors name each variable and never include values. It refuses any project but dev. No Fortinos variables and no new variables.
  - `log.ts`: single-line JSON. Secrets print `[redacted]` and user-table data prints `[user-data]`, at any depth. Errors are serialized, and the sink can be injected.
  - `errors.ts`: the typed taxonomy with `retryable` and `alert` flags. 403 and 429 give `SourceBlockedError`. `errorFromStatus()` maps statuses, and `classifyError()` goes by class, status and code, never message text.
  - `http/retry.ts`: `sleep` with abort, jitter and `withRetry`, which never retries a cancel or a block.
  - `shutdown.ts`: SIGINT/SIGTERM to an AbortSignal, with an injectable `exit`.
  - `db/client.ts`: a typed (`Database`) service-role client.
  - `db/smoke.ts`: run with `npm run smoke:db -w @sarvis/pipeline`.
- `pipeline/package.json` adds `@supabase/supabase-js` and `zod` (both already in the tree). `tsconfig` adds `allowImportingTsExtensions` and `erasableSyntaxOnly`, so Node 22 strip-types runs the files directly.
- D-042 records the details.

**Verification**
- Pipeline tests: **37 pass** (errors 12, retry 11, log 6, env 5, shutdown 3, plus the existing 1). All tests: **196 pass** (`npm test`).
  - The legacy `errors.test.ts` cases are ported. The message-sniffing cases now use status and code, and a new test checks that message text is ignored.
  - A redaction test checks that `service_role_key`, `Authorization`, `set-cookie`, `password` and `SUPABASE_DEV_SERVICE_ROLE_KEY` print `[redacted]`, and that no secret appears in the line.
- Smoke script against dev: `{"level":"info","message":"db smoke ok","table":"sources","count":35}`. This matches `select count(*) from sources` (35) via the `supabase-dev` MCP.
- `npm run typecheck`, `lint` and `format:check` pass.

**Notes for you**
- **Legacy had no async tests,** although the plan said to port them. I wrote new ones for `sleep`, jitter, abort and `withRetry`, including the backoff bands and the cap.
- **New task P2.20** (before P2.17): `@sarvis/core` can't be imported by Node strip-types because of its extensionless imports (`ERR_MODULE_NOT_FOUND`). The pipeline only needed type imports from core in this task, but the CLI will need core at runtime.
- **404 is no longer retried.** Legacy retried it because of Fortinos' Next.js build ids. Rebuild sources that need that can opt in.
- I couldn't read `.env.example` (a permission deny rule), but no new variables were added, so it needs no change.

**Next:** P2.13 Pipeline: polite HTTP client.

---

## 2026-10-29 — P2.11 Core: validation library and safeguards

**What changed**
- New in `@sarvis/core`:
  - `validation/`:
    - `validateBatch(kind, records, opts)`, with the six `validation_failures` rules. Failure rows have the table's shape; the run driver adds `run_id` and `raw_object_id`.
    - Per-kind stable keys for the in-batch duplicate check.
    - Payload trimming to fit the 1 KB jsonb check.
    - `contentHash()`, using a pure-TS SHA-256.
    - Safeguards (`computeQuality`, `qualityOf`, `evaluateBatch`) with the duplicate-rate and unit-parse thresholds added.
  - `text.ts` (`cleanText`, `stripHtml`, `normalizeMatchText`) and `price.ts` (`parsePrice`, which now rejects negatives), ported from legacy.
- D-041 records the rule priority, the duplicate keys, the hook, the thresholds and the hash.
- The code went out in `d7a4e2e`, and CI was green. A docs script failed during that commit, so these doc updates follow in a second commit.

**Verification**
- Core tests: **134 pass**. All tests: **160 pass** (`npm test`).
  - Every rule has a passing and a failing case: `schema`, `required_field`, `gtin_check_digit` (in products, product refs and `gtin_alt`), `price_sanity` (hard bounds and per-category bounds), `unit_parse` (fill, throw, an inconsistent result, the pass-through) and `duplicate` (a shared GTIN, a shared source id, normalized listing names).
  - Payloads stay within 1 KB, measured the way Postgres prints jsonb.
  - `contentHash` is identical for keys reordered at every level, and changes when a field changes. SHA-256 matches the FIPS vectors and two Node `crypto` hashes.
  - The legacy `cleanText`, `stripHtml` and `parsePrice` cases pass.
- `npm run typecheck`, `lint` and `format:check` pass.

**Notes for you**
- **The ported safeguards tests aren't changed "only in their imports".** Legacy built `NormalizedRetailerProduct` fixtures, which the rebuild doesn't have, so the fixtures now pass the same batches as counts. All four legacy assertions are unchanged and pass, and the thresholds are the same.
- **New thresholds to check:** warn above 5% duplicates, fail above 50%, and warn when fewer than 80% of sizes parse. The unit-parse warning stays off until P4 adds a real parser.

**Next:** P2.12 Pipeline runtime: env, logger, errors, retry, shutdown, DB client.

---

## 2026-10-29 — P2.10 Core: record schemas, slugs and GTIN

**What changed**
- `@sarvis/core` now has:
  - `records/`: zod schemas for 11 record kinds (company, brand, both ownership edges, product, product identifier, store, store listing, price observation, reference price, document). Each one embeds the shared provenance block. `RECORD_SCHEMAS` maps each kind to its schema.
  - Records link to other rows by natural key (`brand_slug`, a `{gtin}` product ref, an OSM store ref …), never by id. The P2.16 writers resolve the keys.
  - The schemas are strict, and their limits mirror the SQL checks. Prices must be > 0 and ≤ 10,000, currency must be `CAD` or `USD`, URLs must be http(s), and datetimes must be ISO with an offset.
  - `slug.ts`: `slugify()` and `uniqueSlug()` (`base` → `base-ca` → `base-ca-2` …).
  - `gtin.ts`: TS twins of the three SQL GTIN functions, plus `normalizeGtin()`, which returns `gtin`, `restricted`, `plu` or `invalid` with a reason.
  - `runs.ts`: run modes, statuses and triggers, and a `RunCountsSchema`.
- `zod` ^4.6.7 is a runtime dependency of core. D-040 records it with the record design choices.
- DATA_MODEL §1.4 now points at `gtin.ts`.

**Verification**
- Core tests: **85 pass**. All tests: **111 pass** (`npm test`). They cover:
  - the slug examples ("Ben's Original" → `bens-original`, accents, `&`, the 64-character cap, collisions);
  - GTIN cases (UPC-A, EAN-13, EAN-8, GTIN-14, a bad check digit, 02/20–29 prefixes, PLUs);
  - all 27 SQL vectors from `supabase/tests/products.sql`, run through the twins, with `normalizeGtin()` agreeing with them;
  - the 13 legacy barcodes;
  - one valid and one invalid sample per record kind, with the error checked at the expected field;
  - defaults, unknown fields, provenance, prices and currency, restricted GTINs and datetime offsets.
- The 13 legacy barcodes also ran through the SQL `gtin_is_valid` on dev, and the results are the same as in TS.
- `npm run typecheck`, `lint` and `format:check` pass.
- `npm run web` loads `/` (it redirects to `/auth`) with **0 console errors**, so Metro bundles zod from core. The first load showed a 400 from a stale refresh token left in the browser; a reload on clean storage had no errors. Screenshot: `.screenshots/p2-10-web-root.png`.

**Notes for you**
- **One legacy barcode is invalid.** Patagonia Provisions Soup `0850034340016` has a bad check digit (dev SQL agrees). The other 12 normalize cleanly. I added a line to P2.18: import that product with a null GTIN and put the barcode in its review reason.
- **Non-CAD/USD prices are rejected.** If Open Prices has useful EUR or other rows for Canadian stores, that's a one-line change to the enum.

**Next:** P2.11 Core: validation library and safeguards.

---

## 2026-10-29 — P2.9 Schema: editorial

**What changed**
- The migration `20261029002156_catalog_editorial` is applied to dev. It adds:
  - `product_features` (an icon allow-list of 24 names, taken from legacy's admin and `enrich-content`; upsert key `(product_id, sort_order)`);
  - `transparency_steps` (four fixed steps, at most one of each per product, plus a generated `step_number` 1–4 for ordering);
  - `stories` (slug key; `cover_image_path` must be a Storage path, not a URL; the company link is set null when the company is deleted; public once `published_at <= now()`).
  - Features and steps carry +review and +prov, and anon sees only approved ones. Stories carry +prov. Only admins can write.
- `supabase/tests/editorial.sql` holds the checks. The README row and a DATA_MODEL §3.7 "as built" note are added. The types are regenerated (341 lines added, 0 removed). D-039 records the design choices.
- PLAN: P2.18 now says to map legacy steps **by title**. A Phase 8 bullet is added for the story-cover bucket and licence check.

**Verification**
- RLS script: **33/33 ok**.
  - `step_number` follows `step` and can't be written (`428C9`).
  - Rejected with `23514`: an icon outside the allow-list, an unknown step, an approved feature with no `reviewed_at`, a story slug `Bad Slug`, and an external cover URL.
  - Rejected with `23502`: a null icon.
  - Rejected with `23505`: a duplicate `(product, sort_order)`, a second step of the same kind for a product, and a duplicate story slug.
  - An upsert on the key keeps the same row id. A Storage path cover is accepted. Deleting the company keeps its story.
  - anon: sees only the approved feature and the two approved steps, in step order. Sees only the past story: **the future-dated story is hidden** and so is the draft. Gets `42501` on insert and update.
  - Non-admin user: sees 3 approved features and steps, and no future or draft story. Gets `42501` on insert, and updates or deletes 0 rows.
  - Admin: sees all 3 stories and all 5 features and steps. Approves a feature, inserts and publishes stories, and deletes a step. Afterwards anon sees the newly approved feature and the newly published story.
- Afterwards: 0 rows in the new tables, 0 test users and 0 `rls-*` fixtures.
- `relrowsecurity` is true on all 39 public tables.
- Advisors:
  - Security: only the existing leaked-password warning.
  - Performance: only INFO "unused index" notices.
- `npm run typecheck`, `lint` and `test` (27 tests) pass, and Prettier is clean.

**Notes for you**
- **Legacy steps need mapping by title.** Two legacy products have three steps, with shipping in slot 3 ("Carbon Offset Shipping", "Global Distribution"). Mapping by number would label those as packaging, so P2.18 maps by title.
- **Story covers aren't planned in detail yet.** I added a Phase 8 milestone for a public bucket and a licence check per cover. Until then, stories show without a cover image.
- One `execute_sql` call failed with a transient "Invalid or expired requestState" MCP error. I checked that it left nothing behind, then re-ran it, and it passed.

**Next:** P2.10 Core: record schemas, slugs and GTIN.

---

## 2026-10-29 — P2.8 Schema: scoring and evidence

**What changed**
- The migration `20261028235724_catalog_scoring_evidence` is applied to dev. It adds:
  - `rubrics` (anon sees published ones only);
  - `documents` (`url_normalized` key, visible only through a visible link);
  - `company_scores` (rating vs score/grade shape check, one approved row per company × category, a legacy-import key, and legacy rows allowed without confidence or rubric only while pending);
  - `score_citations` (follow their score);
  - `document_entities` (exactly one of company/brand, categories within the rubric);
  - `certifications` (exactly one of company/brand/product; approved needs a document);
  - `external_ratings` and `company_events` (`critical` severity kept for legacy);
  - a deferred constraint trigger, so an approved score needs a citation at commit, and deleting the last one fails too;
  - the view `published_company_scores`.
- `supabase/tests/scoring_evidence.sql` holds the checks (rolled back), plus a commented block for the real commit-time check.
- The README row is added, and DATA_MODEL §3.6 has two "as built" notes. The types are regenerated: every old line is still present, and git shows 152 "deletions" that are only diff realignment. D-038 records the design choices.

**Verification**
- RLS script: **55/55 ok**.
  - Citation rule (forced with `set constraints all immediate`): an uncited approval fails `23514` and passes once a citation is added. Deleting the last citation fails `23514`, and deleting one of two is fine.
  - Rejected with `23505`: a second approved score per company × category, a second legacy row, a duplicate `url_normalized`, and a duplicate entity link.
  - Rejected with `23514`: a category row with a 0–100 score, overall without a grade, AI without a model, manual without confidence or rubric, approving a legacy row with no confidence or rubric, `superseded_by` on a non-superseded row, a quote over 300 characters, SEC fields on news, an entity with both or neither subject, a non-rubric entity category, a certification with two subjects, an approved certification with no document, `other` with no name, a rating above max, and an unknown event kind. A legacy overall rating-only row is accepted as pending.
  - anon: sees only the 2 approved scores. `published_company_scores` returns `environment:v1, overall:v1`. Sees the approved score's citation and not the pending one's. Sees only the documents `Cert` and `Cited`: the unlinked one, the one with a pending link and the one with a pending citation are hidden, and the pending-link one appears once the link is approved. Sees only the published rubric, no pending link or event, and the approved certification. Gets `42501` on insert.
  - Non-admin user: same visibility (2 scores, 2 documents, no draft rubric). Gets `42501` on insert, and updates or deletes 0 rows.
  - Admin: sees all 5 scores and 5 documents and the pending citation. Inserts a document and a rating, approves a link, and deletes an event.
- **Real commit check:** a separate `begin … commit` that approves an uncited score failed at commit with `23514 company score … is approved but has no citation`. Nothing was left behind.
- Afterwards: 0 rows in the new tables, 0 rubrics, 0 `rls-*` companies and 0 test users.
- `relrowsecurity` is true on all 36 public tables.
- Advisors:
  - Security: only the existing leaked-password warning.
  - Performance: only INFO "unused index" notices.
- `npm run typecheck`, `lint` and `test` (27 tests) pass, and Prettier is clean.

**Notes for you**
- **Legacy scores can't be published as they are.** They have no confidence, rubric or citations, so they stay `pending` until Phase 7 rescores them or an admin completes them. This matches DATA_MODEL R13.
- **Approving a new score means superseding the old one first,** in the same transaction (one approved row per company × category). The admin review screen (Phase 5) should do both in one RPC.
- **Rubric v1 isn't seeded.** `docs/catalog/RUBRIC.md` doesn't exist yet, and Phase 7 writes it.

**Next:** P2.9 Schema: editorial.

---

## 2026-10-28 — P2.7 Schema: AI and audit

**What changed**
- The migration `20261028234727_catalog_ai_audit` is applied to dev. It adds:
  - `ai_calls` (checks on `purpose` and `status`, non-negative tokens and cost, `user_id` only for `parse_receipt`, mock and budget-blocked calls cost 0), admin only;
  - `audit_log` (checks on `action`, a uuid or bigint `row_id`, `changes` as a JSON object ≤ 16 KB), append-only: admins can select and insert, and must insert as themselves;
  - `ai_call_id` (indexed, `on delete set null`) on `company_ownership`, `brand_ownership` and `category_mappings`.
- `supabase/tests/ai_audit.sql` holds the checks (rolled back).
- The README has the migration row. The types are regenerated, and the diff adds lines only (+147). D-037 records the design choices.

**Verification**
- RLS script: **30/30 ok**.
  - Rejected with `23514`: an unknown purpose, an unknown status, negative tokens, `user_id` on a non-receipt call, a mock call with a cost, a budget-blocked call with tokens, an unknown audit action, a malformed `row_id`, non-object `changes`, and `changes` over 16 KB. A budget-blocked call with no tokens is accepted.
  - `ai_call_id` is accepted on all three fact tables. Deleting the call keeps the 3 facts and nulls the link.
  - anon: `42501` on reading either table and on insert. Still sees no pending AI edge.
  - Non-admin user: 0 rows in either table (not even their own receipt call). Gets `42501` on insert into either table, and updates 0 `ai_calls` rows.
  - Admin: reads both tables, inserts and updates an `ai_call`, and inserts an audit row as themselves. Gets `42501` when inserting an audit row as another user or with no actor, and on audit update or delete. Deletes an `ai_call`.
- Afterwards: 0 rows in the new tables and 0 test users.
- `relrowsecurity` is true on all 28 public tables.
- Advisors:
  - Security: only the existing leaked-password warning.
  - Performance: only INFO "unused index" notices.
- `npm run typecheck`, `lint` and `test` (27 tests) pass, and Prettier is clean.

**Notes for you**
- **`audit_log` can't be edited or deleted from the admin UI.** Any cleanup runs with the service role.
- **AI facts don't require `ai_call_id`,** because the 13-month `ai_calls` purge nulls it. The model and prompt stay in `method_version` (D-037).

**Next:** P2.8 Schema: scoring and evidence.

---

## 2026-10-28 — P2.6 Schema: stores and prices

**What changed**
- The migration `20261028232852_catalog_stores_prices` is applied to dev. It adds:
  - `stores` (OSM and banner keys, and coordinates set in pairs);
  - `store_listings` (a generated `listing_key`, partial keys on SKU or normalized name + size, and a trigram name index);
  - `price_observations` (price > 0 and ≤ 10,000, and the `(source_id, external_id)` key);
  - `price_points_weekly` (Monday weeks, min ≤ median ≤ max), `price_points_monthly` (per store or per banner), `reference_prices` (StatCan vectors), and `price_sanity_bounds` (admin only);
  - the views `current_prices` (the effective-price rule) and `price_observations_with_source_url`.
- `supabase/tests/stores_prices.sql` holds the checks (rolled back).
- The README has the migration row. The types are regenerated, and the diff adds tables only.
- DATA_MODEL §9 has a note on monthly k-anonymity. D-036 records the design choices.

**Verification**
- RLS script: **46/46 ok**.
  - Prices: a price of 0 and one of 10,001 are rejected with `23514`, and exactly 10,000 is accepted.
  - Also rejected with `23514`: an observation with no product or listing, `last_confirmed_on` before `observed_on`, an undiscounted price below the price, `method = 'receipt'` on an observation, a non-Monday week, a median below the min, half an OSM key, an external store id without a banner, a mid-month reference price, and inverted sanity bounds.
  - Rejected with `23505`: a duplicate source key, a duplicate SKU at a banner, the same normalized name + size without a SKU (`PC BLK BEAN 540ML` vs `pc  blk bean 540ml`), a duplicate OSM key, and a duplicate banner-level monthly row. `on conflict … where external_sku is null do nothing` inserts 0 rows.
  - `current_prices`:
    - regular 5.00 and sale 3.99 on the same day, with member 2.99 a day later → **3.99 sale**;
    - an old sale, then a regular confirmed later → **4.50 regular**;
    - a member-only product has no row;
    - an admin's newer regular replaces the sale → 4.79 regular.
  - `price_observations_with_source_url`: a stored URL wins, and the URL is rebuilt from a `url_template`.
  - anon: sees 2 of 3 stores, only the matched listing, no weekly point with `n_receipts = 1`, and only 1 weekly point in `current_prices`. Reads observations, monthly points and reference prices. Gets `42501` on `price_sanity_bounds` and on insert.
  - Non-admin user: no unmatched listing, no low weekly point, and 0 sanity bounds. Gets `42501` on insert, and updates or deletes 0 rows.
  - Admin: sees everything, inserts an observation, matches a listing, updates bounds, and deletes a weekly point.
- Afterwards: 0 rows in the new tables and 0 test users, and the fixture `url_template` is still null.
- `relrowsecurity` is true on all 26 public tables.
- Advisors:
  - Security: only the existing leaked-password warning.
  - Performance: only INFO "unused index" notices.
- `npm run typecheck`, `lint` and `test` (27 tests) pass, and Prettier is clean.

**Notes for you**
- **Effective price with separate readings:** the newest reading wins, and on the same day a sale beats regular, which beats a receipt median. Member prices never count (D-036). A sale stays effective until a newer regular price is seen, because Open Prices has no sale end dates.
- **Monthly price rollups are fully public.** If they include receipt data, the Phase 8 k-anonymity rule (your decision) must cover them too. I noted this in DATA_MODEL §9.
- **Open Prices observations must store their URL for now:** the `open-prices` source has no URL template yet. Phase 3 should add one.

**Next:** P2.7 Schema: AI and audit.

---

## 2026-10-28 — P2.5 Schema: products

**What changed**
- The migration `20261028230610_catalog_products` is applied to dev. It adds:
  - the GTIN functions `gtin_is_valid()`, `gtin_normalize()` and `gtin_is_restricted()` (immutable, the SQL twin of P2.10);
  - `categories` (path slugs and a parent-path trigger), `category_mappings` (`+review`, one row per source key), and `labels` (10 fixed rows, with the OFF tags checked against the OFF taxonomy);
  - `products` (a GTIN-14 check, the `(source_id, external_id)` import key, and a trigram name index), `product_identifiers` (banner-scoped SKUs, unique nulls not distinct), and `product_sources` (admin only);
  - the views `products_with_source_url` and `product_ownership_chain`, both `security_invoker`.
- `supabase/tests/products.sql` holds the checks (rolled back), including the shared GTIN test vectors.
- The README has the migration row. The types are regenerated, and the diff adds lines only.
- D-035 records the design choices.

**Verification**
- RLS script: **49/49 ok**.
  - GTIN vectors: 14 for `gtin_is_valid`, 6 for `gtin_normalize` and 7 for `gtin_is_restricted`, with 0 failures.
  - Rejected with `23514`: a bad check digit, a restricted `020…` code, a 12-digit GTIN, a quantity without a unit, `ok` parse status without a quantity, `merged` without a target, a `store_sku` without a banner, a malformed PLU, a child category slug that doesn't extend its parent (and one that skips a level), a non-root category without a parent, an AI mapping without confidence, and `last_seen_at` before `fetched_at`.
  - Rejected with `23505`: a duplicate `(source_id, external_id)`, a duplicate GTIN, a duplicate identifier with no banner, and a duplicate mapping key. `on conflict (source_id, external_id) do nothing` inserts 0 rows. The same SKU at a second banner is allowed.
  - Labels: 10 rows, and no OFF tag is shared between labels.
  - `products_with_source_url` rebuilds `https://world.openfoodfacts.org/product/0036000291452`, and a stored URL wins.
  - `product_ownership_chain`: P → X → C, with ultimate parent A at depth 2 and path `{C,B,A}`. A product with no brand gets a row with null links.
  - anon: sees 2 of 4 products (the active ones), the full chain, labels, categories and identifiers, and the approved mapping but not the pending one. Gets `42501` reading `product_sources` and inserting products.
  - Non-admin user: sees 2 products, 0 `product_sources` rows and no pending mapping. Gets `42501` inserting a product or a label, and updates or deletes 0 rows.
  - Admin: sees all 4 products and the `product_sources` rows, inserts a category and a `product_sources` row, approves a mapping, updates a product, and deletes an identifier.
- Afterwards: 0 rows in the new tables (except the 10 labels) and 0 test users.
- `relrowsecurity` is true on all 19 public tables.
- Advisors:
  - Security: only the existing leaked-password warning.
  - Performance: only INFO "unused index" notices on the empty tables.
- `npm run typecheck`, `lint` and `test` (27 tests) pass, and Prettier is clean.

**Notes for you**
- I added two plan lines. **P2.7** also adds `ai_call_id` to `category_mappings`. **P2.10** must pass the same GTIN vectors as `supabase/tests/products.sql`.
- Anon sees only `active` products, as DATA_MODEL says, so a discontinued product disappears from the app. If you'd rather keep showing discontinued products, for example for old scans, that's a one-line policy change. Tell me.
- The `labels` seed goes slightly beyond the three codes DATA_MODEL names: I added 7 more ethics labels (D-035).

**Next:** P2.6 Schema: stores and prices.

---

## 2026-10-28 — P2.4 Schema: ownership

**What changed**
- The migration `20261028225008_catalog_ownership` is applied to dev. It adds:
  - `companies` and `brands`: slug keys, unique `wikidata_qid` (and `sec_cik` for companies), merge columns, `locked_fields`, trigram GIN indexes on `normalize_match_text(name)`, and public read except `rejected`;
  - `company_ownership`: a cycle-rejecting trigger, and one current approved controlling parent per company;
  - `brand_ownership`: one current approved `owner` / `private_label_of` per brand, and `match_candidate_id` → `match_candidates`;
  - `banners`: fully public;
  - the views `brand_current_owner` and `company_ultimate_parent`, both `security_invoker`.
- All five tables carry the `+prov` block. The edges also carry `+review`. Every foreign key is indexed. Writes are admin-only, with one policy per command.
- `supabase/tests/ownership.sql` holds the checks (rolled back).
- `supabase/README.md` has the reusable `+prov` snippet and the migration row.
- The types are regenerated. The diff adds lines only.
- D-034 records the design choices.

**Verification**
- RLS script: **40/40 ok**.
  - Cycles: B→A after A→B, and C→A across A→B→C, are rejected with `23514`. A rejected B→A can be stored, but reopening it as `pending` is rejected with `23514`. A self edge is rejected with `23514`.
  - Duplicate keys: a duplicate edge with a null `valid_from` → `23505`, and `on conflict … do nothing` on the edge key inserts 0 rows.
  - A second current approved controlling parent → `23505`. A second current approved brand owner → `23505`, but a pending competing owner is allowed.
  - Rejected with `23514`: an `ai` edge without `confidence`, an `auto` decision with a `reviewed_by`, `valid_to` before `valid_from`, `merged` without `merged_into_id`, a `Bad Slug`, and `method = 'scraper'`. A missing `fetched_at` → `23502`.
  - `company_ultimate_parent`: C → A at depth 2, with path `{C,B,A}`. A is its own top parent at depth 0, because a minority stake isn't walked. `brand_current_owner` maps X → C.
  - anon: sees 4 of 5 companies (not the rejected one) and only the 2 approved company edges, and doesn't see the pending company or brand edge. Walks C up to A. Gets `42501` on insert and on update.
  - Non-admin user: sees 4 companies and no pending edges. Gets `42501` inserting a brand or a banner, and updates or deletes 0 rows.
  - Admin: sees all 5 companies and the pending edges, inserts a banner, approves a brand edge, updates a company, and deletes an edge.
- Afterwards: 0 rows in all five tables and 0 test users.
- `relrowsecurity` is true on all 13 public tables.
- Advisors:
  - Security: only the existing leaked-password warning.
  - Performance: only INFO "unused index" notices on the empty tables.
- `npm run typecheck`, `lint` and `test` (27 tests) pass, and Prettier is clean.

**Notes for you**
- I added one line to **P2.7**: add `ai_call_id` to the two edge tables once `ai_calls` exists.
- I made two choices that go slightly beyond DATA_MODEL (D-034). A company can have at most one current approved controlling parent, and `private_label_of` counts as ownership in the one-owner rule.

**Next:** P2.5 Schema: products.

---

## 2026-10-28 — P2.3 Schema: matching and review

**What changed**
- The migration `20261028223450_catalog_matching_review` is applied to dev. It adds:
  - `match_candidates`: unique on `(kind, subject_id, candidate_id, match_method_version)`. Checks cover the kind's subject and candidate tables, the score range, the `match_method` list plus `rule:<name>`, `features` ≤ 1 KB, and decision consistency.
  - `review_queue`: one open row per item, `item_id` shaped like a uuid or bigint, priority 0–100, resolution consistency.
  - Both are admin-only RLS with explicit grants, and every foreign key is indexed.
- `supabase/tests/matching_review.sql` holds the RLS and constraint checks (rolled back).
- `supabase/README.md` has the reusable `+review` block (columns, check, index, and the two select policies) and the migration row.
- The types are updated with the generated `match_candidates` and `review_queue` blocks. The rest of the generated output is unchanged.
- D-033 records the design choices.

**Verification**
- RLS script: **24/24 ok**.
  - Duplicate `(kind, subject, candidate, version)` → `23505`. The same pair with a new method version is allowed.
  - Rejected with `23514`: a kind/type mismatch, a score of 1.2, `match_method = 'guess'`, `accepted` without `decided_at`, `auto` with a `decided_by`, `features` over 1 KB, a malformed `item_id`, and `done` without `resolved_at`.
  - Accepted: `rule:strip-suffix`.
  - A second open queue row for the same item → `23505`.
  - anon: `42501` on both tables and on insert.
  - Non-admin user: sees 0 rows, gets `42501` on both inserts, and updates 0 rows.
  - Admin: reads both tables, accepts a candidate, resolves a queue row, re-queues the resolved item, and deletes a row.
- Afterwards: 0 candidates, 0 queue rows and 0 test users.
- The `+review` snippet, checked on a throwaway table in a rolled-back transaction:
  - `approved` without a decision is rejected;
  - `pending` with a `decision_method` is rejected;
  - anon and a plain user each see only the 2 approved rows.
- `relrowsecurity` is true on all 8 public tables.
- Advisors:
  - Security: only the existing leaked-password warning.
  - Performance: only INFO "unused index" notices (7 new, on the empty tables).
- `npm run typecheck`, `lint` and `test` (27 tests) pass, and Prettier is clean.

**Next:** P2.4 Schema: ownership (companies, brands, ownership edges, banners).

---

## 2026-10-28 — P2.2 Seed `sources` from SOURCES.md

**What changed**
- The data migration `20261028221731_seed_sources` is applied to dev. It upserts 35 rows on `key`:
  - S1–S30, one row each. The 17 avoided sources are `enabled = false`. S24 is one umbrella row (`rss-publishers`), also disabled; each feed gets its own row later.
  - the internal sources `manual`, `legacy-import`, `receipts`, `derived` and `fixture` (`access_method = internal`, verdict `use`).
- Rows are only touched when a mirrored column differs, so re-running changes nothing.
- `url_template` is set for S1, S2 (OFF product pages) and S17 (Wikidata entities). Rate limits use published limits where they're stricter than 1 req/s.
- D-032 records the keys, the S24 umbrella row, the rate limits, and the internal-source and attribution notes. The `supabase/README.md` migration table and the SOURCES.md §1 mirror line are updated.
- No schema change, so the types are unchanged.

**Verification**
- Count by verdict, S-id rows only: **use 10** (S1, S2, S5, S6, S17, S19, S20, S21, S23, S24), **manual_only 3** (S27–S29), **avoid 17**. Total 30, matching SOURCES.md §1. All of S1–S30 are present exactly once. Internal rows: 5. Enabled: 17 (0 avoided).
- Re-ran the migration's SQL through `execute_sql`, with a before/after snapshot of `xmin` and `updated_at`: **35 rows before, 35 after, 0 changed**.
- As `anon`:
  - `source_attributions` returns 18 rows (10 use + 3 manual_only + 5 internal), 0 of them avoided;
  - the base table returns 35 rows (public-read, D-031).
  - Sample: `off` → ODbL 1.0, `https://opendatacommons.org/licenses/odbl/1-0/`, "Product data from Open Food Facts …"; `statcan-18100245` → "Source: Statistics Canada, Table 18-10-0245-01 …".
- Advisors: no new findings (only the existing leaked-password-protection warning and the 4 INFO unused-index notices).
- The P2.1 RLS script only counts `rls-test-%` keys, so the seeded rows don't affect it.

**For you:** internal sources pass the `source_attributions` filter, so the About screen should list only rows with `attribution_text` (noted in D-032).

**Next:** P2.3 Schema: matching and review.

---

## 2026-10-28 — P2.1 Schema: pipeline bookkeeping, shared SQL helpers, `raw` bucket

**What changed**
- The migration `20261028200133_catalog_pipeline_bookkeeping` is applied to dev. It adds:
  - the extensions `pg_trgm` and `unaccent`;
  - `public.normalize_match_text()` and the `public.slug` domain;
  - the tables `sources` (public read, admin write), plus `ingestion_runs`, `ingestion_run_events`, `raw_objects` and `validation_failures` (admin only);
  - the view `source_attributions`;
  - the private `raw` bucket (gzip only, 50 MB per file, admin read).
- `supabase/tests/pipeline_bookkeeping.sql` holds the RLS and constraint checks (rolled back). `supabase/README.md` has a new Tests section and migration row.
- The types are regenerated.
- D-031: `sources` is public-read on every column, a change from DATA_MODEL §3.1, and the extra checks are listed. DATA_MODEL §3.1 and the P2.2 verification line are updated to match.

**Verification**
- RLS script: **27/27 ok**.
  - Helpers:
    - `normalize_match_text('  Ben’s  ÉPICERIE ')` returns `ben's epicerie` (`unaccent` maps ’ to ').
    - The slug check rejects `Bad Slug` and 65 characters, and accepts `bens-original`.
  - Constraints: an enabled `avoid` source, a rate above 1 req/s, and a `running` run with `finished_at` are all rejected (`23514`).
  - anon:
    - reads `sources` (2 rows); the attribution view hides the avoided one (1 row);
    - can't insert into `sources`;
    - is denied (`42501`) on all 4 bookkeeping tables;
    - sees 0 objects in the `raw` bucket.
  - Non-admin user:
    - reads `sources`, but can't insert (`42501`) or update (0 rows);
    - sees 0 bookkeeping rows and can't insert a run;
    - sees 0 objects in `raw`.
  - Admin:
    - reads all 4 tables;
    - updates a run and inserts an event;
    - inserts, updates and deletes a source;
    - sees the 1 test object in `raw`.
- Afterwards: 0 sources, 0 runs, 0 test users and 0 objects in `raw`, so the rollback left nothing.
- `relrowsecurity` is true on all 6 public tables.
- Advisors:
  - Security: no new findings. Only the existing Auth "leaked password protection" warning remains, which is a dashboard setting.
  - Performance: 4 INFO "unused index" notices on the new empty tables, which is expected.
- `npm run typecheck`, `lint` and `test` (27 tests) pass, and Prettier is clean.

**Next:** P2.2 Seed `sources` from SOURCES.md.

---

## 2026-10-28 — P2.0 Refine Phase 2 into session-sized tasks

**What changed**
- PLAN Phase 2 now has full detail: milestones M1–M7, feature slices, shared rules for the `schema` tasks, 19 tasks P2.1–P2.19, and a coverage table.
  - Schema: 8 domain migrations (P2.1, P2.3–P2.9) plus the `sources` seed (P2.2).
  - Core: P2.10 (record schemas, slug, GTIN) and P2.11 (validation, safeguards).
  - Pipeline: P2.12–P2.17 (runtime, HTTP client, raw store, driver, upserts, CLI with the fixture source and the run-twice e2e).
  - P2.18 is the legacy re-import, and P2.19 is the exit check with the DB size against BUDGET.
- Phase 4 outline: GTIN normalization now arrives in Phase 2, and Phase 4 extends it.
- D-030 records the choices: migration order follows foreign keys; `banners` moves to the ownership migration; GTIN is moved forward; the sources seed is a migration; legacy scores go under a `legacy` rubric; dev-DB tests are skipped in CI; no `tsx`.

**Verification**
- A script over the Phase 2 section:
  - all 19 tasks have Slice, Goal, Deps, In, Out, Files and Verification;
  - each task's slice is one of the 12 listed;
  - M1–M7 each map to at least one task;
  - there are no dangling P2 deps.
  - Result: 0 problems.

**Open 🟡 decisions** (none block Phase 2)
- P5: the scope of the GitHub token for triggering runs from the admin portal.
- P7: rubric v1 approval; the auto-publish rule (D-006).
- P8:
  - receipt-price consent and privacy wording, and the k-anonymity floor;
  - product grades derived from company scores, or kept per product;
  - community submissions.
- P10: web hosting; Android distribution (Play Store $25); a paid Supabase tier near the 400 MB alarm.

**Next:** P2.1 Schema: pipeline bookkeeping, shared SQL helpers, `raw` bucket.

---

## 2026-10-28 — P1.17 Allow the `sarvis://` auth redirect (owner)

**What changed**
- In the dev project's dashboard (Authentication → URL Configuration → Redirect URLs), the owner added `sarvis://**`.
- PLAN ticked. D-028's allow-list note is updated.

**Verification**
- A temp dev user, then `npm run dev:recovery-link -- --redirect sarvis://`, then a GET on the link with redirects off: `303 See Other`, `Location: sarvis://#access_token=…&refresh_token=…&type=recovery`. In P1.15 the same check went to `http://localhost:3000#…`. The temp user was deleted.
- `curl -sI` (a HEAD request) printed no `Location` header, so the check uses a GET (`curl -s -o /dev/null -D -`). The PLAN verification line is updated to match.

**Next:** P2.0 Refine Phase 2 into session-sized tasks.

---

## 2026-10-28 — P1.16 Signed-out deep link to a guarded route shows a dev warning

**What changed**
- No code change. The warning is React Navigation's expected dev-only `console.error` for a deep link into a `Stack.Protected` route that is shut at that moment. The landing is still correct. **D-029** has the source, why it's harmless, and the Phase 8 option (`UNSTABLE_routeNamesChangeBehavior: 'lastUnhandled'`, which would also open the target after sign-in).
- `app/src/app/_layout.tsx`: added a header comment pointing to D-029.

**Verification (Android, Pixel_10_Pro, Expo Go)**
- **Signed out:**
  - `/settings` (cold start) → `/auth` (`.screenshots/p1.16-android-signed-out-settings.png`).
  - `/admin` sent to the open app → `/auth` with the LogBox warning (`p1.16-android-signed-out-admin-warning.png`).
  - Metro logged the error twice for these signed-out links: once after a link that made Expo Go reload (no toast), and once for `/admin` (with a toast). It also logged it once in P1.15, for the recovery link to `/`.
- **Signed in** (temporary dev user, deleted afterwards):
  - `/settings` → Settings (`p1.16-android-signed-in-settings.png`).
  - `/admin` → Impact, because admin is web-only (`p1.16-android-signed-in-admin-to-tabs.png`).
  - Neither link logged the error.
- The source was read in `node_modules/@react-navigation/core/src/useNavigationBuilder.tsx` (the `NODE_ENV !== 'production'` guard) and in `types.tsx` (the documented `'firstMatch'` / `'lastUnhandled'` behaviours).
- typecheck, lint and format:check exit 0. The emulator is signed out.

**Things you should know**
- If you ever see this warning for a **signed-in** deep link, that is a real bug: the route is probably missing from the signed-in guard.

**Next:** P1.17 is your dashboard step (add `sarvis://**` to the dev project's redirect URLs). P2.0 (refine Phase 2) can start now.

---

## 2026-10-28 — P1.15 Password reset: handle the recovery link

**What changed**
- **Auth links read by the app (D-028):**
  - `lib/auth/redirect.ts`: `parseAuthRedirect`, with unit tests.
  - `service.ts`: `completeAuthRedirect` (calls `setSession` from the link) and `updatePassword`.
  - `supabase.ts`: `detectSessionInUrl: false`.
  - `AuthProvider`: reads the opening URL (web: page URL; native: `getInitialURL` plus `url` events) before guards run, and exposes `recovering`, `finishRecovery`, `linkError` and `clearLinkError`. The recovering user id is kept in AsyncStorage so a reload stays on the reset screen. On web, tokens are removed from the address bar.
- **Root layout:** a third guard. While `signedIn && recovering`, only `reset-password` is open; the app routes need `signedIn && !recovering`.
- **`/reset-password`:**
  - "Set a new password" for `<email>`, a new-password field (≥ 8 characters), Save, and "Cancel and sign out". testIDs: `screen-reset-password`, `reset-password-input` and `-input-toggle`, `-submit`, `-error`, `-cancel`.
  - Saving shows a "Password updated" alert and opens the app.
- **`/auth`:** shows link errors (used or expired) with the new copy "That link has expired. Email links work once and expire after an hour. Request a new one below."
- **`errors.ts`:** new mappings for "email link is invalid or has expired" and "auth session missing".
- **Shared field:** `components/ui/PasswordField.tsx` and `authInputStyle.ts` are used by both auth screens. The `/auth` testIDs are unchanged.
- **Dev script:** `npm run dev:recovery-link` (`scripts/dev-recovery-link.ts`, dev project only) prints a recovery link without sending email. `e2e/tsconfig.json` gained `allowImportingTsExtensions`, because Node's type stripping needs `.ts` import paths.
- **E2E:** `auth.spec` has a new "password reset" describe with `RESET_USER` (`e2e-reset@example.com`).
- **Docs:** D-028 added, a Commands row added, and new owner task **P1.17** (the `sarvis://` redirect).

**Verification**
- **Redirect probe (dev, generateLink then verify with redirects off):**
  - `http://localhost:8081/` → `303 http://localhost:8081/#access_token=…&type=recovery`;
  - `exp://127.0.0.1:8081/--/` → same, with the `exp://` URL;
  - `sarvis://` → falls back to `http://localhost:3000#…`. Not allowed yet (P1.17).
- **Unit tests:** `npm test` passes 27 (4 new parser tests and 1 new error-mapping test). typecheck, lint and format:check are clean.
- **`npm run e2e`:** 28/28 passed (43.7 s), including the 2 new tests:
  - **Reset link:** opens Set a new password with the email shown and no `access_token` left in the URL. A fresh page load of `/settings` stays on the reset screen. Too short → "Your password needs at least 8 characters." Saving shows the alert, then Impact. After sign-out, the old password fails ("Incorrect email or password.") and the new one signs in.
  - **Cancel and reuse:** Cancel signs out to `/auth`. Reopening the same link shows the expired-link error, and the URL is cleaned. Typing clears the error. No unexpected console errors.
- **Web (Playwright MCP):** the link from `npm run dev:recovery-link` opened `/reset-password` (`.screenshots/p1.15-web-reset.png`), with no console errors or warnings.
- **Android (Pixel_10_Pro, Expo Go):** the link from `npm run dev:recovery-link -- --redirect exp://127.0.0.1:8081/--/` opened in **Chrome** (as tapping it in an email would), went through Supabase, and landed on Set a new password (`p1.15-android-reset.png`). Saving `New-pass-115` showed "Password updated", then Impact. I signed out and signed in with the new password, which reached Impact (`p1.15-android-new-password-signed-in.png`).
- The throwaway users (`p115-manual`, `p115-probe`) were deleted from dev. The emulator is signed out.

**Things you should know**
- **Owner action, P1.17:** add `sarvis://**` under Supabase → Authentication → URL Configuration → Redirect URLs (dev project). Until then, email links opened from a dev or release build go to `localhost:3000`. Expo Go and web are fine.
- **P1.16's LogBox warning** ("The 'state' or 'screen' passed in the params couldn't be applied…") also shows when a recovery link opens the app on Android. The flow still works.
- **Stale hot reload:** an Expo Go app left open from earlier showed "Property 'PasswordField' doesn't exist" after the `auth.tsx` edit. A fresh load was fine. If you see this, reload the app.
- **Chrome on the emulator:** its first-run screen intercepted the first link; I chose "Use without an account".
- **Metro:** the one started in P1.13 is still the server on :8081. Only its npm wrapper was killed, so `npm run web` reports the port as in use.

**Next:** P1.16 signed-out deep-link warning (P1.17 is an owner task, then P2.0).

---

## 2026-10-28 — P1.13 Phase 1 exit check

**What changed**
- `e2e/account-deletion.spec.ts`: added `test.slow()`. The test does six `networkidle` page loads, about 19 s on its own. With 4 workers the dev server queued them past the 30 s limit, and it failed 2 of 5 full runs. This is a Phase 1 test-stability gap, not a product bug.
- CLAUDE.md Commands: the Install row now gives `npm ci` for a clean checkout and says to copy `.env.example` to `.env`. "Run a scraper on a sample" now reads "TBD (Phase 2)".

**Exit checklist (commit `6301685` plus this fix)**
- [x] **Clean checkout:** a fresh `git clone` from GitHub into the scratchpad, then `npm ci` (1 min). In the clone, `typecheck`, `lint` and `format:check` exit 0, and `npm test` passes 22. `npm run db:types` prints its steps. The `supabase-dev` `generate_typescript_types` output matches the committed `database.types.ts` (`profiles`, `admin_ping`, `delete_own_account`, PostgREST 14.18).
- [x] **Commands needing `.env`:** web, e2e, test user and Android ran from the main checkout at the same commit. Reading or copying `.env` is blocked for the agent by a deny rule, so the clone had no `.env`.
  - `npm run web`: started fresh on :8081, returns 200.
  - `npm run e2e`: **26/26 passed on 3 runs in a row** (about 57 s each) after the fix.
  - `npm run dev:test-user`: created `p113-exit@example.com`.
  - Android: the "Metro already running" route from the table (`adb reverse` + `am start exp://127.0.0.1:8081/--/…`).
- [x] **The app runs on web and Android; email sign-in works:**
  - Web (Playwright MCP, 390 × 844): sign-in → Impact, no console errors or warnings (`.screenshots/p1.13-web-signed-in.png`).
  - Android (Pixel_10_Pro): sign-in → Impact (`p1.13-android-signed-in.png`).
- [x] **Android account deletion:**
  - Settings → Delete my account shows "Delete your account?" with **Cancel / Continue** (`p1.13-android-delete-confirm1.png`). Cancel stays on Settings.
  - Continue shows "This is permanent" with **Keep my account / Delete permanently** (`p1.13-android-delete-confirm2.png`). Keep stays on Settings.
  - Confirming both shows "Deleting…" and lands on `/auth` (`p1.13-android-after-delete.png`).
  - SQL on dev: 0 rows for that user id in both `auth.users` and `public.profiles`.
- [x] **Non-admins can't open `/admin`:**
  - Web, signed in as the non-admin: "Not authorised" (`p1.13-web-admin-denied.png`). The only console error is the expected 403 from `admin_ping`.
  - `e2e/admin-gate.spec` (in the 26) covers signed-out, user and admin.
- [x] **CI is green:** the latest run on `main` succeeded (P1.12: https://github.com/LukaMS/sarvis/actions/runs/40743405031). This commit's run is checked after the push.
- [x] **Commands table:** filled in. The diff is the two rows above.

**Things you should know**
- The Metro server that was already running at the start stopped on its own partway through. I started a new one with `npm run web`. Later, Claude Code stopped its npm wrapper while memory was low; the Metro process itself kept running (see P1.15).
- On Android, one tap on Sign In while the keyboard was opening only closed the keyboard; the next tap signed in. `auth.tsx` already has `keyboardShouldPersistTaps="handled"`, the same as legacy, so this looks like a tap during the keyboard animation, not a bug. No task added.
- The emulator is signed out (the throwaway user was deleted).

**Next:** P1.15 Password reset (P1.14 stays skipped per D-015), then P1.16, then P2.0.

---

## 2026-10-28 — P1.12 Web-only `/admin` route group gated by role

**What changed**
- Migration `20261028174807_admin_ping.sql`, applied to dev: `public.admin_ping()` (security invoker, `search_path = ''`, `EXECUTE` for `authenticated` only) returns `true` for admins and raises `42501 Admin only` otherwise. Types regenerated, and `supabase/README.md` lists it.
- `(admin)` route group:
  - `_layout.tsx` (native) redirects to the tabs;
  - `_layout.web.tsx` is the gate. It calls `checkIsAdmin()` (`lib/admin.ts`) and shows a spinner, then either "Not authorised" with "Back to home", a retryable error, or the page;
  - `admin/index.tsx` lazy-loads `components/admin/AdminHome.tsx` (`testID="admin-home"`).
- The root layout lists `(admin)` inside the signed-in guard.
- `ensureTestUser` / `npm run dev:test-user` take `role` / `--role user|admin`. E2E global setup creates `e2e-admin@example.com` as admin and resets the other e2e users to `user`.
- New `e2e/admin-gate.spec.ts`. `playwright.config.ts` now runs **4 workers** (see below).
- **D-027** records the decisions. Added **P1.16** (a signed-out deep-link warning on Android that predates this task).

**Verification**
- **`npm run e2e`:** 26 passed (`--workers=4` ×3, then once more through `npm run e2e` with the new config). `admin-gate.spec`:
  - signed out, `/admin` → `/auth`;
  - the normal (shell) user sees "Not authorised", the page's `admin_ping` gets a 403, and a direct PostgREST call with the user's token returns 403 `{code: 42501, message: "Admin only"}`. "Back to home" goes to Impact;
  - the admin user sees `admin-home` with their email, and a direct call returns 200 `true`;
  - no console errors apart from the expected 403.
- **SQL (dev):** `prosecdef=false`, `search_path=""`, anon/public can't execute, authenticated can. In-transaction calls with JWT claims:
  - user → `42501 Admin only`;
  - admin → `true`;
  - no `sub` → `42501 Admin only`;
  - anon → `permission denied for function admin_ping`.
- **`get_advisors` (security):** only the old project-wide "Leaked password protection disabled" warning.
- **Lazy chunk:** `npx expo export -p web` (to scratchpad) outputs `entry-….js` (1.9 MB, contains the gate but not `admin-home`) and `AdminHome-….js` (1 KB, the admin page). No `SERVICE_ROLE` reference in the export or in `app/src`.
- **Android (Pixel_10_Pro):** signed in as `e2e-android@example.com`. The `/settings` deep link opened Settings, then the `/admin` deep link landed on the Impact tab (`.screenshots/p1.12-admin-deeplink-android.png`). Signed out, `/admin` → `/auth`.
- **Web screenshots:** `.screenshots/p1.12-admin-denied-web.png` and `p1.12-admin-home-web.png`. The only console error is the denied page's expected 403.
- typecheck, lint and format:check exit 0. `npm test`: 22 passed.

**Things you should know**
- **E2E now runs 4 workers.** With the emulator up and the default 8 workers, `auth.spec`'s sign-in/reload test and `account-deletion.spec` timed out at 30 s even with the new spec excluded. The single-threaded dev SSR queued page loads for about 5 s each. At 4 workers the suite is green and faster.
- **Restart Metro after adding a route group.** A running dev server served `/admin` as 404 (SSR) and "Unmatched Route" (client) until restarted. This is noted in the CLAUDE.md e2e row.
- **New P1.16:** on Android, signed out, deep links to guarded routes (e.g. `/settings`) land on `/auth` but show a dev LogBox warning ("The 'state' or 'screen' passed in the params couldn't be applied…"). It predates P1.12.
- The admin check is a gate for the UI. Phase 5 admin data must still be protected by RLS on `private.is_admin()`.
- `e2e-android@example.com` was given a new password for the Android check, and the emulator is signed out again.

**Next:** P1.13 Phase 1 exit check.

---

## 2026-10-27 — P1.11 Account deletion RPC and the Settings action

**What changed**
- Migration `20261027205021_delete_own_account.sql`, applied to dev:
  - `private.delete_own_account()` is security definer with `search_path = ''`. It deletes `auth.users` for `auth.uid()`, which cascades to `profiles`, and raises if there is no uid.
  - `public.delete_own_account()` is a security-invoker wrapper, so the app can call it with `rpc()`.
  - Both have `EXECUTE` revoked from `public` and `anon` and granted to `authenticated`.
  - Types regenerated (`Functions.delete_own_account`), and `supabase/README.md` lists the migration.
- `deleteAccount()` in `lib/auth/service.ts` calls the RPC, then signs out locally.
- New `lib/dialogs.ts` (`confirmAsync` / `showAlert`): `window.confirm` on web, because RN Web's `Alert` does nothing, and `Alert.alert` on native.
- The Settings placeholder gets a Danger zone with "Delete my account", two confirmations with the legacy copy, and an error alert. `Button` `destructive` now also styles the primary variant (an `errorContainer` pill).
- E2E: new `e2e/account-deletion.spec.ts`. `signIn` and `collectConsoleErrors` moved from `auth.spec` to `e2e/helpers.ts`. **D-026** records the decisions.

**Verification**
- **SQL** (dev, in a rolled-back transaction with two inserted users A and B; 0 rows left afterwards):
  - the trigger created both profiles;
  - anon calling `public.delete_own_account()` → "permission denied for function";
  - anon calling `private.delete_own_account()` → "permission denied for schema private";
  - authenticated with no `sub` → "Not authenticated";
  - after A's call, A has 0 `auth.users` rows and 0 profiles, and B still has 1 and 1;
  - public is `secdef=false`, private is `secdef=true`, and both have `search_path=""`.
- **`get_advisors` (security):** nothing for the new functions. The only warning is the project-wide "Leaked password protection disabled" Auth setting, which was already there and needs a paid plan.
- **`npm run e2e`:** 23 passed on each of 3 runs in a row. `account-deletion.spec`:
  - creates `e2e-delete@example.com`, signs in and opens Settings;
  - cancel at step 1 does nothing, and "Keep my account" at step 2 does nothing;
  - confirming both lands on `/auth`, which survives a reload;
  - signing in again shows "Incorrect email or password.";
  - the only failed requests are `403 /auth/v1/logout` (expected, D-026) and `400 /auth/v1/token`.
  - SQL afterwards: 0 `e2e-delete` users and 0 orphan profiles.
- **Web screenshot:** `.screenshots/p1.11-settings-danger-web.png` matches the Danger zone card in `docs/baseline/web/28-settings-danger.png`. 0 console errors or warnings.
- typecheck, lint and format:check all exit 0.

**Things you should know**
- **Android wasn't checked.** PLAN doesn't require it for this task, but the native `Alert` path is untested on a device. The adb server from yesterday was wedged, with about 30 adb clients queued. I killed adb and restarted it, and the emulator reconnected, but then even `screencap` hung. The emulator itself (running since 2026-10-26 15:00) probably needs a cold restart. I added the check to **P1.13**.
- A stale Expo web server from an earlier session (started 16:37) was still on :8081 and serving an old bundle, which made the first e2e run fail. I stopped it. If e2e shows old UI, check what's on :8081.

**Next:** P1.12 Web-only `/admin` route group gated by role.

---

## 2026-10-27 — P1.10 Email sign-up, sign-in, sign-out and AuthGate

**What changed**
- `app/src/lib/supabase.ts` (one client, publishable key, AsyncStorage on native, `detectSessionInUrl` on web only), `lib/auth/AuthProvider.tsx` (`useAuth`), `lib/auth/service.ts` (sign up / in / out, resend, reset email), `lib/errors.ts` (legacy error mapping, plus 6 unit tests).
- AuthGate: the root layout wraps everything in `AuthProvider`, shows a spinner until the session is read, then uses `Stack.Protected` guards (signed out → `/auth`; signed in → tabs). `/dev/*` routes are ungated.
- `/auth`: port of legacy (sign-in/sign-up toggle, optional display name, show/hide password, ≥ 8 characters, mapped errors, "Check your inbox" + resend, Forgot password). Profile placeholder shows the email and a Sign Out button.
- `scripts/dev-create-test-user.ts` + `npm run dev:test-user` (dev project only).
- E2E: `e2e/global-setup.ts` + `e2e/users.ts` (test users, saved session), new `e2e/auth.spec.ts`. The other specs now run signed in.
- App scripts load the repo-root `.env`. New dependencies: `@supabase/supabase-js`, `@react-native-async-storage/async-storage` (**D-025**).
- Added **P1.15** (password-reset screen) to PLAN.md. "Forgot password?" sends the email, but nothing handles the link yet (legacy had the same gap).

**Verification**
- **`npm run e2e`:** 22 passed on each of 3 runs in a row. `auth.spec`:
  - signed out, `/` and `/product/sample` show `/auth`;
  - a wrong password shows "Incorrect email or password. …";
  - a valid sign-in lands on Impact, survives a reload, and `/auth` sends you back to the tabs;
  - Profile → Sign Out returns to `/auth` and stays there after a reload;
  - sign-up validation: empty email, bad email, missing password, short password, and errors clear on edit and on mode switch.
  - No console errors (except the expected 400 from the wrong-password request).
- **SQL (dev):** both e2e users exist, are confirmed, and have a `profiles` row created by the trigger (`display_name` "E2E Shell" / "E2E Auth", `role` user).
- **Web screenshots** (`.screenshots/p1.10-auth-sign-in-web.png`, `p1.10-auth-sign-up-web.png`) match `01-auth-sign-in.png` / `02-auth-sign-up.png` apart from the "Sarvis" name. 0 console errors or warnings.
- **Android (Pixel_10_Pro):**
  - `p1.10-auth-sign-in-android.png` and `p1.10-auth-sign-up-android.png` match the Android baselines.
  - Signed in as `e2e-android@example.com` (created with `npm run dev:test-user`) → tabs (`p1.10-signed-in-tabs-android.png`). A force-stop and relaunch stayed signed in. Profile → Sign Out returned to `/auth`.
  - The first attempt showed the mapped wrong-password error: the emulator's typing had swapped two characters (an adb race, not the app).
- **Service-role key:** `grep` finds nothing in `app/`. The served web bundle doesn't contain the key; its only `sb_secret_` strings are supabase-js comments and a prefix check.
- typecheck, lint, `npm test` (22 passed) and format:check all exit 0.

**Things you should know**
- I can't read or write `.env` or `.env.example` (deny rules). You created `.env`; the test user script and e2e read it. `.env.example` already lists the three variables (P1.1), but I couldn't open it to confirm the wording.
- **E2E now needs `.env`** with the dev service-role key, because global setup creates the test users. It still isn't run in CI.
- Three test users now exist on the dev project: `e2e-shell@`, `e2e-auth@` and `e2e-android@example.com`.

**Next:** P1.11 Account deletion RPC and the Settings action.

---

## 2026-10-27 — P1.9 App shell: tabs, stack routes and headers as placeholders

**What changed**
- `app/src/app/(tabs)/`: Impact (`index`), Scan, Search, History, with legacy icons (leaf, barcode-scan, magnify, history), labels and screen-reader labels.
- Stack placeholders: `product/[id]`, `company/[id]`, `story/[id]`, `receipt/[id]`, `receipt-scan`, `receipt-results`, `stories`, `profile` (modal), `settings`, `privacy`, `help`, `about`. The four detail routes export `RouteErrorBoundary`.
- `app/src/components/navigation/TabBar.tsx` (tab list and styling) and `PlaceholderScreen.tsx` (tab and stack placeholders). Root layout sets the headers per THEME.md (**D-024**).
- Impact placeholder: wordmark, profile button (opens the modal), StatusBarScrim, and links to every stack route until Phase 8.
- Removed `app/src/app/index.tsx` (P1.2 placeholder). `e2e/smoke.spec.ts` now checks the Impact wordmark. New `e2e/navigation.spec.ts`.
- No new dependencies.

**Verification**
- **Web (Playwright MCP, 390 × 844):** `.screenshots/p1.9-impact-web.png`, `p1.9-product-web.png`, `p1.9-story-web.png`. 0 console errors or warnings.
  - Tab bar vs `docs/baseline/web/03-home.png`: white bar, rounded top corners, hairline border, active leaf + label in primary, inactive grey. Same as legacy, including the labels clipped at the bottom edge on web.
  - Header vs `13-product.png`: surface background, "Product Details" in primary, hairline under the header. Opened from the tab, so it also has the back arrow.
  - Story: transparent header with a white back arrow over the cover band.
- **Android (Pixel_10_Pro, Expo Go):** `.screenshots/p1.9-impact-android.png`, `p1.9-product-android.png`.
  - Matches `android/03-home.png` (tab bar, wordmark row, profile icon) and `android/13-product.png` (back arrow, title, header shadow).
  - Tapped History, Scan, Search and Impact: each shows `screen-<tab>` and Android reports the tab as `selected`. Product link → Product Details; back arrow → Impact. Profile button → modal with "Profile" header and Navigate up.
- **`npm run e2e` equivalent:** 18 passed, 3 runs in a row (see the server note below). The navigation spec presses all 4 tabs, opens all 12 stack routes by URL (`screen-<name>`, header heading, `id: sample` on dynamic routes) and checks back from Product returns to Impact. No console errors.
- typecheck, lint, `npm test` (16 passed) and format:check all exit 0.

**Things you should know**
- **An Expo web server from an earlier session was still running on :8081** (PID 37280, started 15:05). I wasn't allowed to stop it. Its route manifest predates the new files, so new routes 404 on a full page load there. I ran the e2e suite and the MCP checks against a fresh server on :8082 (temporary config, deleted). **Please restart the :8081 server** (Ctrl+C it, then `npm run web`); after that, plain `npm run e2e` will work. The :8082 server was stopped at the end of the session and `adb reverse` is back to 8081.
- **Expo typed-routes bug on Windows:** while a dev server runs, adding a file *outside* `src/app` (here `components/navigation/*`) puts bogus `/../components/...` routes into `app/.expo/types/router.d.ts`, and `npm run typecheck` then fails on `href="/"`. Expo checks `startsWith('../')`, but Windows paths use `..\`. Restarting the dev server regenerates the file correctly. I deleted the stale copy (gitignored). CI is unaffected.

**Next:** P1.10 Email sign-up, sign-in, sign-out and AuthGate.

---

## 2026-10-27 — P1.8 Interaction and state primitives

**What changed**
- New in `app/src/components/ui/`:
  - `PressableScale`
  - `Button` (primary / secondary / text, pill / block, icon, loading, disabled, destructive)
  - `FilterChips`
  - `Card`
  - `EmptyState`
  - `ErrorState` (plus the `FriendlyError` type)
  - `StatusBarScrim`
  - `RouteErrorBoundary`
  - Every interactive element takes a `testID`.
- Gallery: a section for each primitive, the scrim drawn over the screen, and a button that opens `/dev/error-boundary`. That's a new dev-only route that throws while rendering and exports `RouteErrorBoundary` as its `ErrorBoundary`.
- E2E:
  - `e2e/gallery.spec.ts` has 2 new tests: (1) presses and state, (2) the error boundary.
  - `e2e/helpers.ts` adds `tap()`.
- New dependency: `@expo/vector-icons` (**D-023**). No Reanimated or expo-linear-gradient yet. PressableScale uses RN `Animated`, and the scrim fade uses `react-native-svg`.
- Two files outside the plan's list, both needed for the verification: `app/src/app/dev/error-boundary.tsx` and `e2e/helpers.ts`.

**Verification**
- **Web (Playwright MCP, 390 wide):** `.screenshots/p1.8-gallery-web.png` (new sections) and `p1.8-error-boundary-web.png`. 0 console errors or warnings on the gallery.
  - Compared with `09-search-no-results.png`: the EmptyState (magnify 48 in `outlineVariant`, 16 / 600 title, 14 `outline` message), the filter chips (active `primary` / white, inactive `surfaceContainerLow`, 34 high, 13 / 600) and the Request pill (primary, + icon, 14 / 700) all match.
  - Compared with `11-history-barcode-filter.png`: the All / Barcode / Receipt chips match.
- **Android (Pixel_10_Pro, Expo Go):** `.screenshots/p1.8-gallery-android-{1,2,3}.png` and `p1.8-error-boundary-android.png`.
  - Tapping Primary counted 1, and Disabled stayed at 1. Tapping the Barcode chip moved the selection, and Android reports it as `selected`. Tapping the pressable card counted 1.
  - Content fades under the status bar (scrim).
  - "Open error test screen" showed RouteErrorBoundary (after dismissing the dev LogBox overlay).
- **`npm run e2e`:** 4 passed, and 4 of 4 on the final run.
  - The test presses Primary (0 → 1); presses on Disabled and Loading don't count.
  - Tapping the Barcode chip sets `aria-selected` and changes the label to "History filter: Barcode".
  - Card and retry counters go to 1. The not-retryable ErrorState has no retry button.
  - The boundary renders with Try again and Go back, and Go back returns to the gallery.
  - No console errors, except React's expected log of the deliberate error.
- typecheck, lint, `npm test` (16 passed) and format:check all exit 0.

**Things you should know**
- **The plan said "renders ErrorState"** for the boundary test. Legacy's RouteErrorBoundary has its own full-screen layout (not ErrorState), and the rebuild keeps that. The test checks that layout.
- **Android, dev only:** a caught render error also pops React Native's LogBox overlay. It's a development feature; release builds show only the boundary.

**Next:** P1.9 App shell: tabs, stack routes and headers as placeholders.

---

## 2026-10-27 — P1.7 Rating primitives and the component gallery route

**What changed**
- `app/src/components/ui/`:
  - `GradeBadge.tsx` (with `isRatedGrade`): sm/md/lg, plus a dashed "Not rated" or hidden state.
  - `RatingPill.tsx`: Good / Mixed / Poor, plus the dashed "Not rated" state.
  - `ScoreRing.tsx`: an SVG ring; unscored shows the track and "–".
  - `SectionHeader.tsx`: optional uppercase action with hitSlop.
  - All built to THEME.md using the P1.6 theme tokens, and each takes a `testID`.
- `app/src/app/dev/gallery.tsx`: dev-only `/dev/gallery` (redirects to `/` when `!__DEV__`).
- `e2e/gallery.spec.ts`: checks 99 testIDs, the text of a few of them, a press on the SectionHeader action, and 0 console errors.
- New dependency: `react-native-svg` 15.12.1 (**D-022**).
- `CLAUDE.md` Commands: Android deep-link command updated (`adb reverse` + `exp://127.0.0.1:8081/--/<route>`).

**Verification**
- **Web:** Playwright MCP at 390 × 844 → `.screenshots/p1.7-gallery-web.png`, plus `p1.7-gallery-web-tall.png` (390 × 2400, the whole gallery). 0 console errors and 0 warnings.
  - Compared with `13-product.png`: the B badge is olive at ~9% tint with weight 700, radius 6. The 78 ring is olive on an `outlineVariant` track, and the arc starts at 9 o'clock, as in the baseline.
  - Compared with `16-company.png`: Poor and Mixed pills have matching colours, radius 12 and 12 / 600 text.
- **Android:** Expo Go on the Pixel_10_Pro emulator → `.screenshots/p1.7-gallery-android.png` and `p1.7-gallery-android-bottom.png`. All variants render the same as on web. Tapping SEE ALL changed the counter to "Action pressed 1 times".
- `npm run e2e`: 2 passed (smoke and gallery). Run twice from a cold Metro start, and both runs passed.
- `npm run typecheck`, `npm run lint` and `npm test` (16 passed) all exit 0.

**Things you should know**
- **ScoreRing arc start:** legacy's arc starts at 9 o'clock (a side effect of rotate plus dash offset), and the rebuild copies it so it matches the baselines. If you'd prefer 12 o'clock, it's a one-line change, but it's a design change, so it's your call (D-022).
- **Android:** `exp://10.0.2.2:8081` reopened a stale cached bundle (sitemap listed only `index.tsx`). `adb reverse tcp:8081 tcp:8081` with `exp://127.0.0.1:8081/--/dev/gallery` loaded a fresh one. The Commands table is updated.

**Next:** P1.8 Interaction and state primitives.

---

## 2026-10-27 — P1.6 Theme tokens from THEME.md

**What changed**
- `app/src/theme/` holds the theme modules:
  - `colors.ts`: 27 used M3 roles, `AppColors` (3 used aliases plus 5 named hard-coded colours), `TintAlpha` and `withAlpha`;
  - `grades.ts`: the `Grade` type, `GRADE_THRESHOLDS`, `scoreToGrade`, `GradeColors` and `gradeToColor`;
  - `ratings.ts`: the `Rating` type, `RatingColors`, `RatingBgColors` and the to-colour helpers;
  - `radius.ts`, `spacing.ts`, `typography.ts` (13 type roles and `FontWeight`, system fonts), `elevation.ts` (tab-bar shadow and laser glow) and `index.ts`.
- `app/` is now a Vitest project (`app/vitest.config.mts`, and the root `vitest.config.ts` lists `app`).
- `app/src/theme/theme.test.ts` parses THEME.md and checks every token. It also has the `scoreToGrade` boundary tests.
- `docs/DECISIONS.md`: **D-021**.

**Verification**
- `npx vitest run --project app`:
  ```
  THEME.md token check
  m3             checked  27  missing 0  mismatched 0
  hardcoded      checked   6  missing 0  mismatched 0
  tint           checked   2  missing 0  mismatched 0
  grades         checked  28  missing 0  mismatched 0
  scoreToGrade   checked  14  missing 0  mismatched 0
  ratings        checked   8  missing 0  mismatched 0
  appColors      checked   4  missing 0  mismatched 0
  radius         checked   6  missing 0  mismatched 0
  typography     checked  36  missing 0  mismatched 0
  spacing        checked   7  missing 0  mismatched 0
  elevation      checked   9  missing 0  mismatched 0
  TOTAL          checked 147  failures 0
  Tests  14 passed (14)
  ```
- **scoreToGrade boundaries:** each threshold maps to its grade, threshold − 0.01 maps to the next grade, and 100 → A+, 0 → F, 9.99 → F. All pass.
- **Negative check:** changing `primary` to `#173808` gave `m3 … mismatched 1`, `Tests 1 failed`. After the revert, all 14 passed.
- `npm test` (3 files, 16 tests), `npm run typecheck`, `npm run lint` and `npm run format:check` all exit 0.

**Things you should know**
- **Left out:** the 14 unused M3 roles and the Expo template tokens. They're easy to add back when a screen needs one.
- **Mixed rating:** the text is terracotta but the card is olive. It's kept as in legacy (THEME.md note).

**Next:** P1.7 Rating primitives and the component gallery route.

---

## 2026-10-27 — P1.5 Supabase base schema: profiles, roles, `is_admin()`, RLS and type generation

**What changed**
- Migration `supabase/migrations/20261027180523_profiles_and_roles.sql`, applied to **supabase-dev** only:
  - a `private` schema;
  - `public.profiles` (DATA_MODEL §3.9, plus `updated_at` and a consent-time check);
  - `private.set_updated_at()` trigger;
  - `private.is_admin()` (security definer, stable, `search_path = ''`);
  - `private.handle_new_user()` trigger on `auth.users` (copies `display_name` from the sign-up metadata, max 80 characters);
  - grants: anon none; authenticated `select` plus `update` on `display_name`, `share_prices_consent` and `consent_at` only;
  - RLS policies `profiles_select_own_or_admin` and `profiles_update_own`.
- `supabase/README.md` covers the rules, naming, how to regenerate types, and the migration list.
- `packages/core/src/db/database.types.ts` is generated with the MCP. `@sarvis/core` re-exports the types.
- Root `npm run db:types` prints the MCP steps (`scripts/db-types.mjs`).
- `docs/DECISIONS.md`: **D-020** (`private` schema, privileges before RLS, one policy per action).
- `CLAUDE.md` Commands: the Generate Supabase types row is filled.

**Verification**
- `list_migrations` → `[{"version":"20261027180523","name":"profiles_and_roles"}]`.
- `get_advisors` security → `{"lints":[]}`. Performance → `{"lints":[]}`.
- SQL checks: each ran in `begin … rollback` with throwaway `auth.users` rows A, B and admin, using `set local role` and `request.jwt.claims`.
  - **Trigger:** 3 auth users → 3 profiles (`Alex:user, ∅:user, Admin:admin`).
  - **anon:** `select count(*) from profiles` → `ERROR 42501: permission denied for table profiles`. That's stronger than 0 rows: `has_table_privilege('anon', …, 'select') = false`.
  - **User A:** `visible_rows 1`, `only_own_row true`, `is_admin false`.
  - **A's `update profiles set role='admin'`** → `ERROR 42501: permission denied for table profiles` (column privilege).
  - **A's update of `display_name`:** own row 1 update, user B's row **0**.
  - **Admin:** `visible_rows 3`, `is_admin true`.
  - **Cleanup:** 0 leftover test users after the rollbacks.
- `grep -ri service_role app packages` → nothing.
- `npm run typecheck` (with the generated types), `lint`, `test` and `format:check` all exit 0.

**Things you should know**
- **Making an admin:** there's no client path to set `role` (by design). For now it's `update public.profiles set role = 'admin' where id = …` on the dev project through the MCP. An admin role-management UI belongs in Phase 5.

**Next:** P1.6 Theme tokens from THEME.md.

---

## 2026-10-27 — P1.4 Set up the GitHub repo and CI workflow

**What changed**
- Public repo **https://github.com/LukaMS/sarvis** created with `gh`. `master` was renamed to `main`, and `main` is the default branch.
- **Before the push** (your choice): all 20 commits were rewritten from your Gmail address to `13386597+LukaMS@users.noreply.github.com`.
  - Only the author and committer emails changed. The tree is identical, and the Gmail address appears 0 times in `git log -p main`.
  - This repo's `git config user.email` is now the noreply address.
  - The backup refs were deleted after the check, so the old commits can't be pushed by accident.
- **Pre-push scan of the whole history:**
  - **0 hits** for JWT, Supabase (`sbp_`, `sb_secret_`, `sb_publishable_`), OpenAI-style `sk-`, GitHub token, AWS key and private-key patterns, and for `service_role` assignments.
  - Emails found: only `you@example.com` (scrubbed fixtures), the legacy `support@` address, an npm author in the lockfile, and the commit trailers.
  - `docs/legacy/data/` is editorial content only (user tables were never exported, as P0.2 notes).
- `.github/workflows/ci.yml` runs on push and PR:
  - Node 22 with the npm cache, then `npm ci`, typecheck, lint and test;
  - `contents: read`, no secrets, a concurrency group that cancels superseded runs, and a 15-minute timeout.
- `docs/DECISIONS.md`: **D-019**.

**Verification**
- **Green:** the push of `main` → https://github.com/LukaMS/sarvis/actions/runs/40555272184. `success`, and every step passed (checkout, setup-node, `npm ci`, typecheck, lint, test).
- **Red:** the throwaway branch `ci-red-check` added an unused const to `packages/core/src/index.ts` → https://github.com/LukaMS/sarvis/actions/runs/40555421163. `failure` at `Run npm run lint`:
  `error 'unusedForCiCheck' is assigned a value but never used ... @typescript-eslint/no-unused-vars`, `✖ 1 problem (1 error, 0 warnings)`.
- **Revert:** the branch was deleted locally and on GitHub and was never merged. `main` doesn't contain the error.

**Things you should know**
- **Public files:** `.mcp.json` (the Supabase project refs for dev and legacy, but no keys) and `.claude/settings.json` (your local legacy-folder path) are public. Neither is a secret.
- **Other clones:** commit hashes before 97bb19e changed with the rewrite. That doesn't matter for this repo, but any other local clone of it is now out of date.

**Next:** P1.5 Supabase base schema: profiles, roles, `is_admin()`, RLS and type generation.

---

## 2026-10-27 — P1.3 Add the Playwright web e2e harness

**What changed**
- `@playwright/test` 1.64.1 (Chromium only; its build was already installed locally).
- `playwright.config.ts`:
  - `mobile-web` project at 390 × 844;
  - `webServer` runs `npm run web` on :8081 and reuses a running server locally;
  - `list` reporter locally, `github` in CI;
  - traces kept on failure.
- `e2e/smoke.spec.ts` checks that `placeholder-home` is visible, that `placeholder-home-title` reads "Sarvis", and that there are no console errors.
- `e2e/tsconfig.json`. The root `typecheck` now also runs `tsc -p e2e/tsconfig.json`.
- Root script `npm run e2e`.
- `.gitignore` already had `playwright-report/` and `test-results/`. `.prettierignore` now also skips those and the generated `app/expo-env.d.ts`.
- `docs/DECISIONS.md`: **D-018**.
- `CLAUDE.md` Commands: the E2E (web) row is filled.

**Verification**
- `npm run e2e`, with Playwright starting the dev server:
  ```
  Running 1 test using 1 worker
    ok 1 [mobile-web] › e2e\smoke.spec.ts:3:1 › home placeholder renders the shared app name (2.5s)
    1 passed (21.4s)
  ```
- **Negative check:** with the expected testID changed to `placeholder-home-WRONG`:
  ```
    x  1 [mobile-web] › e2e\smoke.spec.ts:3:1 › home placeholder renders the shared app name (6.3s)
      Error: expect(locator).toBeVisible() failed
      Locator: getByTestId('placeholder-home-WRONG')
      Error: element(s) not found
    1 failed
  ```
  Exit code 1. After the revert: `1 passed (16.5s)`.
- `npm run typecheck` (including e2e), `npm run lint`, `npm test` (2/2) and `npm run format:check` all pass.

**Next:** P1.4 Set up the GitHub repo and CI workflow. The first push needs your OK.

---

## 2026-10-27 — P1.2 Create the Expo app (SDK 54, Expo Router, strict TS)

**What changed**
- `app/` (`@sarvis/app`) is an Expo SDK 54 app (blank TypeScript template) with Expo Router 6, entry `expo-router/entry`, and routes in `src/app/`.
  - `_layout.tsx` is a Stack with no header and a status bar.
  - `index.tsx` is the placeholder (`testID="placeholder-home"`) and renders `APP_NAME` from `@sarvis/core`.
- `app.json`: name Sarvis, slug and scheme `sarvis`, Android package `com.lukams.sarvis`, web `bundler: metro` with `output: static`, the `expo-router` plugin, and `typedRoutes`.
- `app/tsconfig.json` extends the root base and Expo's base, keeping strict and `noUncheckedIndexedAccess`.
- Root scripts `npm run web` and `npm run android`.
- `eslint.config.mjs` adds `eslint-config-expo` (SDK 54 version), scoped to `app/**`.
- `docs/DECISIONS.md`: **D-017**.
- `CLAUDE.md` Commands: the Start web and Start Android rows are filled.

**Verification**
- **Web:** `npm run web`, then Playwright on http://localhost:8081.
  - The page renders "Sarvis" and "Rebuild in progress". `.screenshots/p1.2-web.png` is saved.
  - Console: **0 errors, 0 warnings** (2 info/log lines from React DevTools and AppRegistry).
  - The SSR HTML contains `data-testid="placeholder-home"` and `placeholder-home-title`.
- **Android:** `adb devices` shows `emulator-5554` (Pixel 10 Pro AVD). Expo Go 54.0.8 opened `exp://10.0.2.2:8081`.
  - Metro: `Android Bundled 10477ms (1089 modules)`, with no warnings or errors in the log.
  - The mobile MCP element list shows `id="placeholder-home"` and the TextView `"Sarvis"` with `id="placeholder-home-title"`. `.screenshots/p1.2-android.png` is saved.
- **Workspace resolution:** "Sarvis" on both platforms comes from the `@sarvis/core` import.
- `npm run typecheck` (app, core, pipeline), `npm run lint`, `npm test` and `npm run format:check` all **exit 0**.
- `eslint --print-config`: app files get 58 react/expo/import rule entries. Pipeline files get only eslint-config-prettier's "off" entries.

**Things you should know**
- **npm audit:** 8 issues (6 moderate, 2 high), all in transitive dev tooling (`image-size`, `decode-uri-component`, `postcss` under Metro and the Expo CLI). They don't ship in the app bundle. Fixing them with `--force` would break the SDK 54 pins, so I left them.
- **Template files:** I removed `app/AGENTS.md` and `app/.claude/settings.json`. The second would have turned on the `expo@claude-plugins-official` Claude plugin. Enable it yourself if you want it.
- **Device id:** the mobile MCP calls the emulator `Pixel_10_Pro`. adb calls it `emulator-5554`.

**Next:** P1.3 Add the Playwright web e2e harness.

---

## 2026-10-27 — P1.1 Scaffold the npm workspace and root tooling

**What changed**
- The root `package.json` (`"type": "module"`) has workspaces `app`, `packages/core` and `pipeline`, and scripts `typecheck`, `lint`, `format`, `format:check`, `test` and `clean` (rimraf).
- `tsconfig.base.json` sets `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` and bundler resolution. Each workspace has a `tsconfig.json` that extends it.
- `eslint.config.mjs` (flat config with typescript-eslint and eslint-config-prettier), `.prettierrc.json` and `.prettierignore`.
- `vitest.config.ts` uses `test.projects`, with one project per package.
- `packages/core` (`@sarvis/core`) exports `APP_NAME`. `pipeline` (`@sarvis/pipeline`) imports it to build the D-015 User-Agent. Each has one smoke test.
- `app/` holds only a README placeholder until P1.2.
- `.env.example` has three placeholders with comments.
- `.gitignore` already covered everything needed (`node_modules`, `.env*` except `.env.example`, `.expo`, `dist`, `coverage`), so it's unchanged.
- `.gitattributes` (`* text=auto eol=lf`): Git on this machine converts to CRLF on checkout, which would make `format:check` fail on a fresh Windows clone.
- `docs/DECISIONS.md`: **D-016** lists every dev dependency with its reason.
- `CLAUDE.md` Commands: the Install, Typecheck / lint and Unit tests rows are filled.

**Verification**
- I copied the tracked and new files into a fresh folder (no `node_modules`) and ran `npm install` there: 0 vulnerabilities.
  - `npm run typecheck` → `@sarvis/core` and `@sarvis/pipeline` `tsc -p tsconfig.json`, **exit 0**
  - `npm run lint` → `eslint . --max-warnings 0`, **exit 0**
  - `npm test` → `Test Files 2 passed (2) / Tests 2 passed (2)`, **exit 0**
  - `npm run format:check` → "All matched files use Prettier code style!"
- **Broken-file check:** I added `packages/core/src/broken.ts` with an unused var, a string assigned to `number`, and an unchecked `xs[0] + 1`.
  - typecheck **exit 2**: `TS2322 Type 'string' is not assignable to type 'number'` and `TS2532 Object is possibly 'undefined'`. The second error confirms `noUncheckedIndexedAccess` is on.
  - lint **exit 1**: `'unused' is assigned a value but never used`.
  - After I removed the file, both passed again.

**Things you should know**
- **ESLint 9:** it's pinned because Expo's lint plugins don't support ESLint 10 yet. npm prints a "no longer supported" warning on install, which is expected (D-016).
- **TypeScript 5.9:** it's pinned for Expo SDK 54. TS 7 is out but isn't supported yet.

**Next:** P1.2 Create the Expo app (SDK 54, Expo Router, strict TS).

---

## 2026-10-27 — Owner answers to the open decisions (D-015)

**What changed**
- `docs/DECISIONS.md`: new **D-015** with these answers:
  - **Repo:** public `LukaMS/sarvis`. `gh` is installed and logged in.
  - **Test users:** the dev service-role key goes in `.env`.
  - **Fonts:** system fonts.
  - **Sign-in:** email only, so P1.14 is skipped.
  - **User-Agent contact:** the repo URL only, with no email.
  - **Commercial status:** non-commercial for now, but it may become commercial. Prefer sources that allow commercial use, and flag the ones that don't.
- `docs/PLAN.md`: the matching 🟡 markers are now ✅ (P1.4, M5/P1.6, P1.10, P1.14, P3, P0.10 note).

**Still open:** P1.10 needs you to add `SUPABASE_DEV_SERVICE_ROLE_KEY` to `.env` before its verification. Later decisions: P5 token scope, P7 rubric and auto-publish, P8 privacy, grades and submissions, P10 hosting and distribution.

**Next:** P1.1 Scaffold the npm workspace and root tooling.

---

## 2026-10-26 — P0.12 Refine Phase 1 into session-sized tasks

**What changed**
- `docs/PLAN.md` Phase 1: the outline became **14 tasks** (P1.1–P1.14), each with ID, Slice, Goal, Deps, In, Out, Files and Verification, plus a milestone coverage table (M1–M6 plus exit). P1.0 is ticked.
- Phases 2–10 milestones were amended with audit findings:
  - P2: port the CATALOG_REVIEW Keep/Adapt modules; run-twice idempotency test; budget check vs BUDGET.md.
  - P3: OFF import filter and ODbL extract; adds Wikipedia, SEC EDGAR and Corporations Canada.
  - P4: receipt-abbreviation matching; calibrate the legacy tiers.
  - P5: manual certification forms; sources page.
  - P6: retention and budget thresholds.
  - P7: Deno/Node spike first; GDELT weekly; RSS per-feed terms.
  - P8: receipts early; new 🟡 items.
  - P9: thin same-store coverage note.
  - P10: attributions; paid-tier threshold.
- `docs/DECISIONS.md`:
  - **D-005** (admin in the Expo app) and **D-007** (npm workspaces) Accepted.
  - **D-009** Accepted with amendments: no runtime globals, an import map for Deno, logging to `ai_calls`, and a Phase 7 spike.
  - D-008 and D-010 were already Accepted in P0.11.

**Verification** (script over PLAN.md)
- 14/14 Phase 1 tasks have ID plus all 6 other fields (0 missing).
- Each task names **exactly one** feature slice (10 slices defined).
- Milestones covered: M1 → P1.1–P1.3; M2 → P1.4; M3 → P1.5 (+P1.10 client); M4 → P1.10, P1.11, P1.14; M5 → P1.6–P1.8; M6 → P1.9, P1.12; exit → P1.13. **0 uncovered.**
- All deps resolve.

**Open 🟡 decisions** (shown to the owner)

| When | Decision / action | Default |
|---|---|---|
| P1.4 | Create a public GitHub repo, or install `gh` and let me. I ask before the first push. | — (blocks P1.4) |
| P1.10 | Test users: put the **dev** project's service-role key in `.env`, or turn off email confirmation in dev. | (a) dev key in `.env` |
| P1.14 | Extra sign-in providers (Google / guest). | None |
| M5 (P1.6) | Fonts: system (legacy) vs Stitch Epilogue / Public Sans. | System fonts |
| Before P3 runs | Project contact for pipeline User-Agent headers. | — (blocks first P3 run) |
| Open | Is Sarvis a commercial product? | — |
| P5 | GitHub token scope for triggering runs from admin. | — |
| P7 | Approve rubric v1; the auto-publish rule (D-006). | No auto-publish |
| P8 | Receipt consent wording and k-anonymity rule; product grades (derive from company vs product-level); community submissions keep or drop. | ≥ 2 receipts; derive; — |
| P10 | Web hosting; Android distribution; a paid Supabase tier past ≈ 200–250 users. | — |

**Things you should know**
- **P1.1–P1.3 and P1.5–P1.9 need nothing from you.** P1.4 waits on the GitHub repo, and P1.10's verification waits on the test-user choice.
- **Android package id:** I picked `com.lukams.sarvis` and scheme `sarvis`. They can change before any store build.

**Next:** P1.1 Scaffold the npm workspace and root tooling.

---

## 2026-10-26 — P0.11 Design the catalog data model and free-tier budget

**What changed**
- `docs/catalog/DATA_MODEL.md`:
  - conventions: ids and stable keys, the provenance block, slug and GTIN rules, review status, RLS levels;
  - a Mermaid ER diagram;
  - 42 tables across 9 domains (pipeline, ownership, products, stores and prices, matching and review, scoring and evidence, editorial, AI and audit, user data), each with its columns, keys and RLS level;
  - views; raw storage and retention;
  - a rule checklist, a key-field map, a legacy → new table map, and open points.
- `docs/catalog/BUDGET.md`: per-table DB estimates (reproducible method), a storage estimate, the cuts that were designed in, alarm thresholds, levers and a growth note.
- `docs/DECISIONS.md`: D-008 and D-010 marked Accepted (D-010 amended: store OFF's *filtered* Canada extract); new **D-014** schema conventions.

**Verification**
- **Rule checklist:** all 11 CLAUDE.md "Catalog and data rules" map to R1–R24, plus R25–R27 for conventions. 27/27 rows have a schema element, **0 unmapped**.
- **Budget:**
  - catalog **≈ 294 MB ≤ 350 MB** (267 MB plus 10% bloat);
  - whole DB ≈ 373 MB, under the 400 MB alarm;
  - storage **≈ 289 MB ≤ 700 MB**.
  - The first pass was ≈ 425 MB. The cuts are listed in BUDGET §4 and already applied in the model.
- **Key fields:** all 76 (key) fields across 24 sources in SOURCES.md have a home in DATA_MODEL §7, **0 missing**.
- **Cross-check:** all 60 `table.column` references in §6–§7 resolve to columns defined in §3.

**Things you should know**
- **Headroom is thin at scale.** At about 200–250 active users the DB hits the 400 MB alarm within a year (BUDGET §8). Past that, it's a paid tier or archiving user history. That's a Phase 10 decision, not now.
- **Product grades:** I dropped legacy hand-set product scores. A product's grade would derive from its owner company's published score (DATA_MODEL §9). Tell me if you want product-level scores kept. Otherwise P0.12 / Phase 7 confirms this.
- **Receipt privacy:** receipt prices are shared only as weekly aggregates with at least 2 receipts. The final privacy rule and the consent wording are yours to approve in Phase 8.
- **Estimates need checking:** they get checked against real `pg_total_relation_size` after the first seed (Phase 2) and the OFF sample (Phase 3).

**Next:** P0.12 Refine Phase 1 into session-sized tasks.

---

## 2026-10-26 — P0.10 Research and compare catalog sources → SOURCES.md

**What changed**
- `docs/catalog/SOURCES.md` (new folder `docs/catalog/`): 30 source cards across products, prices, retailers, ownership and evidence.
  - Each card has the same 12 fields, from what the source provides through to a verdict.
  - Every licence and terms claim carries a verbatim quote, a URL and the date checked.
  - Includes a summary table and **§7 Decisions for owner** (D1–D7).

**Verification** (script over the cards)
- 30/30 cards have all 12 fields filled, 0 missing.
- Every Licence and Terms row has a URL plus 2026-10-26, or "Unknown" with a reason.
- 12 "ask owner" sources (S3, S7, S8, S9, S12, S13, S14, S15, S24, S27, S28, S29), all named in §7.
- No scrapers run. I read only robots.txt (one request per host, 40 hosts), terms pages and API docs. Six terms pages that block plain fetches were opened once in a normal browser view; the Playwright working folder was deleted afterwards (D-012).

**Things you should know**
- **Prices are the gap.**
  - Open Prices has only **697 CAD prices** in total.
  - StatCan (110 products, monthly, Ontario level) is only a sanity reference.
  - Every Ontario grocer limits its site to personal, non-commercial use. Loblaw, Sobeys and Longo's add Akamai; Walmart has a bot challenge; Costco explicitly bans bots and price collection.
  - So under D-002, real store prices come from receipts (D7) unless you approve a retailer (D2).
- **Products and ownership are well covered:**
  - OFF: about **129k Canadian products**. Its ODbL share-alike needs your call (D1).
  - Wikidata (CC0), Wikipedia, SEC EDGAR and GDELT are all "use".
- **Budget flag for P0.11:** an OFF Canada extract could be 65–130 MB before indexes.
- **Mistake on my part:** the robots.txt check sent a User-Agent containing your email address to the 40 hosts. It should have had no contact email (or a project address). Future pipeline User-Agents will use a project contact you choose. OFF, Wikimedia and SEC all require one, so that's worth deciding with D1.
- 🟡 **Your answers to §7 D1–D7 are needed before any P3 retailer task.** P0.11 can proceed without them.

**Next:** P0.11 Design the catalog data model and free-tier budget.

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
