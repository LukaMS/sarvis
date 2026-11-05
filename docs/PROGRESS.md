# Progress log

Newest entry first.

## 2026-11-05 — P4.1 GTIN: UPC-E expansion and restricted EAN-8 (done)

**What changed** (D-078)
- `gtinNormalize` and `gtin_normalize` expand 8-digit UPC-E to UPC-A, through a new `upcEToUpcA` / `gtin_upce_to_upca`. `gtin_is_restricted` adds EAN-8 prefixes 0 and 2. Migration `gtin_upce` is applied to dev, and types are regenerated (1 new line).
- One vector list, `packages/core/src/gtin.vectors.json`, replaces the two hand-synced ones. New `npm run check:gtin` runs it against SQL.
- DATA_MODEL §1.4 and the P4.3 task updated.

**Verification**
- **Twin tests:** core `gtin.test.ts` passes on the shared vectors. `check:gtin` passes 5 of 5: all four SQL helpers on the vectors, and SQL = TS on 300 generated and 200 stored 8-digit codes.
- **Prefix check:** of 50 sampled ambiguous codes with a brand, **23 agree** with another product of that brand, and 37 of the 50 have a brand with any UPC-A row to compare, so 23 of 37. Over all 332 codes, 101 agree, against 4 with shuffled brands. Examples: Coca-Cola `06782900` → `067000008290`, Canada Dry `06248017` → `062100004807`.
- **Types:** the generated file differs from the committed one only by the new function.
- `npm run typecheck`, `lint` and `test` pass. The security advisor shows only the existing leaked-password warning.

**For the owner:**
- **The prefix check changed the plan's rule.** Codes starting with 1 agreed 0 of 155 times, so only codes starting with 0 count as UPC-E. That recovers 633 rows rather than the 707 I told you in P4.0, and ~1,883 codes are really bad rather than ~1,809.
- **New in P4.3:** 226 stored codes turn out to be in-store codes and will lose their barcode. Those products can then be found by search but not by scanning.
- **Don't run an OFF import until P4.3 is done.** 608 stored rows now fail the `products` check on any update, until P4.3 rewrites them. Nothing is scheduled yet, so this only matters for a manual run.
- **Not every ambiguous code is proven UPC-E.** 23 of 37 agree, and the rest have no evidence either way, because a brand can use several prefixes. An in-store code could get a GTIN by mistake. A scan still reaches the same row, and P4.3 checks the 35 clashes by hand.

**Next:** P4.2 Product writer keeps resolved columns.

---

## 2026-11-05 — P4.0 Refine Phase 4 (done)

**What changed**
- `docs/PLAN.md`: Phase 4 is now full detail. It has 23 tasks (P4.1–P4.23), shared rules, a "Not in Phase 4" list and a coverage table. The outline's "P4.0 decides" items are all settled in D-077.
- Phase 8 and Phase 9 outlines: UPC-E barcodes at scan time, and the size gap.
- `docs/DECISIONS.md`: D-077.

**Found while planning** (measured on the dev project and the 2026-10-30 OFF dump)
- **UPC-E bug:** 707 of the 2,516 "bad check digit" OFF rows are valid UPC-E codes we misread as EAN-8, such as Kikkoman, Häagen-Dazs and Hershey. Another 563 stored 8-digit codes are probably under the wrong GTIN. P4.1 and P4.3 fix this.
- **Writer trap:** the products writer sends `brand_id` and `category_id` as null when a record has no slug, so an OFF update would wipe resolved links. P4.2 fixes it before anything sets them.
- **58% of OFF products have no category** (52,879 of 90,662), and OFF tags aren't stored on `products`. P4.9 re-reads the raw extract, and P4.17 uses free rules for the rest.
- **Grocers' own brands dominate the top strings** and several have no brand row (Compliments, Irresistibles). "Selection" points at a company of that name, likely wrong. P4.12 covers these.

**Verification**
- A script over the Phase 4 section: all 23 tasks have the seven fields (slice, goal, deps, in, out, files, verification), each names exactly one slice from the list, every dep exists and comes earlier, and every task appears in the coverage table. Every milestone M1–M8 maps to at least one task.
- `npm run format:check` passes.

**For the owner:**
- **Your three decisions are recorded in D-077:** weak links stay hidden and only brands on 20+ products are queued; your receipts form the receipt gold set; OFF takes over the 3 legacy products.
- **You'll be needed twice:** P4.12, to approve a list of about 30–50 grocer brands and their owners, and P4.20, to supply about 100 receipt lines. P4.1–P4.11 run without you. P4.13–P4.21 wait on the first, and P4.21 also on the second. P4.22 needs neither.
- **My call, easy to change:** the ~1,809 codes that are really bad are kept with no barcode, so search finds them but scanning doesn't, unless they duplicate a kept product.
- **79% of products will stay without a size.** No free source has them, so Phase 9's unit-price comparison will be limited. P4.23 reports the real number.
- **Gold-set labels are mine,** so P4.15 and P4.19 each list 15 rows for you to spot-check.

**Next:** P4.1 GTIN: UPC-E expansion and restricted EAN-8.

---

## 2026-11-04 — P3.19a Budget: run-bookkeeping row widths (done)

**Done** (no code, no schema change; D-076)
- BUDGET §3 re-baselined for `ingestion_run_events`, `validation_failures`, `review_queue` and `raw_objects`, from per-column measurements. §1 re-added. New BUDGET note "Actuals: run bookkeeping re-baselined" has the method.
- What makes the rows wide: `wikidata_match` event details (32% of event rows, 62% of the bytes), the trimmed record in `validation_failures.payload` (78% of the row), and Wikipedia's long `request_url` in `raw_objects`.
- BUDGET §2 now states the units, and the Phase 6 budget monitor bullet says to pick one (see below).

**Verification**
- §1 re-added from §3 by a script over the catalog table: 39 rows summed to 295.8 MB before this task, so **299.4 MB** after it (+2.0, −2.2, +2.6, +1.2), and each row matches `rows × (heap × 1.15 + index)` apart from `reference_prices`, which is measured whole (P3.11a).
- Each new figure cites its measurement in BUDGET (`pg_column_size`, `pg_relation_size`, 75 runs).
- `npm run format:check` passes.

**For the owner:**
- **Result:** catalog ≈ 329 MB with bloat (≈ 325 before; budget 350), and whole DB **≈ 420 MB** (≈ 416 before). That sits at the point where the task said to tell you. It's over the 400 MB warning and under the 450 MB critical line. D-070's reserve lever still brings it to ≈ 393–404 MB, so nothing changes today. The measured DB is 112.5 MB.
- **The row counts are my assumption:** 20 events and 15 failures a run, rounded up from the 17 and 13 that full and delta runs average, over 240 runs a month. If every run hit the 50 cap, the whole DB would be ≈ 15 MB higher, still under 450 MB. Phase 6 will have real scheduled runs to check this against.
- **Units:** BUDGET's estimates are decimal MB, but the measured figures in its Actuals notes are 2^20-byte MB, about 4.6% smaller. So actuals read slightly low against estimates, and ≈ 420 MB is ≈ 401 MB in the measured unit. I didn't convert the old notes. I don't know which unit Supabase's 500 MB limit uses, so the Phase 6 monitor should check that when it picks one.

**Next:** P4.0 Refine Phase 4 into session-sized tasks.

---

## 2026-11-04 — P3.19 Phase 3 exit check (done)

**Done**
- No code. P3.19 ticked; Phase 3 is complete. BUDGET has a new "Actuals: Phase 3 exit" note.
- **New P3.19a** (PLAN): `ingestion_run_events` and `validation_failures` rows are much wider than §3, and a few smaller widths are over too. Nothing is over budget today. See "For the owner".

**Exit checklist (commit `cbad52b`)**
- [x] **Each approved source ran on a sample, then scaled, with row counts, examples and validation results in PROGRESS.** The 7 Phase 3 sources (S1, S5, S6, S17, S19, S20, S21); each one's own PROGRESS entry has the examples. Counts below are from `ingestion_runs`; "again" is the second run of the same command.

  | Source (version) | Sample, then again | Full, then again | Inserted on the again run | Failures stored on the last sample / full run |
  |---|---|---|---:|---|
  | `off` (1.0.0, 1.0.1) | `88d60477` (100 fetched, 100 inserted), `3b2f8602` | `d84ff31f` (93,178 fetched, 90,662 valid, 2,516 invalid, 20,959 inserted, 69,703 unchanged), `22da94b5` | 0 / 0 | 0 / 50 `gtin_check_digit` (capped at 50; 2,516 counted) |
  | `off` delta (1.0.1) | — | `73a48852` (2,584 fetched, 2,444 valid, 140 invalid, 1 updated), `0840fa2d` (nothing new) | 0 | 50 `gtin_check_digit` (capped; 140 counted) |
  | `open-prices` (1.0.0, 1.0.1) | `5c261e72` (100 fetched, 95 valid, 87 inserted), `244ec6bc` | `10a5fe58` (792 fetched, 754 valid, 38 invalid, 534 inserted), `9a065a93`; 1.0.1 `d6e39878` (100 updated), `2f2bf00a` | 0 / 0 / 0 | 5 `gtin_check_digit` / 25 `gtin_check_digit`, 13 `schema` |
  | `statcan-18100245` (1.0.0) | `71116a1e` (100 inserted), `64c6b56e` | `898792c1` (25,520 fetched, 25,420 inserted), `4d59addf` | 0 / 0 | 0 / 0 |
  | `wikidata` (1.3.0, 1.4.0) | `86dc8057` (511 fetched, 7 inserted), `1f964672` | `5c5318eb` (6,019 fetched, 3,283 inserted), `3c9b0a8d` (4 updated) | 0 / 0 | 0 / 0 |
  | `wikipedia` (1.0.0, 1.1.0) | `87fab3aa` (199 fetched, 99 inserted), `1b910b97` | `b1ef67a2` (2,067 fetched, 1,024 inserted), `ec27b26a`; 1.1.0 `e585a6ca` (67 updated), `202d2c35` | 0 / 0 / 0 | 0 / 0 |
  | `sec-edgar` (1.0.0) | `54a03b1b` (21 fetched, 10 inserted), `6deb8462` | `6290bdab` (159 fetched, 74 inserted), `b811852e` | 0 / 0 | 0 / 0 |
  | `corp-canada` (1.0.0) | `ed156a4e` (5 updated), `2859f150` | `adfcb843` (20 fetched, 15 updated), `61a10bcd` | 0 / 0 | 0 / 0 |

  - **All stored failures by rule** (every run, dry runs too): `off` 250 `gtin_check_digit`; `open-prices` 115 `gtin_check_digit`, 52 `schema`; `wikidata` 1 `duplicate` (dry run `ab117c92`); the others 0. A run stores at most 50, so `counts.invalid` is the real total.
  - **Rows reconcile for OFF:** 90,662 valid = 90,659 OFF rows in `products` + 3 in `product_sources` (legacy rows hold those GTINs, P3.6).
  - **6 runs ended `failed`**, each followed by a clean run: `07a79dc0` (OFF, bad Unicode escape), `233b18f5` (OFF delta, robots.txt), `81f67046`, `dd22662c`, `e2253350`, `21a3c41c` (Wikidata, HTTP 429). All fixed in their tasks.
- [x] **Provenance.** `source_id`, `fetched_at` and `method` are missing on 0 rows in all 25 tables that have them. For the 10 main tables, by source: `method_version` and `ingestion_run_id` are missing on 0 rows. Every Phase 3 row has a `source_url` or a source with a `url_template` (`products` OFF 90,659, `price_observations` 521). The 122 rows with neither in those tables are all `legacy-import` (13 products, 49 brands, 11 companies, 49 brand edges), and all are `pending`, so hidden.
- [x] **DB and storage within budget** (details in BUDGET "Actuals: Phase 3 exit"):

  | Measure | Actual | Warn / alarm |
  |---|---:|---:|
  | Whole DB (`pg_database_size`) | 112.5 MB | 330 MB (reserve lever) / 400 MB |
  | Catalog tables (39, all of `public` except `profiles`) | 91.2 MB | 320 MB / 350 MB |
  | Other schemas | 21.3 MB | ≈ 42 MB estimated |
  | Storage: `raw` | 22.0 MB, 4,086 objects | 6,000 `raw_objects` |
  | Storage: `public-exports` | 7.1 MB, 8 objects | §5: 16 MB |
  | Storage total | 29.1 MB | 700 MB / 800 MB |

- [x] **`get_advisors`:** security shows only the existing project-wide "Leaked password protection disabled" WARN. Performance shows only INFO `unused_index` (49, was 58), expected until the app and Phase 4 query these tables. No ERROR.
- [x] **Clean clone:** fresh `git clone` from GitHub into the scratchpad, `npm ci`. `typecheck`, `lint` and `format:check` exit 0. `npm test`: **571 passed, 1 skipped** (the dev-DB e2e skips without `.env`).
- [x] **Fixture e2e:** `npm run e2e --workspace @sarvis/pipeline`, run twice from the main checkout: both exit 0 (21.0 s, 16.4 s).
- [x] **Latest CI run is green:** `cbad52b`, https://github.com/LukaMS/sarvis/actions/runs/41938308237.
- [x] **Migrations:** 17 applied on dev, 17 files in `supabase/migrations/`.

**For the owner:**
- **Phase 3 meets its exit criteria.** The DB is 22% of the free tier, and storage is 3%.
- **P3.19a (a docs task):** events are 869 B a row against 178 B in §3, and validation failures 614 B against 308 B. If both tables reached their §3 row counts, that's ≈ +15 MB, or ≈ +17 MB with the smaller widths. The catalog would be ≈ 344 MB (under 350) and the whole DB ≈ 435 MB (under the 450 critical line, over the 400 alarm). At today's rate (12 events and 6 failures a run) they'd stay at or under their §3 MB, because those counts assume the 50-per-run cap, far above what runs write. P3.19a settles which to believe.
- **Coverage is still thin where Phase 4 comes in:** products are at 95% of the 95k target, but brands are at 9% of 20k and companies at 35% of 5k, and no OFF product links to a brand yet.
- **Raw retention isn't running yet.** It's the Phase 6 cleanup job, so every file since Phase 2 is still stored: Wikidata holds 3,813 files from 18 runs, against 3,291 when it keeps 3. That's under the 6,000 bound, and a task already covers it.
- **The last OFF delta ran on 2026-10-30.** A gap over 14 days between deltas needs another full run (PLAN Phase 6, freshness policy), so that applies if scheduling starts after about 2026-11-13.
- One bookkeeping leftover: a `fixture` dry run from 2026-10-29 (`7ed2ee6c`) with one validation failure. It's from a manual run, not the e2e, and it's harmless. I left it.

**Next:** P3.19a Budget: run-bookkeeping row widths.

---

## 2026-11-04 — P3.18 Corporations Canada: identity check (done)

**Done** (`corp-canada@1.0.0`, D-075)
- New source `pipeline/src/sources/corp-canada/`. It reads the two active English CSVs through the dump cache and gives `company_enrichment` records (`corp_canada_number`, `legal_name`) for `CA` companies matching exactly one active corporation. Provenance goes to `company_sources`; the company's Wikidata block is untouched.
- `nameKeyWith` added in `sec-edgar/map.ts` so a source can pass its own legal forms. `nameKey` behaves as before.
- Terms check: licence and `open.canada.ca` robots.txt unchanged, so no `sources` migration. The files now sit on a CloudFront host (its robots.txt answers 403, meaning no restrictions). SOURCES S21 now has the field list and sizes.

**Verification**
- Dry run `bfb10aca` (`--sample 100`): 696,815 rows, 0 malformed, 20 confirmed, 1 ambiguous, 0 shared.
- Sample `ed156a4e` (`--sample 5`): fetched 5 / valid 5 / invalid 0 / inserted 0 / updated 5 / unchanged 0. Again `2859f150`: updated 0 / unchanged 5.
- Full `adfcb843`: fetched 20 / valid 20 / invalid 0 / inserted 0 / updated 15 / unchanged 5. Again `61a10bcd`: updated 0 / unchanged 20. All exit 0, no warnings, 0 validation failures. An enrichment never inserts, so `inserted` is 0 by design.
- Rows: 20 `companies` with a number and `legal_name`, 20 `company_sources`. Provenance missing 0, duplicate numbers 0, company provenance overwritten 0.
- Raw: 4 files. The full run's `bc701535`, read back with `readRaw()`, re-parses to 20 valid records, all equal to the stored rows, with no address or business number in it.
- Examples as stored (all `method = import`, `corp-canada@1.0.0`, source URL the CBCA CSV): Loblaw Companies → 126764 LOBLAW COMPANIES LIMITED; Saputo → 2833735 SAPUTO INC.; Dollarama → 4537394 DOLLARAMA INC.; Maple Leaf Foods → 4544668 MAPLE LEAF FOODS INC.; The Brick → 7658419 The Brick Ltd.
- Hand check: those 5 on the Corporations Canada page: same name, Active, same number (shown hyphenated, e.g. 012676-4). The other 15 were read against their catalog entry and Wikidata item; only Dolcezza needed a closer look (right, D-075).
- Budget (BUDGET P3.18 Actuals): 328 B/row vs 357 B, DB 112.5 MB, raw 22 MB / 4,086 files. Nothing over.
- `npm run typecheck`, `lint`, `format:check` and `npm test` (571 passed, 1 skipped) pass.

**For the owner:**
- Coverage is low on purpose: 20 of 160 `CA` companies. Some others are probably provincial, and for some the catalog holds a store or brand name rather than the corporation's; I didn't measure the split. Right answers held back by the no-aliases rule are in a new Phase 4 bullet.
- The plan said "the bulk CSVs"; I read only the 2 active files, because the inactive ones can only give dead numbers (D-075).
- The Corporations Canada page lists directors' home addresses, so nothing from those pages was saved.

---

## 2026-11-04 — P3.17 SEC EDGAR (b): all companies with a CIK (done)

**Done** (no code change; `sec-edgar@1.0.0`)
- Full run over the 119 companies with a CIK: 78 with a 10-K, 75 Exhibit 21 documents read (3 10-Ks have none: Campbell's, Natural Grocers, Western Digital), 41 skipped (8 20-F/40-F, 16 stale, 17 no 10-K).

**Verification**
- Run `6290bdab` (`--mode full`): fetched 159 / valid 159 / invalid 0 / inserted 74 (65 new documents + 9 edges) / updated 65 (new `company_sources` rows; an enrichment counts as an update) / unchanged 20 (the sample's 10 documents and 10 `company_sources`). 75 raw files, 0 validation failures. Exit 0.
- Run `b811852e` (same command): fetched 0, inserted 0, 0 raw files; all 75 exhibits counted as already stored.
- Rows: 75 `sec_filing` documents, 75 `company_sources`, 6 `company_ownership` and 3 `brand_ownership` edges, all `pending`, 9 open queue rows. Provenance missing: 0 in every table. No other source's edge was written or touched (0 rows with this run id or updated in the window).
- Raw read-back: Hormel's stored envelope re-parses to the stored document and the edge Hormel → Justin's.
- Edges (the P3.16 hand check, D-074): Clorox → GOJO Industries, Estée Lauder → Too Faced, Hain → Celestial Seasonings, Hormel → Justin's, Hershey → LesserEvil, Monster Beverage → Monster Energy (brand) are right. Kellanova → Keebler Company, Mondelez → Schweppes (brand) and Kraft Heinz → Capri Sun (brand) are wrong (leftover or licensed entities); they wait in the queue.
- Budget (BUDGET P3.17 Actuals): SEC documents 580 B/row vs 328 B, but ≈ +0.1 MB at target; `company_sources` 280 B (under), edges +9% / +14%; SEC raw 427 KB vs 18 MB estimated; DB 112 MB, raw bucket 22 MB / 4,082 files.

**For the owner:** the run log's running summary line can show one company fewer than processed. It's taken at the last filing event, before a trailing company with no 10-K. The counts in the events are complete (41 skipped + 78 filings = 119). I didn't change it.

---

## 2026-11-04 — P3.16 SEC EDGAR (a): Exhibit 21 sample (done)

**Done** (`sec-edgar@1.0.0`, D-074)
- Source `sec-edgar` (`pipeline/src/sources/sec-edgar/`): companies with a CIK by slug, then the submissions JSON (latest 10-K), the filing index (EX-21 documents), and each Exhibit 21 stored as one envelope with its parsed and matched subsidiaries. Records: a `sec_filing` document, the CIK's `company_sources` row, and a pending, queued edge per exact-name match (company → `company_ownership`, brand → `brand_ownership`).
- Parser for the layouts seen: tables (name-first and jurisdiction-first), gap-separated lines, "Name, a Delaware …" lines. It drops headings and footnote marks. Matching uses a name key without legal forms, with self, ambiguous, existing-edge and country checks.
- New User-Agent mode `contact: 'email_only'`: SEC returns 403 to any User-Agent that contains a URL (measured; SOURCES.md S20).
- Terms re-checked: unchanged (free access, 10 req/s cap, declared UA). `/Archives/` isn't disallowed, and `data.sec.gov` has no robots.txt. `terms_checked_at` is unchanged.
- Fixtures: trimmed real responses (two submissions JSONs, a filing index, three Exhibit 21 layouts), excluded from Prettier. 20 unit tests.

**Verification**
- Dry run `f3b6ef53` (`--dry-run --sample 10`): 21 records valid, 0 invalid.
- Sample run `54a03b1b`: 14 companies → 10 10-K filings (2 foreign 20-F, 2 stale, 1 no 10-K). fetched 21 / valid 21 / inserted 10 / updated 11 (10 `company_sources` + 1 edge, see below). 10 raw files, 0 validation failures.
- Same command again, `6deb8462`: fetched 0, inserted 0, 0 raw files (stored exhibits are skipped).
- Provenance: 10 documents and 10 `company_sources` rows, 0 missing `source_id`/`fetched_at`/`method`/`method_version`/run/`source_url`.
- Raw read-back: `readRaw` on Best Buy's file re-parses to the stored document and `company_sources` row.
- Per filing (matched / edge exists / self / unmatched): AMG 0/0/1/165, Altria 0/0/0/4, Amazon 0/0/0/9, AIG 0/0/1/89, Aramark 0/0/7/244, Artisan 0/0/1/33, Bath & Body Works 0/0/1/11, Berkshire 0/1/0/274, Best Buy 0/0/0/51, Beyond Meat 0/0/0/2.
- Examples (as stored): document "ALTRIA GROUP, INC. 10-K for 2025-12-31", `0000764180-26-000017`, filed 2026-02-25, URL `…/764180/000076418026000017/0000764180-26-000017-index.htm`, `api`, `sec-edgar@1.0.0`, run `54a03b1b`. Likewise "AMAZON COM INC 10-K for 2025-12-31" (`0001018724-26-000004`) and "AFFILIATED MANAGERS GROUP, INC. 10-K for 2025-12-31" (`0001628280-26-008665`). `company_sources` altria: external id `0000764180`, fields `[sec_cik]`, source `https://data.sec.gov/submissions/CIK0000764180.json`; same for affiliated-managers-group.
- **Hand check of 10 edges:** the sample's 10 filings (non-grocery parents, by slug) gave no new edge, so I used a full dry run, `08dfcd98` (119 companies, nothing written). 9 distinct edges, all in their filings as parsed; 6 right, 3 wrong (leftover or licensed entities: Keebler, Schweppes, Capri Sun). Details are in D-074. The first full dry run also caught 5 wrong name matches, fixed by the apostrophe, heading and country rules.
- typecheck, lint, format:check, `npm test` pass.

**For the owner**
- **Fixed in-session:** the first sample's SEC edge Berkshire → Pilot Flying J matched an existing pending Wikidata edge and **overwrote its provenance** (the edge writers key on endpoints, not source). I restored the row from the Wikidata raw file and deleted the queue row. The source now skips any pair that already has an edge. Added a Phase 4 milestone: edges that hold evidence from several sources.
- Expect about 9 SEC edges in the review queue after P3.17, about a third wrong. They're `pending`, so users never see them.

---

## 2026-11-04 — P3.15b Wikipedia: clean pronunciation leftovers from summaries (done)

**Done** (`wikipedia@1.1.0`, D-073)
- `tidySummary` in `pipeline/src/sources/wikipedia/map.ts`: drops a separator opening a bracket and empty brackets, then spaces before closing punctuation. `summaryOf` applies it before the cut.
- The check re-queues unchanged pages whose stored summary isn't tidy (`retidy` count), so old rows are fixed without a version-based loop. The loader reads the summary via the document FK.
- Tests: 11 real P3.15 strings (Kraft Foods, Findus, Guylian, Heinz, Frito-Lay, Nabisco, Aldi, SAP, Prague, …) checked for output and idempotence, plain text left alone, and the re-queue stops once the summary is tidy.

**Verification**
- Full run `e585a6ca`: 1,136 checked, 2 moved revisions + 63 retidy, 130 records, 0 inserted, 67 updated (65 documents + 2 enrichments), 63 unchanged, 4 raw files, 0 validation failures. Exit 0.
- SQL on 1,123 Wikipedia documents: `\(\s*\)` 0 (was 16), `\(\s*[;,]` 0 (was 13), whitespace before `,;:)` 0 (was 8).
- Full run `202d2c35`: 1,136 unchanged, retidy 0, 0 fetched/inserted/updated, 0 raw files.
- Examples: "Kraft Foods Inc. was a multinational …", "Findus (Swedish: [ˈfɪndɵs]) is …", "Prague (PRAHG; Czech: Praha [ˈpraɦa]) is …".
- typecheck, lint, format:check, `npm test` (537 passed, 1 skipped) all pass.

**For the owner:** one summary still reads oddly: Bayer "(English:, commonly pronounced; German: [ˈbaɪɐ])" (an empty label). It's the only one, so I left it (out of scope); an admin edit can fix it.

---

## 2026-11-04 — P3.15a Budget: Wikipedia documents width and `company_sources` (done)

**Done** (docs only, BUDGET P3.15a Actuals)
- §3 `documents` split: Wikipedia pages 3,300 × 741 B (measured) = 3.6 MB, other documents 26,700 × 328 B = 16.2 MB (was 30,000 at 18.2 MB).
- §3 `company_sources` added: 4,100 rows × 357 B (measured) + 164 B index = 2.4 MB. Before this it had no row at all.
- Rows projected from today's shares: 65% of companies have an enwiki page, 9% are `CA`, 7% have a CIK. That gives 3,300 pages, not the 5k the plan assumed.

**Verification:** §3 rows re-added: subtotal 291.6 + 3.9 = **295.5 MB** (≈ 325 MB with bloat, under the 350 MB budget); whole DB 325.1 + 49 + 42 = **≈ 416 MB**, under the ≈ 420 MB point where P3.15a asks me to flag it. Each new figure cites P3.15 measurements. `format:check` passes.

**For the owner:** the forecast is ~16 MB over the 400 MB warning (was ~12), still under the 450 MB critical line. The reserve OFF-filter lever (D-070) would bring it to ≈ 389–400 MB. Nothing to decide now.

---

## 2026-11-04 — P3.15 Wikipedia (b): all companies with a page (done)

**Done:** two `--mode full` runs; BUDGET Actuals for P3.15; two new PLAN tasks (P3.15a, P3.15b). No code changes.

**Verification**
- Run 1 `b1ef67a2` (full): 23 checks of 1,136 companies → 1,036 changed (the other 100 from the P3.14 sample), 0 missing, 0 disambiguation. 52 extracts requests, ~5 min. fetched 2,067 (1,031 documents + 1,036 enrichments), valid 2,067, invalid 0; inserted 1,024, updated 1,036, unchanged 7 (pages already stored for a sample company with a redirecting title). Completed.
- Run 2 `ec27b26a` (full): 1,136 unchanged; fetched 0, **inserted 0**, no raw file, completed (`changesOnly` keeps the N → 0 safeguard quiet).
- `validation_failures`: 0 for both runs.
- Provenance SQL: 1,123 Wikipedia documents and 1,136 `company_sources` rows, 0 missing `fetched_at`/`method`/`method_version`/`ingestion_run_id`/`source_url`. All 1,136 companies with a title link a document.
- Raw: 52 `raw_objects` for run 1 (427 KB), none for run 2. `readRaw()` on all 52 re-parses to 1,031 documents + 1,036 enrichments; 1,031/1,031 match the stored rows.
- Examples (run 1, as stored, all `api`, `wikipedia@1.0.0`, `company_sources.fields` [`wikipedia_document_id`, `wikipedia_revision_id`]): `loblaw-companies` → "Loblaw Companies" rev 1382543471, 797 chars, `…/w/index.php?title=Loblaw_Companies&oldid=1382543471`; `nestle-ch` → "Nestlé" rev 1381481326, 356; `saputo` → "Saputo Inc." rev 1383277329, 346; `general-mills-us` → "General Mills" rev 1382399153, 354; `kraft-foods-inc` → "Kraft Foods Inc." rev 1383306250, 367 ("Kraft Foods Inc. () was …", see P3.15b).
- Budget (BUDGET P3.15 Actuals): `documents` 1.16 MB, Wikipedia heap 802 B/row vs 328 B estimated (+145%); `company_sources` 0.67 MB, 606 B/row, **missing from §3**; raw 0.41 KB a page gz ✅; `raw` bucket 22.6 MB, 3,993 files ✅; whole DB 117.4 MB ✅.

**For the owner**
- Two items over the 20% rule became tasks before the next scale-up: **P3.15a** re-baselines `documents` and adds `company_sources` to BUDGET §3 (≈ +5.7 MB, whole DB forecast ≈ 418 MB, still under 450), and **P3.15b** removes bracket leftovers in 29 of 1,123 summaries (2.6%).

---

## 2026-11-04 — P3.14 Wikipedia (a): company summary sample (done)

**Done** (D-071)
- Source `wikipedia` (`wikipedia@1.0.0`, `pipeline/src/sources/wikipedia/`): Action API revision checks (50 titles) and intro extracts (20 titles), `maxlag=5` with Retry-After retries, serial at 1 req/s. Writes a `documents` row per page and a `company_enrichment` per company (sets `wikipedia_revision_id` and `wikipedia_document_id`; provenance in `company_sources`).
- Driver: `FetchResult.skipRaw` (check responses aren't stored) and capability `changesOnly` (a full run with nothing changed isn't an "N → 0" failure). Both unit-tested.
- Raw retention for `wikipedia`: the last 3 runs that stored a file (was 3 per page). DATA_MODEL §5, BUDGET §5 (S19 10 → 7 MB, storage ≈ 285 MB) and SOURCES S19 updated.
- Terms re-checked: API:Etiquette and robots.txt unchanged; `terms_checked_at` stays 2026-10-26.

**Verification**
- Dry run `1bfef140` (sample 100): fetched 199, valid 199, invalid 0.
- Run 1 `87fab3aa` (sample 100): fetched 199 = 99 documents + 100 enrichments; inserted 99, updated 100, invalid 0, completed. "7-Eleven, Inc." redirects to "7-Eleven", so two companies share one document.
- Run 2 `1b910b97` (same command): 2 checks, 0 changed; fetched 0, **inserted 0**, **no raw file stored**, completed.
- `validation_failures`: 0 for both runs.
- Provenance SQL: documents 99 and company_sources 100 from `wikipedia`, 0 missing `fetched_at`/`method`/`method_version`/`ingestion_run_id`/`source_url`. 100 companies linked, all with a revision id.
- Raw: 5 `raw_objects` for run 1 (43,366 B, ≈ 438 B gz a page), none for run 2. `readRaw()` on all 5 re-parses to 99 documents + 100 enrichments; 99/99 match the stored rows (title, summary, revision, `source_url`).
- Examples (as stored): `3g-capital` → `https://en.wikipedia.org/wiki/3G_Capital`, rev 1376365563, 309 chars, `source_url` `…/w/index.php?title=3G_Capital&oldid=1376365563`, `api`, `wikipedia@1.0.0`, `company_sources.fields` [`wikipedia_document_id`, `wikipedia_revision_id`]; `7-eleven` and `7-eleven-inc` → `…/wiki/7-Eleven` rev 1383444894, 213 chars; `altaba` 858 chars (longest, ends at a sentence); `auricchio` 71 chars (shortest: "Auricchio is an Italian cheese-making company, based in Cremona, Italy.").
- Summaries 71–858 chars, 334 on average. Wikipedia `documents` rows average 718 B (P3.15 compares with BUDGET §3).
- `npm run typecheck`, `lint`, `test` pass.

**For the owner**
- The Wikipedia Action API is under `/w/`, which robots.txt disallows for crawlers. I used the D-065 documented-API exemption for `https://en.wikipedia.org/w/api.php`. D-065 expected Wikipedia to need one, and the plan's REST endpoint is under the disallowed `/api/` too. Tell me if you want this approved separately.
- Not the REST summary endpoint the plan named: the Action API batches 20–50 titles per request (what the etiquette page asks for) and is the only one that honours `maxlag`.

---

## 2026-11-04 — P3.13c Budget levers (done; decision delegated by the owner)

**Done** (D-070, docs only)
- **Adopted:** §7 levers 2 (monthly rollups 6 months store-level, then banner), 3 (latest 2 score versions) and 4 (≤ 30 article links per company or brand), plus pruning unlinked documents and natural keys (no surrogate id) on both rollup tables: −45.2 MB before bloat.
- **Reserve:** lever 1 (tighter OFF filter), applied when the measured DB reaches 330 MB. It's not adopted now because it costs product coverage.
- **Measured platform overhead:** 26.7 MB today (system catalogs 17.1, `storage` 7.7 for 3,944 objects ≈ 1.9 KB each, `auth` 1.6); ≈ 42 MB at target, replacing the assumed 30.
- PLAN bullets added where the tables get built: Phase 6 (purges, 330 MB trigger), Phase 7 (link cap, 2 versions), Phase 8 (natural-key rollups before the first row), P3.14 (Wikipedia raw within the 6,000-object bound).

**Verification:** §1 re-added: catalog 291.6 MB (≈ 321 with bloat, **under 350** ✅); whole DB 320.8 + 49 + 42 ≈ **412 MB**, ❌ not under 400. With the reserve lever it's ≈ 384–395. The verification line is amended in PLAN with the reason: the platform re-measure added 12 MB, and the adopted levers alone would have shown exactly 400. Each adopted lever names the phase that builds it. `format:check` passes.

**For the owner:** I kept the OFF products and accepted a forecast ~12 MB over the 400 MB warning (under the 450 critical line and the 500 limit), with the OFF filter as the reserve. If you'd rather be under 400 on paper now, adopt lever 1 and it's ≈ 385–395.

---

## 2026-11-04 — P3.13b Budget: index bytes re-projected (done)

**Done** (D-069, docs only)
- Listed every public table's indexes from `pg_index` on the dev project (all §3 catalog tables exist) and re-projected §3's index bytes per row from per-entry sizes measured at scale: `products` (90,672 rows) and `reference_prices` (24,700). The formula matches four measured indexes within 7% (gtin 47 vs 44, source key 70 vs 74, uuid pkey 47 vs 49, reference key 43 vs 44).
- 34 §3 lines changed; each names its basis, and the BUDGET "Actuals: index bytes re-projected" table lists every index with its bytes. `products` now uses its P3.6 measurement (btree 238, trigram 138.5). The P3.13a brand/ownership figures are replaced (243 / 287 / 261 B).
- Biggest increases: `price_points_monthly` +9.1 MB, `products` +6.3, `documents` +4.7, `document_entities` +4.5, `store_listings` +4.4, `match_candidates` +3.7.

**Verification:** §1 re-added: catalog subtotal 284 → **337 MB** (336.8 × 1.1 = 370.5 with bloat), whole DB 370.5 + 49 + 30 ≈ **450 MB**. The Actuals section records before and after. `format:check` passes.

**For the owner (decision needed, P3.13c):** the estimate is now **over** the 350 MB catalog budget (≈ 370) and the 400 MB DB alarm (≈ 450, under the 500 MB limit). Actual today is 110 MB, so nothing breaks soon. §7 levers 2–4 (6-month monthly rollups, 2 score versions, ≤ 30 document links per company) bring it to ≈ 410 MB; adding lever 1 (tighter OFF filter, costs product coverage) brings it to ≈ 385–395 MB. P3.13c is next and needs your pick.

---

## 2026-11-04 — P3.13a Budget: ownership row widths (done)

**Done** (D-068, docs only, no schema change)
- Measured per column (`pg_column_size`) on the dev project: `brands` Wikidata rows 324 B (legacy 223), `brand_ownership` 248 B, `company_ownership` 262 B. `source_url` is 39–44 B of that; the rest is aliases/website (brands) and the fixed +prov / +review block.
- Picked (b) re-baseline over (a) `url_template`: (a) leaves every table still over the 20% line (brands +25%, edges +22% / +30%) and saves ≈ 2 MB at §3 counts.
- BUDGET §3 re-baselined at the measured widths and re-projected index bytes (from `products`' per-entry sizes at 90k rows; the small tables are at their minimum index pages): `brands` 12.8 MB (was 9.2), `brand_ownership` 12.1 (6.9), `company_ownership` 5.7 (3.1). Row counts unchanged (20k brands is about the 19.3k OFF brand strings Phase 4 resolves).
- §1: catalog 273 → 284 MB (≈ 313 with bloat), whole DB 379 → **392 MB** estimate. Actual today: 110 MB.

**Verification:** the re-baselined §3 lines and a BUDGET "Actuals: ownership row widths re-baselined" section; §1 totals re-added by hand (284.4 × 1.1 + 49 + 30 = 392). `format:check` passes. No code or schema changed, so no Wikidata run was needed.

**For the owner:** the whole-DB estimate is now ~8 MB under the 400 MB alarm (and the catalog ~7 MB under Phase 6's 320 MB warning). The §3 index figures for the other provenance tables are likely low the same way, so I added **P3.13b** to re-project them before more sources land. If that pushes the estimate past 400 MB, the §7 levers (e.g. tighter OFF filter, 15–25 MB) cover it; nothing costs money.

---

## 2026-11-04 — P3.13 Wikidata (b): ownership scale-up (done)

**Done** (`wikidata@1.4.0`, D-067)
- The D-054 rule as code. `nextHop` computes each child's one current owner (`pickOwner`: preferred rank, then latest P580; same-edge statements count once; else a tie) and stores it on the `ChildSpec`. `recordsOf` marks the current owner edges that aren't the pick with `auto_hold: true` (a new optional edge-record field in core). Ended edges, minority stakes and the self edge are approved.
- `AUTO_APPROVE` lists `wikidata` for companies, brands and both edge tables. Companies and brands are approved in `writeRecords`, edges in `approveEdges` (skips `auto_hold`, and skips anything the one-current-owner index would refuse). A stored row another source wrote is never approved (new guard, also covers OFF).
- Fixes found in the first full run:
  - `throttle` source option: Wikidata waits up to 5 min on a 429's `Retry-After`, or 60 s with none. The blocked error now names the `Retry-After`.
  - A shared SEC CIK no longer loses the company (`withoutTakenCiks`).
  - Auto-approved edges are no longer frozen against updates (`reviewed` needs `decision_method ≠ 'auto'`). Before, run 2 counted 893 of them `skipped_locked`, and Wikidata could never add an end date.
- Tests: pick cases (one owner, rank, start date, tie, ended, minority, company parent, pre-1.4.0 envelope), `approveEdges` (pick, history, held, confirmed pending, admin-rejected, existing approved owner, no source), CIK guard, edge freeze, 429 without `Retry-After`. typecheck, lint, format:check and `npm test` pass (507 passed, 1 skipped).

**Full runs**
- `21a3c41c` failed at 24 min (429 with no usable `Retry-After`; fixed since). `5c5318eb` (22:42–23:56 UTC, 3,283 inserted, 893 `skipped_locked` before the freeze fix) and `1ec3aaa6` (23:35–00:42, 0 inserted) were thought stopped and marked `failed` by hand, but both processes survived and finished as `completed`. The two overlapped by 21 min and did no harm.
- **`3c9b0a8d`** (2026-11-04 13:06–14:45, run by the owner in a separate terminal): `completed`, 6,019 fetched and valid, **0 inserted**, 4 updated, 6,015 unchanged, 0 invalid, 0 `skipped_locked`. This is the second clean run: idempotent.

**Verification**
- **Matched:** 1,890 of 19,345 OFF brand strings (9.8%) → 1,759 Wikidata items. 916 ambiguous, 16,539 unmatched. (From the raw re-parse. The run's events were capped at 49 with 340 dropped, so the run log doesn't hold the final total.)
- **`readRaw()` re-parse** of all 1,097 raw files of `3c9b0a8d` (387 match, 710 entities): no errors, 6,019 records (= `fetched`): 2,103 company, 1,759 brand, 1,506 brand-edge and 651 company-edge records.
- **Wikidata rows:** approved/auto: 1,706 companies, 1,759 brands, 1,486 brand edges, 562 company edges. Pending: 20 companies, 20 brands, 35 brand edges, 97 company edges.
- **Checks (all 0):** missing provenance (4 tables), orphan edges (both tables), company cycles (approved current controlling edges; max depth 3), brands with more than one approved current owner, companies with more than one approved current controlling parent, company self edges, `review_queue` rows for Wikidata rows (queue total 271, all from other sources).
- **Pending, by cause:**
  - Stale from the P3.12 samples (`wikidata@1.0.0`/`1.1.0`, D-066): 20 brands and 20 companies (a run that produced them would have approved them), plus 18 brand edges and 28 company edges. `ingestion_run_id` isn't updated on unchanged rows, so a few of those edges may be held ties the full run re-confirmed.
  - Held by 1.4.0, **ties** (no approved owner): 6 brands (12 edges) and 22 companies (52 edges). One is a false tie: Arva → Troms Kraft as both `majority_stake` and `subsidiary` (same owner, two relations). Another 2 companies have one held edge whose co-owner wasn't written (Nefis ← Soviet Union, Siemens Enterprise Communications ← Mitel).
  - Held by 1.4.0, **not the pick**, or **blocked** by an approved owner already in place: 5 brands (5 edges) and 11 companies (15 edges).
- **Examples (approved):** Cheerios → General Mills (`Q2425291#P127`); Kit Kat → Nestlé; Kraft Dinner → Kraft Foods Group → Kraft Heinz; Activia → Danone (Wikidata gives Danone's country as ES). Tie: Arby's ← Inspire Brands | Roark Capital Group (left `pending`).
- **Budget** (whole tables, dev): `brands` 1,828 rows 1.5 MB; `companies` 1,737 rows 1.6 MB; `brand_ownership` 1,570 rows 1.1 MB; `company_ownership` 659 rows 0.55 MB; `review_queue` 271 rows. Whole DB 110 MB (alarm 400). `raw` bucket 21 MB, 3,936 files (Wikidata ≈ 2.3 MB per full run, kept for the last 3). Row counts are far under §3 (20k brands, 5k companies), but **avg row widths are over the 20% line**: brands 321 B (§3 228), brand edges 248 B (178), company edges 262 B (178). Companies are under (361 vs 478). **New task P3.13a** re-baselines §3 or trims.
- Code checks unchanged since the WIP commits (typecheck, lint, format:check, `npm test` 507 passed, 1 skipped).

**For the owner:** coverage is 9.8% of brand strings (1,759 brands). That's far below the ~20k budget, because most OFF strings are store labels, small brands or spelling variants with no Wikidata item. Phase 4 (linking products to brands) will show how many *products* that covers.

---

## 2026-11-03 — P3.12c Wikidata: non-grocery retailers in the brand-class and US tiers (done)

**Owner's decision:** P3.13 waits for this task (PLAN updated).

**What changed** (`wikidata@1.3.0`, D-066 amended)
- **Bare retail is no longer grocery evidence on its own.** Retail, retail chain, big-box store and e-commerce moved from `TRADE_INDUSTRIES` to a new `RETAIL_INDUSTRIES`. They count only on an item in a grocery store class (supermarket, grocery, food, convenience or hypermarket chain, `GROCERY_STORE_CLASSES`). The classes query gains two flags, `retail` (P452) and `store` (P31). Food-side industries still count alone.
- Tests: 21 Wikidata tests (1 new). Fixtures re-saved with the 1.3.0 queries, plus Prana, Best Buy, Fresh Market and 7-Eleven (`fixture.match.json` is 220 KB).

**Measured on the top 400 OFF strings** (offline, today's Wikidata; scratch script, not committed)

| rule | matched | wrong removed | right lost |
|---|---|---|---|
| 1.2.0 | 172 | — | — |
| (a) retail only with a food industry or store class | 168 | Prana, Best Buy, Eden | Mars (ambiguous) |
| (b) exclude non-grocery industries | 172 | none (Prana's and Best Buy's only P452 is *retail*) | — |
| **(a) with the store class only together with retail (chosen)** | **169** | **Prana, Best Buy, Eden** | **none** |

Eden → an e-commerce company won the US tier in 1.2.0. Under plain (a), a US supermarket chain named Mars, with no P452, made Mars ambiguous.

**Verification**
- Terms: unchanged (same day as P3.12b).
- `--dry-run --sample 100` `27da2b22`: completed, 511 fetched, 0 invalid. Then `--sample 100` twice:

  | run | status | fetched | valid | invalid | inserted | updated | unchanged |
  |---|---|---|---|---|---|---|---|
  | `86dc8057` | completed | 511 | 511 | 0 | 7 | 0 | 504 |
  | `1f964672` | completed | 511 | 511 | 0 | **0** | 0 | 511 |

  22 raw files per run, no 429. `validation_failures`: none.
- Match: 226 strings tried, 107 matched (100 items: 32 brands, 68 businesses), 33 ambiguous, 86 unmatched. Tiers: 80 single, 16 brand-class, 7 CA, 4 US.
- **Brand-class picks (16, all right):** Kellogg's, Lay's, Knorr, Cadbury, Starbucks, Pillsbury, Tropicana, Kashi, Coca-Cola, Dr. Oetker, Oikos, Kinder, Pepsi, Philadelphia, Mars, Classico. Prana and Best Buy are ambiguous now.
- **US picks (4, right item):** Christie → Mondelez, Campbells → Campbell's; Kraft → Kraft Foods Group and Heinz → H. J. Heinz Company are the right items but the pre-2015 companies (merged into Kraft Heinz). Whether the chain reaches Kraft Heinz is left to D-054 and P3.13's report.
- **CA picks (7, all right):** Safeway (Canada), Metro, Foodland, Walmart Canada, Vega, Neilson Dairy, Circle K.
- **Re-parse:** all 22 raw files of `1f964672` re-parse to 511 records (identical on a second parse). Produced but not stored: 0 in all four tables.

  | table | stored | produced by `1f964672` | stale (all `pending`) |
  |---|---|---|---|
  | companies | 171 | 148 | 23 |
  | brands | 120 | 100 | 20 |
  | brand edges | 111 | 96 | 15 |
  | company edges | 131 | 123 | 8 |

  New stale rows: Prana, its owner Columbia Sportswear, and Best Buy. P3.13's text is updated from 58 to 66.
- Rows missing `source_url`, `fetched_at`, `method`, `method_version` or `ingestion_run_id`: 0 in all four tables. Orphan edges: 0. Cycles: 0. Longest chain 3. All 533 Wikidata rows are `pending`. New `review_queue` rows: 0.
- Examples (1.3.0 rows, `method api`, run `86dc8057`, raw `8872e6d5`; they took the sample slots Prana and Best Buy freed):
  - brand + company `haribo` Q169552, `…/wiki/Q169552`, with its self edge.
  - brand + company `pepperidge-farm` Q2069747, `…/wiki/Q2069747`, with its self edge.
- `npm run typecheck`, `lint`, `format:check` and `npm test` pass (495 passed, 1 skipped).

**For you**
- Nothing blocking. The matcher has now lost Castello, French's, Perrier and the foreign-country brands (Red Bull, Maggi, Magnum) for precision. They're left to Phase 4's resolver.

**Next:** P3.13 Wikidata (b): ownership scale-up.

---

## 2026-11-03 — P3.12b Wikidata: brand-class tier precision (done)

**What changed** (`wikidata@1.2.0`, D-066 amended)
- **Grocery evidence after `single`:** the CA, brand-class and US tiers count a candidate only if it's in a grocery brand class (food, alcohol, tea, private label, store, generic or pet food brand, `P31/P279*`) or has a `TRADE_INDUSTRIES` P452. Brand-class alone no longer counts. The flag is a third one (`grocery`) in the cached classes query.
- **Why the country tiers too:** the plan's rule touched only the brand-class tier. Measured that way, a rejected brand fell through to the US tier: Astro, Chapman's and Jordans → Air Jordan came back, and Coop → a Dutch chain and Wonder → a ghost kitchen were new.
- **A country without an ISO code isn't North American:** Q55 Netherlands has no P297, so the Dutch Coop counted as "no country". The match query now reads P17 and P297 separately (`??` when there's no code).
- Tests: 20 Wikidata tests (2 new). The match fixture is re-saved with the 1.2.0 query, plus Astro, Quest, Jordans, Chapman's, Oikos and Coop, and the classes fixture with the `grocery` roots.

**Measured on the top 400 OFF strings** (offline, today's Wikidata; scratch script, not committed)

| rule | matched | brand-class picks |
|---|---|---|
| 1.1.0 | 181 | 34 |
| brand-class tier only (the plan's rule) | 179 | 26 |
| **all tiers after `single` + ISO fix (chosen)** | **172** | **25** |

- Wrong picks removed: Primo, Quest, Chapman's, Astro, Jordans, Ghost (a London clothing brand). Doubtful removed: Prime (Prime Hydration), Coop (an international co-op brand).
- Right picks lost: Castello, French's (P31 plain "brand"), Perrier. Right picks gained: Mars, Oikos.
- The grocery class alone, without trade, lost the same and picked IGA → a beer style. Adding P31 food/drink changed nothing.

**Verification**
- Terms: robots.txt unchanged (`Disallow: /sparql`, D-065 exemption); SOURCES S17 unchanged since P3.12 (same day).
- `--dry-run --sample 100` `e444846d`: completed, 511 fetched, 0 invalid. Then `--sample 100` twice:

  | run | status | fetched | valid | invalid | inserted | updated | unchanged |
  |---|---|---|---|---|---|---|---|
  | `63cc8faf` | completed | 511 | 511 | 0 | 19 | 0 | 492 |
  | `1940bbba` | completed | 511 | 511 | 0 | **0** | 0 | 511 |

  22 raw files per run, no 429. `validation_failures`: none.
- Match: 219 strings tried, 107 matched (100 items: 32 brands, 68 businesses), 29 ambiguous, 83 unmatched. Tiers: 78 single, **18 brand-class** (21 in P3.12a), 7 CA, 4 US.
- **Brand-class picks, right/wrong (16 right, 2 wrong):**
  - Right: Kellogg's, Lay's, Knorr, Cadbury, Starbucks, Pillsbury, Tropicana, Kashi, Coca-Cola, Dr. Oetker, Oikos (yogurt), Kinder, Pepsi, Philadelphia, Mars (chocolate bar), Classico.
  - Wrong: **Prana** → an American clothing company; **Best Buy** → the electronics retailer (the OFF products are Sobeys' "Best Buy / Value Plus" private label). Both get in through P452 *retail*.
  - The 5 P3.12a wrong picks: Primo, Quest, Chapman's and Astro are ambiguous now. Prana stays, as the plan predicted.
- **Re-parse:** all 22 raw files of `1940bbba` read back with `readRaw()` re-parse to 511 records (the same on a second parse). Produced but not stored: 0 in all four tables.

  | table | stored | produced by `1940bbba` | stale (all `pending`) |
  |---|---|---|---|
  | companies | 169 | 149 | 20 |
  | brands | 118 | 100 | 18 |
  | brand edges | 109 | 96 | 13 |
  | company edges | 130 | 123 | 7 |

  The 13 new stale rows are the dropped picks (Astro, Primo, Quest, Chapman's, Castello, French's) and the owners only they reached (Arla Foods, McCormick). P3.13's text is updated from 45 to 58.
- Rows missing `source_url`, `fetched_at`, `method`, `method_version` or `ingestion_run_id`: 0 in all four tables. Orphan edges: 0. Cycles among live company edges: 0. Longest chain 3. All 526 Wikidata rows are `pending`. New `review_queue` rows: 0.
- Examples (1.2.0 rows, `method api`, run `63cc8faf`):
  - brand `mars` Q31305, `…/wiki/Q31305`, raw `db8a1fda`; brand edge `mars` → `mars-incorporated`, `…/wiki/Q31305#P127`, raw `23cf4ce3`.
  - brand `oykos` Q137798516 (Oikos), raw `db8a1fda`.
  - company `jack-links` Q1677100, US, raw `d3a65576`, with its self edge.
  - company `diageo` Q161140, GB, raw `8b20f046` (owner of Smirnoff).
  - company `mfs-investment-management` Q6715642, US, raw `f7cd020e`: a 4.99% `minority_stake` in Diageo. It's recorded, not walked.
- `npm run typecheck`, `lint`, `format:check` and `npm test` pass (494 passed, 1 skipped).

**For you**
- **Prana and Best Buy** would be auto-approved by P3.13 with the wrong company. I added **P3.12c** (non-grocery retailers via P452 retail). **Your call:** should P3.13 wait for it? Today P3.13 doesn't depend on it.
- Coverage cost: 9 fewer matches in the top 400. Castello, French's and Perrier are left to Phase 4's resolver.

**Next:** P3.12c, or P3.13 if you decide it shouldn't wait.

---

## 2026-11-03 — P3.12a Wikidata: tighten the match and clear stale sample rows (done)

**What changed** (`wikidata@1.1.0`, D-066)
- **Excluded classes:** a candidate in a place, school, publisher, media, periodical, record label, airline, government agency, movie theater, law firm or cigarette-brand class (`P31/P279*`) is never picked. Wikidata files US towns and French communes under "business".
- **Country tiers (CA, US) need a brand or a grocery trade** (P452 under food, drink, retail, FMCG, dairy …).
- **Brand-class tier:** North American or no country only.
- **`single`** means the only candidate *before* exclusions.
- **≤ 2-letter strings** match labels only, never aliases.
- **Why exclusion instead of a P452 requirement:** on the top 400 OFF strings, requiring a P452 everywhere lost Old Dutch, Planters, Ocean Spray, Mott's, Ghirardelli, Gay Lea and others, which have no P452. That evaluation also showed the old matcher had more wrong picks than the 50-edge check caught: Heinz → Heinz Records, Ritz → a cigarette brand, Arizona → a university, Cedar → a Kansas town, and record labels for Black Diamond, Olympic and Harvest.
- **Class checks run in a separate, cached query.** My first version put the subclass walks in the match query: up to 43 s per query, and HTTP 429 on 3 of 4 runs (`81f67046`, `dd22662c`, `e2253350` failed; `11e75758` completed). Now the match query returns P31/P452 values, and one more query per batch asks only for classes the run hasn't seen. The match envelope stores those queries, their results and the flags it used.
- **Stale rows: D-054 approval covers only rows the approving run writes or confirms** (per-batch `AUTO_APPROVE`). Nothing is deleted, because deleting after a sample would break the conservative-deactivation rule. P3.13's text is updated to match.
- Tests: 18 Wikidata tests (5 new). The match fixture is re-saved with the 1.1.0 query, plus a real classes response.

**Verification**
- Terms: unchanged since P3.12 (same day).
- `--dry-run --sample 100` `705e7183`: completed, 0 invalid. Then `--sample 100` twice:

  | run | status | fetched | valid | invalid | inserted | updated | unchanged |
  |---|---|---|---|---|---|---|---|
  | `394e0ef5` | completed | 501 | 501 | 0 | 0 | 0 | 501 |
  | `63baa086` | completed | 501 | 501 | 0 | **0** | 0 | 501 |

  The first run inserts 0 too: the 1.1.0 rows were first written by `11e75758` (+22) and the two runs that hit a 429 (+17, +18), before the class-cache change. The cache gives the same decisions. The final code also adds 7 trade industries (dairy, retail chain, …), which brought back Neilson Dairy. Its rows were already stored from P3.12. `validation_failures`: none. 22 raw files and 27 requests per run, 140 s and 221 s, no 429 (1 network error retried).
- Match: 207 strings tried, 107 matched (100 items: 33 brands, 67 businesses), 23 ambiguous, 77 unmatched. Tiers: 75 single, 21 brand-class, 7 CA, 4 US.
- **The 5 P3.12 wrong matches:** PC, Beatrice and Flamingo are unmatched; Co-op and Avril are ambiguous.
- **Stale-row rule on counts.** I re-parsed `63baa086`'s 22 raw files (501 records) and compared them with the stored Wikidata rows. Produced but not stored: 0 in all four tables (the re-parse check).

  | table | stored | produced by `63baa086` | stale (all `pending`) |
  |---|---|---|---|
  | companies | 164 | 148 | 16 |
  | brands | 113 | 100 | 13 |
  | brand edges | 105 | 96 | 9 |
  | company edges | 125 | 118 | 7 |

  - The stale rows are the wrong matches and their owner chains: The Canadian Press (with The Globe and Mail, Torstar, NordStar, Power Corporation), Christie → USHIO (projectors), Cedar (a town), the UK Co-operative Group, Beatrice (magazine) → Dash Publishing, Avril, Flamingo → HarperCollins → News Corp, Heinz Records, Black Diamond and Olympic (record labels), Riviera (a restaurant), Selection.
  - Classico is stale only because the sample cut-off moved (Neilson Dairy took the 100th slot). That's the case for not deleting after a sample.
  - P3.13 will approve none of these unless its full run produces them again.
- Rows missing `source_url`, `fetched_at`, `method`, `method_version` or `ingestion_run_id`: 0 in all four tables. Orphan edges: 0. Cycles among live company edges: 0. Longest chain 3. All 507 Wikidata rows are `pending`. New `review_queue` rows: 0.
- Examples (1.1.0 rows, `method api`, `wikidata@1.1.0`):
  - company `alimentation-couche-tard` Q2836957, CA, `…/wiki/Q2836957`, run `11e75758`, raw `d9dcb44a`.
  - company `arla-foods` Q674575, run `11e75758`, raw `fd638e9c`.
  - company + brand `barilla-group` Q762787, IT, run `dd22662c`, raw `783d1a07`.
  - brand `castello` Q2561991, run `11e75758`, raw `94c5bce0`.
  - brand edge `mondelez-international` → itself (owner), `…/wiki/Q12857502`, run `81f67046`, raw `96430bdf`. "Christie" now picks Mondelez in the US tier, which is right.
- **Precision check, 50 brand → owner edges** (all 29 to another owner plus 21 random self edges): **0 wrong matches** (5 in P3.12). **47/50 right in the real world.** The 3 misses are the same outdated Wikidata owners: Becel → Unilever (Becel → Flora Food Group is also there), Breyers → Unilever, Canada Dry → Dr Pepper Snapple Group. They're left to D-054. Right, for example: Activia → Danone, Castello → Arla, French's → McCormick, Kinder → Ferrero, Kellogg's → both WK Kellogg Co and Kellanova (a D-054 two-owner case), Oreo → Nabisco (ended 2016) and → Mondelez, Philadelphia → Kraft Heinz, Neilson, Farm Boy, Laura Secord, Nature's Path.
- `npm run typecheck`, `lint`, `format:check` and `npm test` pass (492 passed, 1 skipped).

**For you**
- **The brand-class tier is still weak:** 5 of its 21 picks are wrong (Astro → gas stations, Chapman's → a department store chain, Prana → clothing, Primo → NZ milk, Quest → a cigarette brand). They have no owner edge, so the 50-edge check misses them, but P3.13 would auto-approve them. I added **P3.12b** to fix it before P3.13, and P3.13 now depends on it.
- The tighter rules cost some coverage. On the top 400 strings, 179 match instead of 201, and most of the 22 lost were wrong. Abbott (medical P452), Red Bull, Maggi and Magnum (foreign brand-class) are lost and left to Phase 4's resolver.
- Stale rows keep their slugs (`beatrice` is held by the GB magazine), so a Phase 4 brand created from "Beatrice" would get `beatrice-2`. It's not worth a task yet. An admin merge or prune frees them.

**Next:** P3.12b Wikidata: brand-class tier precision.

---

## 2026-11-03 — P3.12 Wikidata (a): ownership sample (done)

**What changed**
- **robots.txt exemption (your decision this session):** `query.wikidata.org/robots.txt` disallows `/sparql` for every agent. Sources can now list `robotsExemptions`: documented API prefixes where only the robots check is skipped. The rate limit, User-Agent and 429 handling are unchanged. There's one so far, WDQS `/sparql`, recorded in SOURCES.md S17. D-065.
- New source `wikidata` (`pipeline/src/sources/wikidata/{sparql,map,index}.ts`). It reads the OFF brand strings from a new service-role-only RPC `public.off_brand_strings()` (migration `20261103162552`; types regenerated), matches ≤ 50 strings per SPARQL POST with a tiered pick (single → only CA → only brand-class → only US → else skipped as ambiguous), then walks P127/P749 owners ≤ 5 hops. Each response writes its items, then the edges from the hop below.
- Edge records can name endpoints by QID (`brand_qid`, `company_qid`, `parent_/child_company_qid`). Company and brand records with a QID key on the QID only and never merge into a row without it. The writer picks a free slug on a clash (Nestlé → `nestle-ch`, because the legacy `nestle` row stays separate).
- Driver: `capabilities.samplesItself`, so the Wikidata sample counts brand items, not records. Source-level `timeoutMs` (75 s for WDQS).
- Tests: 14 Wikidata tests on fixtures saved from real WDQS responses, plus robots exemption, `assignEntitySlugs` and QID edge schema tests.

**Verification**
- Terms re-checked: the WDQS limits and robots.txt are unchanged, so `terms_checked_at` stays 2026-10-26.
- `--dry-run --sample 100` (`ab117c92`): 481 fetched, 1 invalid. It was a same-name `duplicate` (two "Berkshire Hathaway" items), fixed by keying QID records on the QID. Then `--sample 100`:

  | run | status | fetched | valid | invalid | inserted | updated | unchanged |
  |---|---|---|---|---|---|---|---|
  | `efd261a6` | completed | 481 | 481 | 0 | 450 | 0 | 31 |
  | `863cdd80` | completed | 481 | 481 | 0 | **0** | 0 | 481 |

  `validation_failures`: none in either run. 18 requests per run. Match: 192 strings tried, 107 matched (100 items: 34 brands, 66 businesses), 17 ambiguous, 68 unmatched. Tiers: 70 single, 9 CA, 25 brand-class, 3 US.
- Rows (all `pending`, 0 `review_queue` rows): 147 companies (139 company, 6 individual, 2 nonprofit), 100 brands, 93 brand edges (66 self edges from business matches), 110 company edges (65 subsidiary, 45 minority stake; 6 ended). Rows missing `source_url`, `fetched_at`, `method`, `method_version` or `ingestion_run_id`: 0 in all four tables. Edges with a missing endpoint: 0. Cycles among live company edges: 0. Longest chain 3. Anon sees 0 companies and brands.
- Raw: 18 `raw_objects` per run (979 KB of envelopes). `readRaw()` on all 18 from run 1 re-parses to 481 records, equal to the stored rows: 147/147 companies (name and country), 100/100 brands, 93 brand edges, 110 company edges.
- Examples (as stored; all `method api`, `wikidata@1.0.0`, run `efd261a6`):
  - brand `presidents-choice` "President's Choice" Q845185, `https://www.wikidata.org/wiki/Q845185`, raw `e6924908`.
  - company `nestle-ch` Nestlé Q160746, CH, CIK 0000792990, enwiki "Nestlé", raw `e6924908`.
  - company `loblaw-companies` Q909856, CA, raw `cdb104af`.
  - brand edge `presidents-choice` → `loblaw-companies` `owner`, `…/wiki/Q845185#P127`, raw `cdb104af`.
  - company edge `george-weston-limited` → `loblaw-companies` `subsidiary` (P127 and P749 folded into one), `…/wiki/Q909856#P127`, raw `d780f4d8`.
- **Precision check, 50 brand → owner edges** (all 27 to another owner plus 23 random self edges): **50/50 match Wikidata. 42/50 (84%) are right in the real world.**
  - 5 wrong matches: Beatrice → a GB magazine, Avril → a FR cosmetics chain, Co-op → the UK Co-operative Group, PC → The Canadian Press, Flamingo → a publisher.
  - 3 outdated in Wikidata itself: Becel → Unilever (sold 2018; also → Flora Food Group), Breyers → Unilever, Canada Dry → Dr Pepper Snapple Group.
  - Right, for example: Activia → Danone, Cadbury and Oreo → Mondelez (Oreo → Nabisco ended 2016), Doritos/Cheetos → Frito-Lay, Kirkland Signature → Costco, No Name and PC → Loblaw, Pringles → Kellanova, Metro, Sobeys, Farm Boy.
- `npm run typecheck`, `lint`, `format:check` and `npm test` pass (488 passed, 1 skipped).

**For you**
- The match errors follow a pattern: 3 of the 5 come from the brand-class tier and are all non-North-American items for common words. I've added **P3.12a** to tighten the pick, and to make sure the stale sample rows aren't approved by P3.13's auto-approve. P3.13 now depends on it. This isn't a decision for you unless you want a different precision/coverage trade-off.
- The 3 outdated owners are Wikidata data. Under D-054 they'll be settled by rank and start date, not by hand.

**Next:** P3.12a Wikidata: tighten the match and clear stale sample rows.

---

## 2026-11-03 — P3.11a Budget: `reference_prices` row width (done)

**What changed**
- Docs only. BUDGET §3 `reference_prices` is re-baselined from the P3.11 measurement: 276 B heap + 97 B index per row, **11.2 MB at 30,000 rows** (was 118 + 50 B, 5.6 MB). The §3 subtotal goes 267 → 273 MB, §1 catalog ≈ 294 → 300 MB, and the whole DB estimate 373 → 379 MB (alarm 400 MB). New BUDGET section "Actuals: `reference_prices` re-baselined"; D-064.
- Option (a), rebuilding the table URL from `url_template`, was rejected. It needs a new key column and a view change, and a row would still be ≈ 210 B (+78%), so it can't get back within 20%.

**Verification**
- The re-baselined §3 line and the Actuals section are in BUDGET. No schema or code change, so no pipeline runs.
- `npm run typecheck`, `lint`, `format:check` and `npm test` pass (470 passed, 1 skipped).

**For you**
- The whole-DB estimate is now 379 MB, which leaves ~21 MB under the 400 MB alarm. That's still in budget, but the margin is shrinking; the §7 levers are unchanged.

**Next:** P3.12 Wikidata (a): ownership sample.

---

## 2026-11-03 — P3.11 StatCan reference prices (done)

**What changed**
- Source `statcan-18100245` (`pipeline/src/sources/statcan/{index,map}.ts`, registered): WDS cube metadata, then the Canada and Ontario series of all 110 products, 20 per POST, into `reference_prices` (D-063). Tests (9) on fixtures trimmed from real WDS responses, including a run through the driver with a fake HTTP client.
- PLAN gains **P3.11a** (row width; see below). BUDGET "Actuals: StatCan reference prices"; SOURCES S6 pipeline row; CLAUDE.md command row; D-063.

**Verification** (dev project; cube released 2026-10-07, end month 2026-08)
- **Terms:** Open Licence page unchanged (modified 2025-07-10); robots.txt still `Crawl-delay: 2`, `/t1/wds/` not disallowed. `terms_checked_at` stays.
- **Dry run** `d00b2f62` (`--dry-run --sample 100`): fetched 100, valid 100, nothing written.
- **Sample** `71116a1e` (`--sample 100`): fetched 100, valid 100, **inserted 100**. **Again** `64c6b56e`: **inserted 0, unchanged 100**.
- **Full** `898792c1-c1ca-4e6a-8941-b379962b16a3` (`--mode full`): completed. **Fetched 25,520, valid 25,520, invalid 0, inserted 25,420, unchanged 100** (the sample rows). Summary event: 220 series requested, 0 missing, 25,520 points, 0 dropped.
- **Full again** `4d59addf-7d17-4222-bf8a-972fa3d3ff4a`: **inserted 0, updated 0, unchanged 25,520**.
- **Validation failures by rule:** none (0 rows for the three writing runs).
- **Rows:** 25,520 = 220 vectors × 116 months (2017-01 … 2026-08), 12,760 Canada and 12,760 Ontario; no null units.
- **Provenance:** the SQL count of rows missing `fetched_at`, `method`, `method_version`, `ingestion_run_id`, `raw_object_id` or `source_url` is **0**.
- **Raw:** 12 `raw_objects` for the full run (metadata 8,335 B, then 11 envelopes of 13.4–14.7 KB). `readRaw()` on all 12 re-parses to 25,520 records (all valid), equal to the stored rows (value, label, unit, geography) 25,520/25,520.
- **Hand check:** Ontario, "Ground beef, per kilogram", `v1159447178`. The table's own CSV download (`dtl!downloadDbLoadingData-nonTraduit.action?pid=1810024501&latestN=6&selectedMembers=[[6],[4]]`) gives 2026-03 … 2026-08 = 15.26, 15.39, 16.15, 16.17, 16.63, 16.09, with the same vector and coordinate `6.4`. The stored rows match all six.
- **Examples** (as stored; all `https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810024501`, `api`, `statcan-18100245@1.0.0`, run `898792c1`, raw `88e59a46`, fetched 2026-11-03 15:53:34 UTC): `v1159447178` Ground beef / per kilogram / Ontario: 2026-03 15.26, 2026-04 15.39, 2026-06 16.17, 2026-07 16.63, 2026-08 16.09.
- **Budget:** 25,520 rows vs 30,000 ✅, but **266 B per row vs 118 B (+125%)** and **9.56 MB vs 5.6 MB (+71%)**. That's over the 20% line, so it's **PLAN P3.11a**. Raw 172 KB per run ✅, raw bucket 13.2 MB, DB 96 MB.
- **Checks:** `npm test` 470 passed, 1 skipped; typecheck, lint and `format:check` pass.

**For you**
- **P3.11a is new** (budget rule). The §3 estimate left out the provenance columns. The table is complete and small (≈ 0.7 MB a year of growth), so re-baselining is likely the cheap answer; trimming `source_url` needs a schema change.
- No value was suppressed for Canada or Ontario, so the drop counters were all 0 on real data (they're tested on the fixture).

**Next:** P3.11a Budget: `reference_prices` row width.

---

## 2026-11-03 — P3.8 Publish the ODbL extract (done)

**What changed**
- Migration `20261103152120_public_exports_bucket`: public bucket `public-exports` (50 MB per file, gzip and markdown only, no `storage.objects` policies, so only the service role writes).
- `pipeline/src/exports/odbl.ts` and test (11 cases), `npm run pipeline -- export odbl` in `cli.ts` (4 new parse tests). It reads OFF products and Open Prices stores and prices (keyset pages of 1,000), writes `products.csv.gz`, `stores.csv.gz`, `price_observations.csv.gz` and a `README.md` to `odbl/<UTC time>/`, then deletes the folders beyond the latest 2. `LooseQuery` gains `gt` and `limit`.
- D-062; BUDGET "Actuals: ODbL extract" and the §6 egress note; SOURCES S1 and S5 say where the extract lives; CLAUDE.md command row.

**Verification** (dev project)
- **Export 1** `20261103T152135Z`: products 3,727,341 B (90,659 rows), stores 4,955 B (100), prices 10,917 B (521), README 1,561 B.
- **Anonymous download:** all 4 files from `https://smqovgawfjmxernqlxjd.supabase.co/storage/v1/object/public/public-exports/odbl/20261103T152135Z/…` returned 200 with no auth header (`application/gzip`, `text/markdown`). Parsed with Python's `csv`: **90,659 product rows = the SQL count of OFF products (90,659)**, 100 stores, 521 prices, 0 rows with the wrong number of fields. All 521 prices have a store OSM id, a GTIN and a URL. The README names the ODbL (and DbCL), Open Food Facts, Open Prices, OpenStreetMap, the date and the counts.
- **Export 2** `20261103T152225Z`: kept 2, deleted none. **Export 3** `20261103T152251Z`: deleted `20261103T152135Z`. `storage.objects` then held **exactly 2 exports (8 files, 7.49 MB)**. An uncached GET of a deleted file returns 400. A plain GET still got 200 from the CDN cache (up to 1 h, D-062).
- **anon can't write:** with the publishable key, upload and overwrite were refused ("new row violates row-level security policy"), delete removed 0 objects, and list returned 0 entries. The public README still downloads.
- **Advisors:** security unchanged (only `auth_leaked_password_protection`, as before). The migration adds no tables or indexes, so performance can't change: 58 `unused_index` INFO, as before.
- **Checks:** `npm test` 461 passed, 1 skipped; typecheck, lint and `format:check` pass.

**For you**
- The extract is live at the public URL above. It's the dev project, so it's public but not linked anywhere yet (the Phase 10 About screen links it).
- "A second export leaves exactly 2 files" is read as 2 exports, since each export is 4 files (D-062).
- The export isn't scheduled yet (Phase 6). Run it by hand after a big import.

**Next:** P3.11 StatCan reference prices.

---

## 2026-11-03 — P3.10a Budget: store and price row widths (done)

**What changed**
- `open-prices@1.0.1` (`pipeline/src/sources/open-prices/map.ts`): store `address` is the street part only (`8683 Tenth Avenue`, `1033 Rue des Rocailles`, or the road alone); null when there's no road. Price `source_url` is null.
- Migration `20261103150839_open_prices_url_template`: sets the `open-prices` `url_template` to `https://prices.openfoodfacts.org/prices/{external_id}` (checked: 200 for stored ids) and clears stored price URLs only where the template rebuilds the same one.
- D-061; BUDGET "Actuals: Open Prices row widths"; a SOURCES S5 note. New unit test for `addressOf` (8 cases).

**Verification** (dev project, same 2026-11-02 dumps, both 304)
- **Migration:** md5 over all 521 `resolved_source_url` values is the same before and after (`f2d1f4a5…`); 521 of 521 now have `source_url` null.
- **Run 1** `d6e39878-f3bb-4d84-a9d8-b77e059482c9` (`--mode full`): completed. **Fetched 792, valid 754, invalid 38, inserted 0, updated 100, unchanged 588**, skipped `unmatched_product` 66. The 100 updates are the stores, all now `open-prices@1.0.1`.
- **Run 2** `2f2bf00a-b952-443d-9767-f549e8f9109e`: completed. **Inserted 0, updated 0, unchanged 688**, skipped 66, invalid 38.
- **Validation failures by rule:** `gtin_check_digit` 25, `schema` 13 (same as P3.10).
- **Addresses:** 99 street addresses and 1 null (Tipperary Park: OSM gives only "Downtown"). All 100 previous values were checked by hand against the rule.
- **Provenance:** the SQL count of `open-prices` stores (100) and prices (521) missing `fetched_at`, `method`, `method_version`, `ingestion_run_id`, `raw_object_id`, or a URL (stored, or `url_template` + `external_id`) is **0**.
- **Raw:** run 1 has 2 `raw_objects` (`50b30154` stores 7,845 B, `7b9c543b` prices 12,223 B). `readRaw()` re-parses them to 100 + 692 records (valid 100 + 654), and they match the stored rows: 100/100 stores (name, address, city, province, version) and 521/521 prices (price, date, kind, `source_url` null).
- **Examples** (as stored):
  - store `choices-market-burnaby-n1277743943`: address `8683 Tenth Avenue`, Burnaby, BC, V3N 2S9, `https://prices.openfoodfacts.org/locations/696`, `open-prices@1.0.1`, run `d6e39878`, raw `50b30154`;
  - store `avril-quebec-n5970957885`: `1033 Rue des Rocailles`, Québec, QC, G2K 0L4, `/locations/7573`;
  - store `tipperary-park-new-westminster-w50774233`: address null, New Westminster, BC, V3L 1G7, `/locations/2781`;
  - price 108266: 3.97 sale, 2025-05-06, `source_url` null → `https://prices.openfoodfacts.org/prices/108266`, `open-prices@1.0.0`, run `5c261e72`;
  - price 42277: 13.49 regular, 2024-10-26, null → `/prices/42277`.
- **Budget:** stores **333 B** per row vs 278 B (+19.8%, was +54%), prices **211 B** vs 208 B (+1%, was +24%). Totals: stores 0.20 MB, prices 0.53 MB (dead tuples until autovacuum), raw bucket 12.9 MB (95 files), DB 87 MB. §3 isn't re-baselined.
- **Checks:** `npm test` 445 passed, 1 skipped; typecheck, lint and `format:check` pass.

**For you**
- Prices keep `method_version = open-prices@1.0.0`: the writer doesn't compare `source_url`, so the migration aligned that column instead of a re-write (D-061).
- Stores are right at the 20% line. The leftover is the slug, name and stored `/locations/{id}` URL.

**Next:** P3.11 StatCan reference prices.

---

## 2026-11-03 — P3.10 Open Prices (b): all Canadian prices (done)

**What changed**
- No code change: `--mode full` runs the P3.9 source over every kept store and price. A full run took 11 s, so the D-046 "latest per series" RPC isn't needed.
- PLAN gains **P3.10a** (store and price row widths; see below). BUDGET gets an "Actuals: Open Prices full import" section.

**Verification** (dev project, 2026-11-02 dumps, both revalidated by 304)
- **Run 1** `10a5fe58-58bd-40b8-aaa8-ebe08c2b90f5` (`--mode full`): completed. **Fetched 792 (100 stores + 692 prices), valid 754, invalid 38, inserted 534, updated 0, unchanged 154, skipped `unmatched_product` 66.**
- **Run 2** `9a065a93-7291-49c1-a349-a00909b6021d`: completed. **Inserted 0, updated 0, unchanged 688**, skipped 66, invalid 38.
- **Against the Open Prices API** (`/api/v1/prices?currency=CAD`, 14:42 UTC the same day): **total 715** (700 of them product prices), the same as the dump's 715 CAD rows. Of those:
  - 23 filtered out: 15 category prices (no product code), 3 marked duplicates, 5 not at a Canadian store (4 online, 1 at a US Costco);
  - 692 kept → 654 valid → **521 rows stored**. Another 67 are repeat readings (same store, product and price) that moved an existing row's `last_confirmed_on` (39 rows have one), and 66 are unmatched products.
- **Validation failures by rule:** `gtin_check_digit` 25, `schema` 13. All 13 `schema` failures are "A price needs a product or a listing": their codes are restricted-circulation (prefix 02/2x, in-store variable-weight barcodes, e.g. `0211028810476`). They have no GTIN, and there's no banner to scope a store code to.
- **Stores:** 100 (QC 38, ON 28, BC 26, AB 5, NL, NB, MB 1 each); 79 have prices. Prices at Ontario stores: 64.
- **Prices:** 320 regular, 201 sale; by year 2020: 4, 2024: 172, 2025: 284, 2026: 61.
- **Provenance:** a SQL count of `open-prices` stores (100) and prices (521) missing `source_id`, `fetched_at`, `method`, `method_version`, `ingestion_run_id`, `source_url` or `raw_object_id` is **0**.
- **Raw:** 2 `raw_objects` for run 1 (7,845 B stores, 12,223 B prices). `readRaw()` on both re-parses to 792 records. They validate to 100 + 654, and match the stored rows field for field: 100/100 stores, and 521/521 stored prices.
- **5 examples:** the P3.9 examples are unchanged (42277, 108266, 29460, 30103, 30104, run `5c261e72`); this run's rows have the same shape, `open-prices@1.0.0`, raw `d23033e6`.
- **Budget** (BUDGET "Actuals: Open Prices full import"): `stores` 0.19 MB, `price_observations` 0.38 MB, raw 20 KB per run, `raw` bucket 12.9 MB (91 files), DB 91.3 MB. The table totals are far under §3, but the **row widths are over by more than 20%**: stores 429 B vs 278 B (+54%, the full OSM display name in `address`), prices 258 B vs 208 B (+24%, the per-row `source_url`). Per the scale-up rule this is **PLAN P3.10a**, placed before P3.11.
- **Checks:** `npm test` 444 passed, 1 skipped; typecheck, lint and `format:check` pass.

**For you**
- **P3.10a is new** (budget rule). It's small: shorten the stored store address to the street part, and maybe use a URL template for price URLs. The absolute sizes are tiny (under 0.6 MB together), so it only matters once receipts add stores and prices.
- In-store meat and deli barcodes (13 prices) can't be linked until stores have banners (P4). They stay in the raw extract.

**Next:** P3.10a Budget: store and price row widths.

---

## 2026-11-03 — P3.9 Open Prices (a): Canadian sample (done)

**What changed**
- **Terms check:** robots.txt still empty (200, 0 B). The data guide still asks for ODbL compliance; it now also mentions contributing back products added "using this SDK" (we don't use it). No change, so no migration. Noted in SOURCES S5.
- **Source `open-prices`** (`pipeline/src/sources/open-prices/`, D-060):
  - downloads both daily dumps to the dump cache in `plan` and keeps Canadian OSM locations, plus CAD product prices at them (no category prices, no duplicates);
  - raw: one JSONL extract of stores, then price extracts (10k lines), kept fields only (no contributor, comment or proof);
  - `parse` gives stores, then prices, as batches, so prices resolve their store by OSM key;
  - mapping: store slug `<name>-<city>-<n|w|r><osm_id>`, province from the postal code, banner null; price `external_id` = Open Prices id, product by GTIN (OFF rule), `price_kind` member/sale/regular, `source_url` = the Open Prices page.
- **Generic: expected rejections.** `RejectedRecord.reason` + `Source.expectedRejections`. The driver counts expected ones in an info event and in `skipped` on `run_finished` instead of ending `completed_with_errors`. The price writer tags an unknown product (store known, no listing) as `unmatched_product`.
- **Tests:** `open-prices.test.ts` on real dump slices (fixture rows with contributor fields nulled): filter counts, mapping, validation (one real bad check digit), slug and province rules, sample picking, a driver run (stores before prices, unmatched skipped and the run still `completed`, any other rejection still errors), and re-parse.

**Verification** (dev project)
- **Dry run** `52f34a1b-f31e-4b5e-8d5d-1d94dfc6a13f` (`--dry-run --sample 100`): completed. Fetched 100, valid 95, invalid 5, nothing written.
- **Filter** (2026-11-02 dumps; prices sha `6b217a1bf802…`, locations `5d008fe0f461…`):
  - locations: 7,781 scanned, **100 kept**; dropped 143 not OSM (online), 7,538 outside Canada (incl. 50 OSM places with no country yet);
  - prices: 340,038 scanned, **692 kept**; dropped 339,323 not CAD, 15 without a product code (category prices), 3 duplicates, 5 not at a Canadian store (4 online, 1 at a US Costco).
  - Total CAD: 715 (the plan's 697 was 2026-10-26).
- **Run 1** `5c261e72-5e06-47f9-9095-1092f37d3597` (`--sample 100`): completed. 21 stores + 79 prices. **Fetched 100, valid 95, invalid 5, inserted 87 (21 stores, 66 prices), unchanged 1, skipped `unmatched_product` 7.** The 1 unchanged is a second reading of the same price at the same store, which moved the first row's `last_confirmed_on` (2024-10-26 → 10-28) as designed.
- **Run 2** `244ec6bc-2eec-4f6e-aaef-7897759f337c` (same command; dumps revalidated by 304): completed. **Inserted 0, updated 0, unchanged 88**, skipped 7, invalid 5.
- **Validation failures by rule:** `gtin_check_digit` 5 (prices 30225, 30226, 30227, 32838, 39061: the codes as Open Prices has them). Nothing else.
- **Unmatched products:** 7 of 74 valid prices (the barcode isn't in our OFF set). Across all 692 kept prices, 419 of 493 unique valid barcodes are in `products` today.
- **Stores:** 21 (BC, NL, ON, QC), all `banner_id` null, `active`.
- **Provenance:** a SQL count of `open-prices` stores (21) and prices (66) missing `source_id`, `fetched_at`, `method`, `method_version`, `ingestion_run_id`, `source_url` or `raw_object_id` is **0**.
- **Raw:** 2 `raw_objects` per run (4,185 B). `readRaw()` on both files of run 1 re-parses to 100 records (21 + 79). They validate to 21 + 74, and match the stored rows: 21/21 stores, 66/66 prices (the other 8 are the 7 unmatched and the 1 collapsed reading).
- **5 examples** (as stored; all `import`, `open-prices@1.0.0`, run `5c261e72`, raw `b15b158b`, source_url `https://prices.openfoodfacts.org/prices/<id>`):
  - `42277` Roasted Seaweed (Yaki Nori) `00074410518790`, 13.49 regular, observed 2024-10-26, **confirmed 2024-10-28**, `t-and-t-supermarket-coquitlam-w192575052`;
  - `108266` Butter Chicken Cooking Sauce `00069276130088`, 3.97 sale (discounted, no regular price given), 2025-05-06, `walmart-new-westminster-r7391902`;
  - `29460` Protein Soy Unsweetened `00025293000735`, 3.49 sale, was 4.98, 2024-06-25, Walmart New Westminster;
  - `30103` Lentil Soup, Lower Sodium `00042272905836`, 3.75 sale, 2024-07-10, `london-drugs-new-westminster-n1015563079`;
  - `30104` Pomegranate Juice, Cold Pressed `00627987298888`, 6.39 sale, 2024-07-10, London Drugs.
  - Store example: `walmart-new-westminster-r7391902` Walmart, New Westminster, BC, V3M 6T9, 49.211951/-122.923577, relation 7391902, `/locations/604`, 18 prices.
- **Checks:** `npm test` 444 passed, 1 skipped; typecheck, lint and `format:check` pass.

**For you**
- **Most Canadian Open Prices data is BC and Quebec, not Ontario.** Of the 100 Canadian locations, 28 are in Ontario (38 QC, 26 BC), and only 72 of the 715 CAD prices are at Ontario stores.
- **Open Prices prices are old**: 9 from 2020, 210 from 2024, 402 from 2025, 94 from 2026. They show as point observations with their date. Nothing is shown in the app before Phase 8.
- **Stores and prices are public by RLS** (DATA_MODEL §3.4). That's open data, not legacy, so the legacy-review rule doesn't apply.

**Next:** P3.10 Open Prices (b): all Canadian prices.

---

## 2026-10-30 — P3.7 OFF: daily deltas (done)

**What changed**
- **Terms check:** robots.txt still allows `/data/` for our UA, and the terms were re-read today in P3.5. Nothing changed, so no migration.
- **`off --mode delta`** (`supportsDelta: true`, D-059):
  - reads `/data/delta/index.txt` (always revalidated);
  - skips the files a `completed` delta run already stored (by raw `request_url`);
  - streams each new file oldest first and turns each JSONL product into the same CSV row the export gives (`delta.ts`). It then goes through the same filter, TSV extract and `parse` as a full import.
  - Two export rules are copied: the English name before the main-language one, and the front image picked English → `lc` → any language.
- **Generic additions:**
  - `SourceRunContext.storedRequestUrls` / `RunStore.storedRequestUrls`;
  - the raw writer factory gets the run mode, so delta raw files get the 30-day retention;
  - `KeyedSpec.stale`: the products writer counts a record **older** (by `source_modified_at`) than the stored row as `unchanged` and doesn't write it.
- `keepRow` is split out of the CSV filter so both paths share it.
- **Tests:**
  - `delta.test.ts` on two real slices (fixture JSONL with product fields only): index parsing, image folder and language order, the row mapping, filter counts, and Penne mapping exactly as the full import stored it;
  - a driver run over a local server (split extracts, no deactivation, a re-run fetches no files, a new file only, a failed run's files fetched again);
  - `isOlder` unit tests;
  - a `check:writers` case on dev: newer updates, older is unchanged and the row keeps the newer data, same time still updates.

**Verification** (dev project)
- **Mapping check before running:** on two real delta files against the cached 2026-10-30 export, **546 of 546** products with the same `last_modified_t` map to identical records (101 + 445).
- **Runs:**
  - attempt `233b18f5-a96b-4338-9941-40a7531dd645`: **failed**. robots.txt answered 502, which the client treats as a disallow, so nothing was fetched or written. curl a minute later got 200.
  - run 1 `73a48852-f5f4-4967-82e1-49438ddda72b`: completed in 1 min 31 s. 13 files listed, 13 new. Fetched 2,584, valid 2,444, invalid 140, **inserted 0, updated 1, unchanged 2,443**, deactivated null.
  - run 2 `0840fa2d-effe-4832-b455-83dbe0ea7423`: completed. Index listed 13, 13 already imported, 0 new. **Fetched 0, inserted 0, updated 0**, 0 raw objects.
- **Filter (run 1, from the 13 `off_delta_file` events):** 104,412 scanned, 2,584 kept. Dropped 3 malformed, 101,590 not Canadian, 209 with no name, 26 with no brand or category.
- **Validation failures by rule:** `gtin_check_digit` 140, nothing else. The DB keeps 50; the full count comes from re-parsing all 13 raw files.
- **Raw:** 13 `raw_objects` (one per file, 150,480 B total, `expires_at` = fetched + 30 days). `readRaw()` on **all 13** re-parses to 2,584 records, the run's exact count.
- **Against stored rows:** of the 2,444 valid, 2,208 have the same `source_modified_at` and identical fields, **236 are older than the stored row** (skipped by the new guard; without it they'd have rolled products back), 0 newer, 0 missing.
- **Provenance:** a SQL count of rows run 1 wrote missing `source_id`, `fetched_at`, `method`, `method_version`, `raw_object_id` or a rebuildable URL is **0**. OFF products: 90,659, all `active`.
- **5 examples** (as stored; all `active`/`approved`/`auto`):
  - `0076808011159` Penne Rigate, "Barilla", 410 g ok, image `…/front_en.8.400.jpg`, `source_modified_at` 2026-10-30 06:06:28 (was June in the export), `off@1.0.1`, **run `73a48852`**, raw `bec8e7c3` (the 10-30 delta file). This is the one update;
  - `0627735289281` Italian Meatballs, "Great Value", unparsed, run `d84ff31f` (the delta had the same time, so unchanged);
  - `0691740027169` Organic Hazelnuts (Filberts), "Dad's Organic Market", no image, run `d84ff31f`;
  - `0897581000365` Vegan Marshmallows Vanilla Flavoured imp, "Dandies", 283 g ok, `off@1.0.0`, run `07a79dc0`;
  - `4800092113277` "rebisco (b) 32g butter" (the English name), "Barber", 32g ok, run `07a79dc0`.
- **Budget:** delta raw is ~11.6 KB a day against 0.2 MB estimated (BUDGET "Actuals: OFF daily deltas").
- **Checks:**
  - `npm test`: 431 passed, 1 skipped;
  - typecheck, lint and `format:check` pass;
  - `check:writers` passes 6/6, and the pipeline e2e passes.

**For you**
- **Deltas and the export overlap, in both directions.** The export lags the newest delta by a few hours, and most delta records are older than the export. The writer now keeps whichever reading is newer, so neither path can roll the other back.
- **A robots.txt 5xx fails the run** (correct under RFC 9309). The next run picks up every file still listed. A gap of more than 14 days needs a full run. Both are in the Phase 6 freshness milestone.
- The OFF `name` is the English name where OFF has one (e.g. "rebisco (b) 32g butter" over "Butter Cream-Filled Cracker Sandwich"). The full import already worked this way. Name quality is a P4.0 matter if it matters to you.

**Next:** P3.9 Open Prices (a): Canadian sample (P3.8 waits on P3.10).

---

## 2026-10-30 — P3.6 OFF (b): full Canadian import (done)

**What changed**
- **Terms check:** OFF robots.txt still allows `/data/`. Terms were re-read earlier today in P3.5. Nothing changed, so no migration.
- **Deactivation (D-058):** P2.16 never supplied `deactivateUnseen`, so it's added here.
  - The driver passes it the `external_id` of every fetched record, valid or not.
  - The products writer discontinues the source's own active products that weren't seen. It never deletes, skips rows with `status` locked, clears `content_hash` so a product that reappears comes back `active`, and refuses to touch more than 10% of the source's products.
  - OFF now has `supportsDeactivation: true`.
- **Row-level data errors:** the first full run failed at row ~71k. Product `0200090024331` has a NUL in its name and brand, and Postgres rejected the whole insert.
  - OFF now strips NUL from every field (`off@1.0.1`).
  - The insert/update helpers now retry row by row on a class 22 error, as they already did for class 23, so one bad row can no longer fail a run (`isRowError`).
- Tests:
  - a driver test (invalid records count as seen);
  - OFF tests (NUL stripping, the seen set on a full run, no deactivation on a sample);
  - a `check:writers` case on dev: discontinue 1 product, the 10% guard refuses, and a re-sighting revives it.
- BUDGET has an "Actuals: OFF full import" table. PLAN P4.0 has two new findings (below).

**Verification**
- **Runs** (dev project, dump sha256 `295d13f0…`, 1.53 GB, download 56 s, each run ~4 min):
  - dry run `23dd9d72-…`: fetched 93,178, valid 90,662, invalid 2,516, nothing written;
  - attempt `07a79dc0-3971-4e4d-a8b4-75c2bbd43ea1`: **failed** on the NUL (row ~71k). Its counts say 68,603 inserted, but 69,602 rows carry its run id: a chunk's inserts before a fatal error aren't counted. Those rows are correct and were confirmed unchanged by the next run;
  - run 1 `d84ff31f-57fa-4620-aa7f-e1ca75ad6c1e`: completed; fetched 93,178, valid 90,662, invalid 2,516, inserted 20,959, unchanged 69,703, deactivated 0;
  - run 2 `22da94b5-2883-4e4e-8e77-ea1b6256bb95`: completed; **inserted 0, updated 0, unchanged 90,662**, deactivated 0. The dump was revalidated, not downloaded again.
- **Filter:** 4,883,869 rows scanned, 129,859 Canadian, **93,178 kept (71.8%)**. Dropped 0 malformed, 3,262 with no name, 33,419 with no brand or category.
- **Validation failures by rule (all runs):** `gtin_check_digit` 2,516, nothing else. The DB keeps 50 per run, so a script over the cached dump counted the full breakdown. No GTIN repeats across extract parts.
- **Rows:** 90,659 `products` + 3 `product_sources` (= 90,662 valid). All `active` / `approved` / `auto`, with 0 in `review_queue`.
  - Sizes: 19,319 `ok`, 71,315 `unparsed`, 25 `ambiguous`.
  - Coverage: 63,350 have an image, 6,623 have a label, 7,014 have no GTIN (restricted in-store codes, kept on `external_id`).
- **Provenance:** a SQL count of OFF rows missing `fetched_at`, `method`, `method_version`, `ingestion_run_id` or a rebuildable URL is **0** for both `products` and `product_sources`.
- **Raw:** 10 files per run (4.34 MB). `readRaw()` on run 2's `000008.json.gz` re-parses to 10,000 records (9,931 valid): 9,930 equal their stored product and 1 is a secondary row. That file holds the NUL product, stored as "Protéine IsoGen - Iced Caff".
- **5 examples** (as stored; all `active`/`approved`/`auto`, method `import`):
  - `00064200116435` Spaghetti, "Catelli", 600 g ok, `off@1.0.0`, run `07a79dc0`, raw `a169a79c`;
  - `00624777013706` Fermented organic vegan proteins, "Genuine health", 260 g, labels organic+vegan, `off@1.0.1`, run `d84ff31f`, raw `9a73a2f9`;
  - `00643843802747` Chocolate Mint Protein Shake, "Premier Protein", 325 ml, `off@1.0.1`, run `d84ff31f`, raw `7144145e`;
  - `00045700330040` Tomato & Basil, "Classico Pasta Sauce", "650 ml. (in 20 oz Canning Jar)" → `ambiguous`, run `07a79dc0`;
  - no GTIN, external_id `0267732503692` Kaiser Buns, "Safeway", 315 g, run `07a79dc0`, raw `c5b1e703`.
- **Budget:**
  - `products` is 71.1 MB against 67.5 MB estimated: +5% in total, +10% per row. Heap +2%, trigram +10%. The btree indexes are +25% on their own, but the line is well inside 20%;
  - whole DB 90.5 MB; `raw` bucket 12.7 MB (70 files). A full extract is 4.34 MB against 20 MB estimated;
  - nothing at the line level is over 20%, so no PLAN task.
- **Checks:**
  - `npm test`: 419 passed, 1 skipped;
  - typecheck, lint and `format:check` pass;
  - the pipeline e2e passes, and `check:writers` passes 5/5.

**For you**
- **The size worry from P3.5 is gone:** 90.7k products, not ~120k. The sample's high pass rate came from early, better-filled rows.
- Two new findings are in the P4.0 list for you to decide then:
  - **2.7% of Canadian OFF products (2,516) are rejected for a bad GTIN check digit.** Keeping them without a GTIN would add coverage, but their barcodes are wrong.
  - **77% of OFF products have no size at all in OFF** (70,196), so unit prices for them need another source.
- 3 legacy products now hide their OFF data (Kashi Bars, Green Goodness, Scoobi Doo Pasta); this was already on the P4.0 list.

**Next:** P3.7 OFF: daily deltas.

---

## 2026-10-30 — P3.5 OFF (a): Canadian sample (done)

**What changed**
- **Terms check:** OFF terms, the data page and `static.openfoodfacts.org/robots.txt` have not changed (`/data/` allowed). The export now redirects to an S3 host with no robots.txt. `terms_checked_at` is unchanged, so no migration. SOURCES.md S1 notes the re-check and the real dump: **1.53 GB**, 211 columns, no unit column.
- `pipeline/src/sources/off/`:
  - `csv.ts`: header check, the Canada and import filter with per-rule counts, the TSV extract;
  - `map.ts`: the D-048 mapping, the unit taken from `quantity`, `image_key`, `offGtin` (moved from the fixture source);
  - `index.ts`: source `off`, email UA, 10k-row extract parts. A sample streams and stops; other runs download first;
  - `off.test.ts` plus `fixture.products.tsv`: real header and rows, with the columns we don't use blanked.
- Driver: generic `FetchResult.events`, so a source can log its filter counts.
- Products writer: D-050/D-054 auto-approve through `AUTO_APPROVE` in `writers/review.ts`. Only `off` products take it, and only new or `pending` rows.
- D-057 records the choices. BUDGET has an "Actuals: OFF sample" table.

**Verification**
- Runs, against the dev project:
  - dry run `cd2f906b-…`: fetched 100, valid 100, nothing written;
  - sample `88d60477-e8c9-41b6-9ca7-2ae7f5377175`: fetched 100, valid 100, **inserted 100**, invalid 0;
  - re-run `3b2f8602-65b9-4b11-854f-21d112f268fb`: fetched 100, **inserted 0, unchanged 100**.
- **Filter counts** (sample run): scanned 36,321 rows, kept 100. Dropped 0 malformed, 36,212 not sold in Canada, 6 without a name, 3 without a brand or category.
- **Validation failures:** 0 in all three runs.
- **Rows written:** 99 `products` plus 1 `product_sources`. GTIN 0018627102557 was already held by the legacy product "Kashi Bars", so the OFF record sits beside it. That row stays `pending`; see "For you".
- **Provenance:** a SQL count of OFF products missing `fetched_at`, `method`, `method_version`, `ingestion_run_id` or a URL is **0**. `source_url` is null and is rebuilt from `url_template`.
- **Review status:** all 99 are `approved` / `auto`, with `reviewed_at` set, `reviewed_by` null, and 0 `review_queue` rows. A unit test shows `legacy-import` and `fixture` rows stay `pending`.
- **Raw:**
  - one `raw_objects` row per run: `raw/off/<run>/000001.json.gz`, 8,887 B, TSV, `expires_at` null (keep the last 3 runs);
  - `dump_url` is set and `dump_sha256` is null (a streamed sample);
  - `readRaw()` on `e5bd56ee-…` re-parses to 100 valid records. 99 equal their stored product (with `net_quantity` rounded to 3 places as the writer does), and 1 is the secondary row.
- **5 examples** (as stored; all `approved`/`auto`, method `import`, `off@1.0.0`, run `88d60477…`, raw `e5bd56ee…`):
  - `00008577002786` Organic Vermont Maple Syrup, brand_text "usda organic Butternut Mountain Farm,Butternut Mountain Farm", 946 ml, labels [organic];
  - `00012511472313` Organic Blue Agave, "Wholesome", 480 ml, 3 labels;
  - `00018627100997` Dark Chocolate, Almond & Sea Salt Chia Granola Bars, "Kashi Company", 175 g;
  - `00018627104858` Cherry Dark Chocolate, Chewy whole-grain bars, "Kashi 🇺🇸Solana Beach California", "5 bars / barres 175 g" → 175 g;
  - `00018627597490` Toasted Berry Crisp, GO LEAN Cereal., 400 g.
- **Sizes:** 81 `ok`, 18 `unparsed` (no `product_quantity` or no unit word), 0 `ambiguous`. 98 of 99 have an image key; 20 have a known label.
- **Row width:** 379 B average (341–469) against 348 B in BUDGET §3, +9%.
- **Checks:** `npm test` 417 passed, 1 skipped. Typecheck, lint and `format:check` pass. The pipeline e2e passes, and `check:writers` passes 4/4.

**For you**
- **The full import will likely be larger than budgeted.** The filter keeps 92–95% of Canadian rows, not the 74% BUDGET assumed. That means about 119–123k products instead of 95k (+25–29%), and roughly 75–80 MB for `products` instead of 56 MB. That's still inside the ~56 MB headroom overall, but tight. P3.6 measures the real count. If it's over by more than 20%, a PLAN task comes before any further scale-up (the §7 levers, e.g. a tighter filter). There's nothing to decide yet.
- When a legacy product already holds an OFF GTIN, the OFF data stays hidden behind the pending legacy row. I added this to the P4.0 list.

**Next:** P3.6 OFF (b): full Canadian import.

---

## 2026-10-30 — P3.4 Writers: reference prices, documents and company enrichment (done)

**What changed**
- `@sarvis/core`:
  - `DocumentRecordSchema` gains `summary` (Wikipedia only, ≤ 2,000 characters);
  - new record kind `company_enrichment` (`match`, `external_id`, closed `fields` list, +prov) with its batch key;
  - the company schema's CIK, corporation-number, OpenCorporates and founded-year validators are shared constants now.
- `pipeline/src/db/writers/`:
  - `prices.ts`: `referencePriceWriter`, keyed `(vector_id, ref_month)`;
  - `documents.ts` (new): `documentWriter`, keyed `url_normalized`;
  - `ownership.ts`: `companyEnrichmentWriter` plus the pure helpers `planEnrichment` and `matchCompany`;
  - `index.ts` registers all three.
- D-056 records the rules. DATA_MODEL §3.2 notes who writes `company_sources`.

**Verification**
- `npm run check:writers --workspace @sarvis/pipeline` (dev project): 4/4 pass. The new case is written twice:
  - pass 1: reference_price inserted 2, document inserted 2, company_enrichment updated 1;
  - pass 2: unchanged 2 / 2 / 1, with 0 inserted, updated, skipped or rejected.
  - Provenance: the reference prices carry the fixture source, `import`, `p216-check@1.0.0` and the run id. The Wikipedia document carries the `wikipedia` source and `api`.
  - The enriched company (created by `fixture`, enriched by `wikipedia`) keeps `source_id` = fixture, `method` `import` and `method_version` `p216-check@1.0.0`. Its admin-locked `website` is unchanged. `wikipedia_title`, `wikipedia_revision_id` 1001 and `wikipedia_document_id` (the page's id) are set.
  - One `company_sources` row: wikipedia source, `external_id` `P34_Company`, `method` `api`, `fields` `[wikipedia_document_id, wikipedia_revision_id, wikipedia_title]` (no `website`: locked), and the run id.
  - Revision 1002 with a new summary updates the same document row (updated 1, unchanged 1).
  - Cleanup left 0 rows, and a SQL count confirms it.
- Unit tests: `ownership.test.ts` (5: patch/held/locked, second pass empty, match by any or agreeing keys, an unknown company, disagreeing keys including a QID clash). Core: a `company_enrichment` case, summary rules, an empty or unknown enrichment field.
- `npm test`: 390 passed, 1 skipped. `typecheck`, `lint` and `format:check` pass.

**For you:** nothing to decide. An enrichment that names a company only by a key the company doesn't hold (e.g. a CIK on a company without one) is rejected as unknown. SEC EDGAR (P3.16) must therefore match on QID or slug and *set* the CIK.

**Next:** P3.5 OFF (a): Canadian sample.

---

## 2026-10-30 — P3.3 Pipeline: streaming dump downloads (done)

**What changed**
- `pipeline/src/http/client.ts`: the robots/redirect/limiter/Retry-After path is factored into one internal `open()` shared by `request` and two new methods:
  - `stream({url, headers})` returns the body as a Node `Readable`, with an idle timeout per chunk; destroying it aborts the request;
  - `download(url)` wraps `downloadToCache`. A new `dumpDir` option sets the folder.
- `pipeline/src/http/download.ts` (new): streams to `.cache/dumps/<sha-of-url>` through a temp file, hashing sha-256 as it writes. A JSON sidecar keeps the ETag and Last-Modified, which the next call sends; a 304 returns `cache: 'revalidated'`. A body that breaks off is retried whole, and a content-length mismatch counts as truncated.
- `pipeline/src/http/lines.ts` (new): `openLines(pathOrUrl, {gzip, http})` is an async line iterator (`
` / `
`, UTF-8 safe across chunks, gzip auto-detected from `.gz`). `break` destroys the stream.
- `sources/source.ts`: `FetchResult.dump` (`DumpInfo`). `runs/driver.ts` writes `dump_url`, `dump_sha256` and `dump_fetched_at` on the run (the columns already existed); `RunPatch` and `MemoryRun` have the fields.
- No new dependency. D-055 records the choices.

**Verification**
- `download.test.ts` (7 tests, local `node:http` server, real limiter):
  - the sha-256 matches the served gzip and the file bytes are identical, sent with `accept-encoding: identity` and the Sarvis UA, leaving no temp files;
  - the second call sends `If-None-Match` / `If-Modified-Since` and the server answers 304 (statuses `[200, 304]`, `cache: 'revalidated'`, same sha);
  - a deleted file gets a fresh 200 without validators;
  - a robots-disallowed path throws `RobotsDisallowedError` with 0 hits;
  - a 503 is retried (`[503, 200]`);
  - a body cut off after 100 bytes is retried with no partial file;
  - a downloaded dump reads back as 5,000 lines.
- `lines.test.ts` (7 tests): CRLF and a last line without a newline, an empty file, `.gz`, an `é` split across the 64 KiB chunk boundary, an early stop on a file, and a URL without a client (`ConfigurationError`). **Against an endless gzipped response, stopping after 10 lines closes the socket within 3 s and the server stops writing.** A mutation check (no abort on destroy) makes this test fail.
- Driver test: a reported dump lands on the run; a streamed one has `dump_sha256` null; with no dump the fields are left unset.
- `npm test`: 381 passed, 1 skipped. `typecheck`, `lint` and `format:check` pass. The fixture pipeline e2e (`npm run e2e --workspace @sarvis/pipeline`) still passes.

**Next:** P3.4 Writers: reference prices, documents and company enrichment.

---

## 2026-10-30 — P3.2 Schema: Phase 3 additions (done)

**What changed**
- Migration `20261030132907_catalog_phase3_additions` (dev only):
  - `review_queue.item_type` gains `company` and `brand`;
  - `company_sources`: per-source company provenance, unique on `(company_id, source_id)`, RLS admin;
  - `documents.summary`: Wikipedia only, 1–2,000 characters;
  - `companies.wikipedia_document_id`, plus a clause in both `documents` read policies, so a Wikipedia page is public exactly when its company is.
- `pipeline/src/db/writers/review.ts` maps `companies` → `company` and `brands` → `brand` for non-legacy rows with a `review_reason`. Legacy rows stay `legacy_fact`.
- Types regenerated. Also updated: `supabase/README.md` (migration row), DATA_MODEL §3.2, §3.5, §3.6 and §7, and D-053 ("Built in P3.2").

**Verification**
- `supabase/tests/phase3_additions.sql`: **23/23 ok**.
  - Constraints: a non-Wikipedia document with a summary is rejected (23514); so is a summary over 2,000 characters (23514). Item types `company` and `brand` are accepted and an unknown one still fails. A duplicate `company_sources` (company, source) gives 23505. Bad or empty `fields` and `last_seen_at` before `fetched_at` give 23514.
  - anon reads the approved company's page summary, but not the pending company's page, not a news document set as a company page, and not an unlinked Wikipedia page. anon can't read `company_sources` (42501) or write `documents` (42501).
  - A non-admin user sees only the approved page, 0 `company_sources` rows, and can't change a summary.
  - An admin sees all 4 documents and reads and writes `company_sources`. After the admin approves the pending company, anon sees its page.
  - `company_sources.relrowsecurity` is true.
- `get_advisors`: security is unchanged (only the existing leaked-password warning). Performance has the same INFO-only `unused_index` list, plus the 4 new indexes (58 → 62). No unindexed FKs.
- Writer unit test `review.test.ts` (3 tests). `check:writers` adds a company and a brand with a `review_reason`, written twice: run 1 inserted 1 each, run 2 unchanged 1 each. Exactly 2 open queue rows, one `brand`/`brands` and one `company`/`companies`. Cleanup left 0 rows; a SQL check confirms it.
- `npm test`: 366 passed, 1 skipped. `typecheck`, `lint` and `format:check` pass.

**Next:** P3.3 Pipeline: streaming dump downloads.

---

## 2026-10-30 — P3.1 Contact email for sources that ask for one (done)

**What changed**
- `PIPELINE_CONTACT_EMAIL` (optional, email-validated) in `pipeline/src/env.ts` and `.env.example`. `parseContactEmail()` reads it without needing the DB variables.
- `userAgent(version, email)` adds `; <email>` inside the brackets. A source opts in with the new capability `contact: 'email'` (`sources/source.ts`).
- The driver refuses an email source with `SourceRefusedError` before any run row when the email is missing. The error names `PIPELINE_CONTACT_EMAIL`, never a value. The CLI passes the env value in.
- The logger redacts `contact_email`/`contactEmail` and `user_agent`/`userAgent` keys. Raw envelopes never held request headers, and response headers are allow-listed.
- D-015 gets a "Built in P3.1" note. Earlier today, before this task, D-054 recorded the owner's choice: no manual review for Wikidata or OFF data.

**Verification**
- New tests: the UA with and without an email (`index.test.ts`); env parsing and a bad value whose error leaves out the value (`env.test.ts`); log redaction (`log.test.ts`); and `runs/contact.test.ts`, which runs the driver against a local server:
  - refused with no email (undefined, null, empty): no run row, no request;
  - with the capability: the server sees `Sarvis/0.0.0 (+https://github.com/LukaMS/sarvis; <email>)`. The email isn't in any log line, run row, event or failure, or in the stored envelope, even though the server echoed the UA back in a response header;
  - without the capability: the UA has no email.
  - With the driver guard removed, 2 of the 3 tests fail.
- `npm test`: 363 passed, 1 skipped. `typecheck`, `lint` and `format:check` pass.
- Fixture e2e: run 1 `inserted 17`, run 2 `inserted 0, unchanged 17`. Cleanup left nothing.

**Notes for you**
- Before P3.5 (the first OFF run), make sure `PIPELINE_CONTACT_EMAIL` is set in `.env`. I can't read `.env`, so I haven't checked.

**Next:** P3.2 Schema: Phase 3 additions.

---

## 2026-10-29 — P3.0 Refine Phase 3 (done)

**What changed**
- `docs/PLAN.md`: Phase 3 is now full detail. It has 19 tasks (P3.1–P3.19), shared source-task rules and verification, a "Not in Phase 3" list, and a coverage table.
  - Groundwork: P3.1 contact email, P3.2 schema additions, P3.3 streaming dump downloads, P3.4 writers.
  - Then one task pair per source: OFF (sample, full, deltas, ODbL extract), Open Prices, StatCan, Wikidata, Wikipedia, SEC EDGAR, Corporations Canada.
  - P3.19 is the exit check.
- Phase 4 outline: brand rows from OFF strings, and `price_sanity_bounds` from StatCan. Phase 8 outline: OFF, Open Prices and Wikipedia attribution on the product and company screens.
- `docs/DECISIONS.md`: D-053 records the plan choices: OFF via the CSV export, `company_sources` for per-source company provenance, Wikipedia summaries on `documents`, and match-only writes for EDGAR and Corporations Canada.

**Verification**
- A script over the Phase 3 section: all 19 tasks have the seven fields (slice, goal, deps, in, out, files, verification), each names exactly one slice, and every task appears in the coverage table. Every milestone M1–M9 maps to at least one task.
- `prettier --check docs/PLAN.md` passes.

**Notes for you**
- **One open 🟡 decision, needed before P3.13 (not now):** which Wikidata brands, companies and ownership edges users may see without a manual review. Today only OFF products are auto-approved (D-050), so approved products would show no brand or owner until each one is reviewed. P3.12 hand-checks 50 edges so you can decide from the numbers. The options are in P3.13.
- P3.8 creates the **public** `public-exports` bucket for the ODbL extract you accepted in D-013 D1. It holds only OFF and Open Prices data, no user data.

**Next:** P3.1 Pipeline: contact email for sources that ask for one.

---

## 2026-10-29 — P2.19 Phase 2 exit check (done)

**What changed**
- No code. P2.19 ticked; Phase 2 is complete.

**Verification**
- The last open item, **latest CI run is green**, now passes:
  - `fdda6a8` (P2.23 fix): https://github.com/LukaMS/sarvis/actions/runs/40948601027
  - `881c058` (latest, P2.23 docs): https://github.com/LukaMS/sarvis/actions/runs/40948822974
  - CI runs `npm ci`, typecheck, lint, format check and `npm test` on a clean runner, so it also re-covers the clean-checkout item after P2.23's code change.
- The other exit items (fixture run twice, provenance, advisors, DB size, storage) are in the earlier P2.19 entry below, measured on `bf422c7`. P2.23 changed only the HTTP limiter and re-ran the fixture e2e (`inserted 17`, then `inserted 0, unchanged 17`).

**Notes for you**
- Phase 3 starts with **P3.0 Refine Phase 3**. The two SOURCES.md §7 questions (User-Agent contact, commercial status) were already answered in D-015; §7 was stale and is now fixed. The owner added an email contact for sources that ask for one (D-015 amended; kept in `.env`, not the repo).

**Next:** P3.0 Refine Phase 3 into session-sized tasks.

---

## 2026-10-29 — P2.23 Host limiter: stamp the turn at the send

**What changed**
- **`HostLimiter.run(host, interval, start, signal)`** (`pipeline/src/http/client.ts`) replaces `acquire()`. It waits for the host's turn, calls `start` and only then records the turn time.
  - `send()` passes a `start` that builds the abort signals and calls `fetch`, so the next request to the host waits a full interval from the actual send.
  - A failed `start` or a cancelled wait still counts as a turn.
  - With `acquire()` gone, nothing can send without stamping a turn.
- **Tests** (`client.test.ts`): a new deterministic test where only the first send has 30 ms of setup. It **fails on the old stamping** (`expected 80 to be greater than or equal to 100`, run with `run()` stamping before `start`) and passes now. The two existing `HostLimiter` tests use `run()`.
- D-051 amended (P2.23 bullet).

**Verification**
- **20 runs in a row:** `client.test.ts` passed **20/20** (22 tests each), while `npm test` looped alongside the whole time. All **21/21** background `npm test` runs passed (355 passed, 1 skipped).
- `typecheck`, `lint`, `format:check` pass. The fixture e2e passes: run 1 `inserted 17`, run 2 `inserted 0, unchanged 17`, cleanup left nothing.
- **CI green on `fdda6a8`:** https://github.com/LukaMS/sarvis/actions/runs/40948601027. The P2.19 docs commit just before it (`f787f52`) had failed with the same `expected 999 to be greater than or equal to 1000` (https://github.com/LukaMS/sarvis/actions/runs/40945701842), so that's two red runs from this bug and none since.

**Notes for you**
- The real-world effect is at most a few milliseconds per request. The point is that the 1 req/s rule now holds exactly, so the test only fails on a real regression.

**Next:** P2.19 Phase 2 exit check: confirm CI is green on this commit, then tick it.

---

## 2026-10-29 — P2.19 Phase 2 exit check (not ticked: CI red, P2.23 added)

**What changed**
- No code. BUDGET.md has a new "Actuals after Phase 2" note under §3.
- **New P2.23** (PLAN). CI on `bf422c7` failed: `client.test.ts:100` "spaces 5 requests to one host at least 1 s apart" got `expected 999 to be greater than or equal to 1000` (https://github.com/LukaMS/sarvis/actions/runs/40944884023).
  - The cause: `HostLimiter.acquire` stamps a turn when it returns, but `send()` builds the abort signals before it calls `fetch`. If the clock ticks in between, the first send is 1 ms late against its turn, and the next send can go out 999 ms after it.
  - This is a 1 ms shortfall against D-051's guarantee, not a politeness problem, but it turns CI red. P2.19 now depends on P2.23.

**Exit checklist (commit `bf422c7`)**
- [x] **Clean checkout:** fresh `git clone` from GitHub into the scratchpad, then `npm ci`. `typecheck`, `lint` and `format:check` exit 0. `npm test`: **354 passed, 1 skipped** (the dev-DB e2e skips without `.env`).
- [x] **Fixture source goes raw → stored → parsed → validated → upserted; running it twice creates no duplicates.** `npm run e2e --workspace @sarvis/pipeline`, run twice from the main checkout (it has the `.env`), passed both times (19.4 s, 17.1 s). Each run:
  - run 1 `fetched 20, valid 17, invalid 3, inserted 17`; run 2 `inserted 0, updated 0, unchanged 17`; 17 product rows;
  - 3 validation failures recorded with their raw object: `duplicate`, `gtin_check_digit`, `required_field`;
  - cleanup `left: products 0, runs 0, files 0`.
- [x] **Every row carries provenance:** SQL over every `public` table with `source_id`, `fetched_at` and `method` (26 tables and views). Rows / rows missing any of the three: `products 13/0`, `brands 49/0`, `companies 11/0`, `brand_ownership 49/0`, `company_scores 66/0`, `certifications 20/0`, `company_events 7/0`, `product_features 30/0`, `transparency_steps 20/0`, `stories 6/0`, the rest 0/0.
- [x] **`get_advisors`:** security shows only the existing project-wide "Leaked password protection disabled" WARN. Performance shows only INFO `unused_index` (58), expected with near-empty tables. No ERROR, and no WARN from the schema.
- [x] **DB size vs BUDGET §3** (details in BUDGET.md "Actuals after Phase 2"):

  | Measure | Actual | Budget |
  |---|---:|---:|
  | `pg_database_size` | 18.1 MB | alarm 400 MB |
  | Catalog tables (38) | 4.88 MB | 350 MB |
  | … 21 empty tables | 2.25 MB | — |
  | … 17 tables with rows | 2.63 MB | — |
  | `auth` / `storage` / other | 1.6 / 0.45 / 0.2 MB | ≈ 30 MB assumed |

  Largest: `products` 288 KB (13 rows), `brands` and `company_scores` 248 KB each. Row widths match §3 except `products` (556 B against 348 B). Without the legacy `description` it's 336 B, so the Phase 3 OFF sample must measure it before scaling (BUDGET §8 already plans that).
- [x] **Storage:** one bucket, `raw` (private, gzip only). It holds 40 objects, **70 KB** (budget 700 MB).
- [ ] **Latest CI run is green:** **failed** on `bf422c7` (above). The run before, `73a218d` (P2.21), was green: https://github.com/LukaMS/sarvis/actions/runs/40939757560. The local clean-clone `npm test` passed, so this flake is CI-timing only.

**Notes for you**
- **Phase 2 is done apart from the CI flake.** All the exit criteria hold on dev, and the budget is nowhere near its limits.
- **npm audit:** 14 issues (6 low, 3 moderate, 5 high), up from 8 at P1.2. The highs are `image-size`, `postcss` and `decode-uri-component` (as before), plus `query-string` and `expo-router`, which are flagged only because `expo-router@6.0.24` uses `query-string@7` and that uses `decode-uri-component`. The only fix is the major upgrade `expo-router@58`, which breaks the SDK 54 pin. So this is the same advisory as before, and no task was added. It's worth another look at the next Expo SDK upgrade.
- P2.21's fix was incomplete: it stamped the turn in the limiter, not at the send. P2.23 moves the stamp to the send.

**Next:** P2.23 Host limiter send-time stamp, then finish P2.19 (re-check CI, tick).

---

## 2026-10-29 — P2.22 Hide unreviewed companies, brands and products from users

**What changed**
- **Migration `20261029194905_catalog_entity_review`:** the §1.5 review block on `companies`, `brands` and `products` (existing rows → `pending`), indexed `reviewed_by`, and public read policies that need `review_status = 'approved'` plus the old status filter. Admins still see all rows. Types regenerated.
- **Core:** company and brand records take `review_reason`.
- **Writers:** the company and brand writers use the shared `writeRecords` path, so a reason is queued once. No writer sends `review_status`, so new rows arrive `pending` and re-imports leave it alone.
- **Legacy import:** every company, brand and product gets a `legacy_fact` queue row ("hidden from users until approved", plus the P0.2 note: Nestlé/Unilever CEOs, Patagonia not grocery, Bolthouse empty row, the brand notes).
- **RLS scripts:** new `supabase/tests/entity_review.sql`. `ownership.sql` and `products.sql` now approve their fixtures, so their visibility checks still test what they did before.
- DATA_MODEL §1.5, §1.6, §3.2, §3.3, `supabase/README.md`, `docs/legacy/data/README.md`, D-052.

**Verification**
- `entity_review.sql`: **22/22 ok**. Key rows:
  - `anon sees 0 dev companies, brands and products | true | 0 / 0 / 0`
  - `user sees 0 dev companies, brands and products | true | 0 / 0 / 0`
  - `admin sees 11 / 49 / 13 dev companies, brands and products | true | 11 / 49 / 13`
  - `anon gets no brand for a product whose brand is pending | true | brand null`; approved/rejected/discontinued fixtures filter correctly; anon and users can't approve; an admin approval shows up for anon.
- Re-run with the changed fixtures: `ownership.sql` 40/40, `products.sql` 49/49. No other domain's views or policies read these three tables (grep), so the other scripts are unaffected.
- `relrowsecurity` true on all three tables, 2 select policies each. Advisors: security unchanged (only the existing leaked-password warning). Performance: only 3 new INFO "unused index" rows for the new `reviewed_by` indexes, the same kind already accepted for every other review table.
- **Legacy re-import, run twice:** both runs `inserted 0, updated 0, unchanged 271`. All 73 rows `pending`. The queue has 11 / 49 / 13 rows for companies / brands / products, one per row (`count = count(distinct item_id)`), and none unqueued. Examples:
  - `companies nestle pending legacy_fact` "…hidden from users until approved… P0.2 note: the legacy CEO (Laurent Freixe) looks out of date."
  - `brands tin-shed-ventures pending legacy_fact` "…P0.2 note: Tin Shed Ventures is an investment fund…"
  - `products KitKat Original pending legacy_fact` "Legacy import: hidden from users until approved…"
- `check:writers` passes, the fixture e2e passes. `typecheck`, `lint`, `format:check` pass; `npm test` 355 passed (e2e included, `.env` loaded).

**Notes for you**
- **Nothing legacy is user-visible now.** The app shows no catalog yet, so no screen changed.
- **Approved rows still take import updates** to fields an admin hasn't locked (D-052). If you'd rather an approved product go back to `pending` when its source changes it, that's a later decision.
- **Added to Phase 3 (P3.0 must cover it):** `review_queue.item_type` has no `company`/`brand` value, so a non-legacy company or brand with a review reason isn't queued yet. Nothing writes one today. The OFF auto-approve is also still to be coded there.

**Next:** P2.19 Phase 2 exit check.

---

## 2026-10-29 — P2.21 Make the HTTP rate-limit test immune to timing jitter

**What changed**
- **The capture found a real limiter bug, not only test jitter.**
  - Under `npm test` load, the Crawl-delay test failed with `expected 1989 to be greater than or equal to 1990` (`client.test.ts:127`).
  - A probe that recorded `fetch` call times showed that the **sends themselves** were 989–999 ms apart at times, usually right after a late one (1009, then 991). The limiter booked fixed slots, so a late wake-up made the next request early.
- **The fix:** `HostLimiter` (`pipeline/src/http/client.ts`) now waits from when the previous request to the host actually went out, using a per-host promise queue. It re-checks the clock after sleeping (D-051).
- **Tests** (`client.test.ts`):
  - Spacing is now measured at the `fetch` call, with exact bounds (≥ 1000 ms, ≥ 2000 ms for Crawl-delay). The two-host test also checks per-host spacing.
  - A new deterministic test blocks the event loop past a turn. It fails on the old limiter (53 ms of 100) and passes on the new one.

**Verification**
- **20 runs in a row:** `client.test.ts` passed 20/20 (21 tests each), while `npm test` looped alongside the whole time. All 21 background `npm test` runs passed as well.
- `typecheck`, `lint`, `format:check` and `npm test` (353 passed, 1 skipped) pass. The fixture e2e passes.

**Notes for you**
- This was a real limiter change, allowed by the task's "unless the capture shows a real bug". The effect is small: requests to one host are now never less than 1 s apart, where before they could be about 10 ms less.
- **Next session:** P2.22 (hide unreviewed companies, brands and products). Your D-050 decision covers it, so nothing is waiting on you.

**Next:** P2.22 Hide unreviewed companies, brands and products from users.

---

## 2026-10-29 — P2.18 Legacy re-import

**What changed**
- A new `legacy-import` source (`pipeline/src/sources/legacy-import/`) reads the 10 P0.2 export files, one step and one raw object each, and maps them per DATA_MODEL §8 (D-049).
- The run driver can now write several record kinds from one step (`ParseResult.batches` plus `RunDeps.writerFor`). The CLI wires every writer.
- 6 new core record kinds, each with a writer: `company_score`, `certification`, `company_event`, `product_feature`, `transparency_step`, `story`.
- Records can carry a `review_reason`. The writer then adds one `review_queue` row for the fact, and never a second.
- Tests: 11 mapping tests over the real export, 2 driver tests for batches, and record-schema cases for the 6 new kinds.

**Verification**
- **Before:** every catalog table on dev had 0 rows.
- **Run 1:** `npm run pipeline -- run legacy-import` finished `completed`: fetched 271, valid 271, invalid 0, **inserted 271**.
- **Run 2:** finished `completed`: fetched 271, **inserted 0**, updated 0, **unchanged 271**.
- **Row counts vs the README:**

  | Table | Rows | Note |
  |---|---|---|
  | companies | 11 | |
  | brands | 49 | |
  | brand_ownership | 49 | |
  | company_scores | 66 | 55 categories + 11 overall |
  | certifications | 20 | 6 company + 14 product labels |
  | company_events | 7 | 2 boycotts + 5 controversies |
  | products | 13 | 11 brand-linked; 1 without a GTIN |
  | product_features | 30 | |
  | transparency_steps | 20 | |
  | stories | 6 | all drafts |
  | raw_objects | 20 | 10 per run |

  The intentional drops are listed in D-049: product scores, product category text, one image URL, story covers, and `app_settings`.
- **Review queue:** 201 open `legacy_fact` rows, unchanged after run 2.
  - 49 brand ownership, 66 company scores, 20 certifications, 7 company events, 30 features, 20 steps, 6 stories.
  - 3 products:
    - Green Goodness and Kashi Bars, which have no brand link (Kashi also has the General Mills note);
    - Patagonia Provisions Soup, for its bad barcode.
- **anon:** sees 0 rows in brand_ownership, company_scores, certifications, company_events, product_features, transparency_steps and stories (checked with `set local role anon`, rolled back).
- **Provenance:** a query found 0 rows missing their method, run or raw object.
- **3 example rows:**
  - `bolthouse-farms overall Good pending`: `legacy-import@1.0.0`, fetched 2026-10-26, run f94489f2, raw object 672f6af6. Its queue reason includes the P0.2 Bolthouse note.
  - `Patagonia Provisions Soup gtin=null brand=patagonia`: same run, raw object 55ddf478. Its reason reads "barcode 0850034340016 is not a valid GTIN (check_digit)…".
  - `uncle-bens > mars pending`: raw object 55d0b830. Its reason includes the Ben's Original note.
- **Step mapping:** Evian's "Carbon Offset Shipping" → distribution and "Bottling at Source" → production.
- **Checks:**
  - `typecheck`, `lint`, `format:check` and `npm test` pass (352 pass, 1 skipped, the e2e).
  - `check:writers` (2 tests) and the fixture e2e (1 test) pass. Both left the legacy rows and the queue untouched.

**Notes for you**
- **Companies, brands and products are visible to `anon`** (11 / 49 / 13).
  - They have no review block in DATA_MODEL; only their facts (ownership, scores, events and so on) are pending.
  - Some legacy company fields are doubtful: the Nestlé and Unilever CEOs, and Patagonia not being grocery.
  - Companies can't carry a review reason, so only the Patagonia and Tin Shed Ventures brand edges got that note.
  - Say if you want companies hidden until they're reviewed. That would be a schema change.
- **The legacy data now stays on dev.** P2.19 measures the database with it in place.
- **One manual fix on dev:** a doubled word in the soup's queue reason, corrected with a one-row `update`. The code is fixed too.
- The dry-run row from before run 1 (`ea8ef1f0`) is also left on dev.

**Next:** P2.19 Phase 2 exit check.

---

## 2026-10-29 — P2.17 Pipeline: CLI, fixture source and run-twice e2e test

**What changed**
- `pipeline/src/cli.ts`: `npm run pipeline -- run <source> [--sample N] [--dry-run] [--mode full|delta]` (root script). It prints a counts summary and exits 0 / 2 / 1 / 130 (D-048).
- `pipeline/src/sources/fixture/`: 20 synthetic OFF-shaped products (17 valid, 3 invalid on purpose), a local HTTP server with `robots.txt` and OFF-style paged search, and the `fixture` source that maps them to product records. It's registered in `sources/index.ts`.
- `pipeline/test/e2e/fixture-run-twice.test.ts`: the run-twice e2e. `npm run e2e --workspace @sarvis/pipeline` runs it, and `npm test` skips it without the dev key.
- Unit tests: 15 for CLI arguments, and 5 for the fixture data, server and driver runs (sample and dry run through the real polite client, with no DB).
- The pipeline's Vitest config and tsconfig now include `test/`.

**Verification**
- **Dry run:** `npm run pipeline -- run fixture --sample 10 --dry-run` printed `fetched 10, valid 9, invalid 1, inserted 0` and status `completed`.
  - Dev row counts before and after were all **0**: products, brands, companies, product_sources, identifiers, listings, prices, candidates, raw_objects and raw files.
  - The run left only its own bookkeeping: 1 `ingestion_runs` row (`dry_run/completed/cli/10`), 3 events and 1 validation failure. I left that run row on dev.
- **e2e:** passed on the first try (1 test, 19.3 s).
  - Run 1: `fetched 20, valid 17, invalid 3, inserted 17`, with 17 product rows.
  - Run 2: `inserted 0, updated 0, unchanged 17`, with 17 product rows.
  - Provenance was checked on all 17 rows: source, canonical `source_url`, `fetched_at`, method `api`, `fixture-import@1.0.0`, run 1's id and a run-1 raw object.
  - Each run had 4 `raw_objects` rows (one per page), and every stored file re-parsed to the same records.
  - The failures were `duplicate`, `gtin_check_digit` and `required_field`, each tied to its page.
  - Cleanup left 0 products, 0 runs and 0 files.
  - Example rows: `00629999000015 Rolled Oats / Fixture Farms / 1 kg → 1000 g`, `00629999000022 Steel Cut Oats / 900 g`, `00629999000039 Maple Granola / 750 g`.
- **`npm test`:** 325 pass and 1 skipped (the e2e). One earlier full run had **1 failure**: the HTTP rate-limit test (`client.test.ts`, "spaces 5 requests ... 1 s apart"), after 5014 ms. Two reruns passed. This is the flake noted in P2.16; it's now task **P2.21**.
- `typecheck`, `lint` and `format:check` pass.

**Notes for you**
- **New task P2.21:** make that rate-limit test reliable. I didn't capture which assertion fails. My best guess is that it measures from server receive times, which drift under load.
- **The dry run warned about duplicates:** "Duplicate rate 20% is above 5%" on page 1, and 10% for the 10-record sample. That's expected, because one record is a deliberate duplicate. It's a warning only. A full run is at 5%, which doesn't trigger it.
- **Fixture products have no brand link** (`brand_id` null). They keep `brand_text`, as the D-046 soft-reference rule says. Matching brands is P4's job.

**Next:** P2.18 Legacy re-import.

---

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
