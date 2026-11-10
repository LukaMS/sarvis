# Sarvis rebuild: independent review

Started 2026-11-10, at commit `52559d2` (P4.2). Reviewer: Claude (Fable 5.2). Review and planning only: no application code, migration or database change was made.

## Review progress

A later session resumes at the first unticked line.

- [x] Phase 0: get oriented (summary below)
- [x] Phase 1: health check
- [x] Phase 2: audit of completed tasks
- [x] Phase 3: decisions re-examined
- [x] Phase 4: remaining plan reviewed
- [x] Phase 5: will the finished app succeed?
- [x] Phase 6: final report (top findings, plan changes, questions), committed
- [ ] Owner approval, then PLAN / PROGRESS / DECISIONS updated

**Evidence labels**
- **Verified:** I ran it or saw the output in this review, or the claim is about what a document says and I cite the place.
- **Suspected:** a claim about how code behaves, drawn from reading it. Nothing was run to prove it.
- **Estimate:** my own arithmetic or outside knowledge, which I could not check here.

**Contents:** top findings · Phase 0 orientation · Phase 1 health check · Phase 2 task audit · Phase 3 decisions · Phase 4 remaining plan · Phase 5 success check · all findings by severity · proposed plan changes · questions for the owner.

---

## Top findings

**The build is in good shape. The plan's product bets are not.** Every check passes, the code has no stubs or weakened tests, and the database is locked down properly. What threatens the app is what the data can and can't support, and how late the plan finds that out.

Ranked by effect on whether the finished app works for users:

1. **The alternatives feature has no source of store prices (C-1).** The catalog holds 521 prices for all of Canada and 64 for Ontario. Retailer sites are off limits by your decision, and receipts are meant to fill the gap. But the free tier holds about 100 users, and the sharing rule hides a receipt price unless two receipts hit the same store and product in the same week. On my estimate that hides about 98% of them. This needs your decision now, not in Phase 9.
2. **Nothing is tested with a real user or a real basket until about 100 sessions from now (C-2).** Every screen is a placeholder. Whether the catalog covers what you actually buy has never been measured. One session with your barcodes and receipts would measure it.
3. **Users would see wrong owners on big brands (H-1, H-2, H-3).** Wikidata matches are approved with no review. Among the 190 biggest matched brand strings, at least 11 are wrong: IGA is owned by an Australian company, Leclerc by a French supermarket chain. 71% of brands are named after their company ("Brand: Mondelez International" on a Cadbury bar). Some chains end at a person ("Prem Watsa"). The next brand task would attach roughly 750 to 1,000 products to the wrong matches.
4. **Most companies would show "Not yet rated" (H-4).** No score is approved, nothing says where the evidence for scores comes from, and one person must review every score. The useful fact: 69 parent companies cover 80% of products with a known owner, so a short, ordered list goes a long way.
5. **Fresh food has no place in the catalog (H-5).** Produce, meat, bakery and deli items have no barcode, so those receipt lines would match nothing.
6. **Several launch blockers have no task (H-7):** sign-up email can't reach real users, no production project is planned, the free database fills at about 110 users, and there are no backups.
7. **The data is going stale while operations wait for Phase 6 (H-8).** The OFF update window closes on 2026-11-13, and nothing keeps the Supabase project from pausing.
8. **Store banners don't exist in the database (H-6),** though matching, receipts and rollups all depend on them.

**What I'd do:** answer Question 1, run the coverage probe (P4.24) straight after P4.3, fix the ownership data before products are linked to it (P4.25 to P4.27), and build a small real slice of the app (Phase 4B) before the admin portal. That is 17 tasks. 7 of them are work the plan already had, done earlier, and 10 are new sessions.

---

## Phase 0: orientation

**Files used.** All the named files exist under these names: `CLAUDE.md`, `PLANNING_PROMPT.md`, `docs/PLAN.md` (1,873 lines), `docs/PROGRESS.md` (2,887 lines), `docs/DECISIONS.md` (D-001 to D-079), `.claude/commands/next.md` and `handoff.md`, `.mcp.json`, and the git history (111 commits, 2026-10-26 to 2026-11-05). Also read: `docs/catalog/{SOURCES,DATA_MODEL,BUDGET}.md` and `docs/legacy/{SPEC,CATALOG_REVIEW}.md`.

### What's done (87 tasks ticked, in 10 days)

| Phase | State | What exists |
|---|---|---|
| 0 Legacy audit | Done (12 tasks) | Spec, theme, schema dump, 3 sets of baseline screenshots, source research, data model, budget. |
| 1 Foundation | Done (17 of 18; P1.14 skipped by decision) | npm workspaces, Expo SDK 54 app, CI, email auth, password reset, account deletion, `/admin` gate, theme, 13 UI primitives. **Every user screen is a placeholder.** |
| 2 Catalog core | Done (24 tasks) | 39 catalog tables with RLS, pipeline framework (polite HTTP, raw store, run driver, idempotent writers, CLI), legacy re-import (all hidden). |
| 3 Sources | Done (31 tasks) | 7 sources imported to dev: OFF (90,672 products), Open Prices (521 prices), StatCan (25,420 reference prices), Wikidata (ownership), Wikipedia (summaries), SEC EDGAR, Corporations Canada. ODbL extract published. |
| 4 Matching | 3 of 24 done | Plan refined; GTIN UPC-E fix; writer fix. |

### What's left

- **Phase 4** (21 tasks): sizes, taxonomy, brands, brand → company links, product matcher, gold sets, price bounds.
- **Phases 5 to 10** are outlines only: admin portal, scheduling, AI scoring and articles, **all user screens (Phase 8)**, alternatives (Phase 9), release (Phase 10). At the Phase 2 to 4 rate (about 25 tasks a phase), that is roughly 120 to 150 more sessions.

### What the plan is betting on

1. **Open data is enough for the catalog.** Products come from Open Food Facts, ownership from Wikidata. No retailer site is scraped (D-013, owner decision).
2. **Users' receipts will supply store prices.** Open Prices gave 521 Canadian prices. Everything else must come from receipts scanned by users the app doesn't have yet (D-013 D7).
3. **Catalog first, app last.** No user-visible catalog data until Phase 8. Receipt scanning, the main price source, is also Phase 8.
4. **One owner can review every AI score** (D-006: nothing auto-published), and the legacy content too (D-050).
5. **Everything fits the free tiers,** with the DB forecast at about 420 MB of 500 MB.
6. **Rules, not AI, can do the matching** (brands, categories, receipt lines) to 95% precision.

Bets 2, 3 and 4 are the ones this review tests hardest.

---

## Phase 1: health check (2026-11-10, all Verified)

**Short version: the code that exists is healthy. Every check passed. The problems are in the data and the plan, not the build.**

### Build and tests

| Check | Result |
|---|---|
| Dependency tree (`npm ls --all`, `npm ci --dry-run`) | Consistent, exit 0. I did not wipe `node_modules`; P3.19 did a clean clone on 2026-11-04. |
| `npm run typecheck` | Pass (3 workspaces + e2e). |
| `npm run lint` (`--max-warnings 0`) | Pass. |
| `npm run format:check` | Pass. |
| `npm test` (Vitest) | **622 passed, 1 skipped**, 49 files, 39 s. The skip is the dev-DB pipeline e2e, which skips without the key in the environment (by design, D-030). |
| `npm run e2e` (Playwright, Chromium, 390 × 844) | **28 passed**, 2.5 min. Auth, reset, account deletion, admin gate, navigation, gallery. |
| Maestro | Not present in the repo. |
| Latest CI run | Green (`52559d2`, run 42055158484). |
| Code hygiene grep (`TODO`, `FIXME`, `.skip`, `.only`, `@ts-ignore`, `as any`, `eslint-disable`) | **0 hits** in `app`, `packages`, `pipeline`, `e2e`, `scripts`. Only the two documented `skipIf(no dev key)` guards. |
| `npm audit --omit=dev` | 18 advisories (5 high), all in Expo's build-time toolchain (e.g. `postcss` under `@expo/metro-config`). The offered fix downgrades Expo to 52. Nothing to do now; recheck in Phase 10. |

**Not run, and why:**
- `npm run e2e --workspace @sarvis/pipeline` and `check:writers`: both write rows to the dev project and delete them. The review brief says not to change the database, so I left them. Both passed on 2026-11-05 (PROGRESS, P4.2). Say the word and I'll run them.
- The Playwright suite does create and reset its `e2e-*` auth users in the dev project. That is unavoidable for the suite the brief asked for.
- **Android:** no emulator was running (`adb devices` listed none), and the `mobile`, `playwright` and `chrome-devtools` MCP servers failed to connect this session. Android was skipped. Web was driven with the repo's own Playwright instead.

### Production web build

`expo export -p web` succeeded (7.0 MB, entry bundle 2.5 MB, admin in its own lazy chunk). I served the static output and drove it signed out:

| Route | Result |
|---|---|
| `/`, `/settings`, `/admin` | Redirect to `/auth`. 0 console errors. |
| `/auth` | Matches `docs/baseline/web/01-auth-sign-in.png` apart from the name (Sarvis for Conscious Curator). Screenshot: `.screenshots/review-prod-root.png`. |
| `/dev/gallery` | **Blank page** in the production build (`.screenshots/review-prod-gallery.png`). The `!__DEV__` redirect targets `/`, which is guarded while signed out, so nothing renders. Finding L-1. |
| `/no-such-route` | Expo Router's stock black "Unmatched Route" page with a **Sitemap** link (`.screenshots/review-prod-nope.png`). `/_sitemap` is exported and lists every route, including `/admin` and `/dev/*`. Finding L-2. |

Signed-in flows on the production build were not driven (that needs a new dev user, a database write). The dev-server e2e covers them.

### Secrets in the client bundle

- The exported bundle holds **one key: the Supabase publishable key** (`sb_publishable_…`), which is public by design. No JWT, no `sb_secret_`, no service-role key, no email address.
- The single `sb_secret_` string in the bundle is supabase-js's own prefix check, not a key.
- **There is no OpenRouter key or OpenRouter code anywhere yet** (the module is Phase 7). No edge functions are deployed (`list_edge_functions` returned none).
- Git history (all 111 commits) has no JWT, `sk-or-` or `sb_secret_` pattern.
- The service-role key is read only by `pipeline/src/env.ts` and `scripts/dev-*.ts`. Nothing under `app/` references it.

### Dev database

| Check | Result |
|---|---|
| Migrations | **18 applied, 18 files**, versions match one to one. (PROGRESS says 17 at P3.19; `gtin_upce` was added since.) |
| RLS | Enabled on **all 40 `public` tables**. Every table has at least one policy. |
| Write policies | Every INSERT/UPDATE/DELETE policy requires `private.is_admin()`, except `profiles_update_own` (own row, 3 columns by grant). `anon` has no write grant on any table. |
| Views | All 8 are `security_invoker`. |
| Functions | Security-definer functions live in `private`, with a fixed `search_path`. `off_brand_strings()` is not callable by `anon` or `authenticated`. |
| Storage | `raw` is private (admin read). `public-exports` is public read, no client write. |
| Security advisor | 1 WARN: leaked-password protection is off (an Auth dashboard setting). Finding L-3. |
| Performance advisor | 43 INFO `unused_index`, expected while nothing queries the tables. No WARN or ERROR. |
| Size | 113 MB of 500 MB. |
| Query speed | `product_ownership_chain` by GTIN: 4 ms. Trigram name search over 90k products ("kraft dinner"): 95 ms, index used. Good. |

### What the database actually holds

These numbers drive most of the findings later in this report.

| Fact | Count |
|---|---:|
| Products (99.99% approved, visible) | 90,672 |
| … with a scannable GTIN | 83,657 (92%) |
| … with a parsed size | 19,319 (21%) |
| … linked to a brand | **11** |
| … with a category | **0** |
| Categories / banners / store listings / match candidates | **0 / 0 / 0 / 0** |
| Stores (none linked to a banner) | 100 (28 in Ontario) |
| Price observations, all of Canada, 2020 to 2026 | **521** |
| … in Ontario | **64**, across 25 stores (the best-covered store has 10) |
| … observed in the last 90 days, Canada | **24** |
| Companies / brands approved | 1,706 / 1,759 |
| Brands with a current owner | 1,471 |
| Company scores | 66, all legacy, **0 approved** |
| Rubrics | 0 |
| Open review-queue rows (no UI to work them yet) | 280 (271 legacy) |

---

## Phase 2: audit of completed tasks

**How this was checked.** I ran the health checks above, queried the dev database, and read the plan's acceptance criteria. Two read-only subagents read the app code (`app/`, `e2e/`) and the pipeline code (`pipeline/`, `packages/core/`) line by line; I re-read the code behind every claim of theirs that I repeat here. Per the brief, anything known only from reading code is marked **Suspected**, even where the code is unambiguous.

**Overall:** no stubs, no mocked data passed off as real, no skipped or weakened tests, no drift between migrations and the database. Placeholder screens are labelled as placeholders. The work is careful, and its PROGRESS entries are honest about limits. The "Needs fix" rows below are mostly things the acceptance criteria never asked for.

Verdicts: **OK**, **Needs fix** (a new task; the original work stands), **Revisit decision** (the task did what it said, but the decision behind it should be looked at again). No task needs a **Redo**.

| Task | Verdict | Reason and evidence |
|---|---|---|
| P0.1 to P0.5 Legacy schema, seed JSON, SPEC, THEME | OK | Files exist and are detailed. Spot-checked, not re-derived. |
| P0.6 to P0.8 Baselines | OK | 33 web, 34 Android, 22 admin files in `docs/baseline/`. The auth baseline matches the rebuilt screen (Verified). |
| P0.9 Legacy catalog review | OK | |
| P0.10 Sources | Revisit decision | The research is sound and says plainly "store prices are the gap". The owner decisions taken from it (D-013) leave the alternatives feature without data. Finding C-1. |
| P0.11 Data model and budget | Needs fix | Three gaps in the model: no place for items without a barcode (H-5), ownership walks up to private individuals (H-3), and the receipt-price sharing rule hides almost everything at small scale (C-1). |
| P0.12 Refine Phase 1 | OK | |
| P1.1 to P1.6 Tooling, Expo app, e2e, CI, base schema, theme | OK | All commands pass (Verified). `eslint-config-expo` is listed twice in `app/package.json` (L-7). |
| P1.7 Rating primitives, gallery | Needs fix (small) | `/dev/gallery` renders a blank page in a production build (Verified, L-1). Accessibility labels sit on non-accessible Views (Suspected, L-6). |
| P1.8 Interaction primitives | OK | `aria-selected` on button chips is invalid on web (Suspected, L-6). |
| P1.9 App shell | Needs fix (small) | No `+not-found` route, so the stock page and `/_sitemap` ship (Verified, L-2). Only 4 routes have an error boundary (Suspected, L-5). |
| P1.10 Email auth | Needs fix | A signed-in user who opens the app offline waits about 25 s, then lands on the sign-in screen (Suspected, M-2). Production sign-up can't work on Supabase's built-in email, and no task adds a mail provider (H-7). |
| P1.11 Account deletion | OK | e2e passes (Verified). |
| P1.12 Admin gate | OK | The server refuses non-admins, and admin code is a separate chunk (Verified). |
| P1.13 Phase 1 exit | OK | Android not re-checked in this review. |
| P1.15 Password reset | Needs fix | Any URL carrying tokens replaces the current session with no check (Suspected, M-1). Harmless today; a real risk once receipts exist. |
| P1.16, P1.17 | OK | |
| P2.1 to P2.3 Bookkeeping, sources seed, matching schema | OK | RLS, grants and advisors Verified. 15 use / 17 avoid / 3 manual-only source rows. |
| P2.4 Ownership schema | Needs fix | `company_ultimate_parent` ends at people and family holdings: Sobeys → "Sobey family", St-Hubert → "Prem Watsa" (Verified, H-3). `banners` has 0 rows and no task fills it (Verified, H-6). |
| P2.5 Products schema | OK | |
| P2.6 Stores and prices schema | Revisit decision | The schema works. The `n_receipts ≥ 2` rule per store, product and week is a placeholder that decides whether receipt prices are ever visible (C-1). |
| P2.7 to P2.9 AI, scoring, editorial schema | OK | The citation trigger and visibility rules are well built. |
| P2.10, P2.11 Core records and validation | OK | Category price bounds and the unit parser are hooks nothing calls yet. P4.6 and P4.22 wire them, as planned. |
| P2.12 Pipeline runtime | OK | |
| P2.13 HTTP client | Needs fix (small) | Only GET responses are cached (`pipeline/src/http/client.ts:390`), but Wikidata and StatCan use POST. CLAUDE.md says their re-runs "within 12 h are served from the HTTP cache". They aren't (Suspected, M-7). |
| P2.14 Raw store | OK | Raw is always stored before parsing. No command re-parses stored raw yet, and retention isn't running (Phase 6). |
| P2.15 Run driver | Needs fix | Nothing stops two runs of one source overlapping, and the stale-run sweep covers every source (Suspected, M-4). This matters when scheduling starts. |
| P2.16 Writers | Needs fix | The write path is tested only against the live dev DB, never in CI (Verified from `ci.yml`, M-3). A second source overwrites the first source's provenance on companies, brands and edges (Suspected, M-6). There's no retry on a transient DB error (Suspected, M-4). |
| P2.17 to P2.23 CLI, legacy import, exit check, fixes | OK | No legacy row is visible to users (Verified: 0 approved). |
| P3.1 to P3.4 Groundwork | OK | |
| P3.5, P3.6 OFF import | OK | 90,659 OFF products, provenance complete. |
| P3.7 OFF deltas | Needs fix | The last delta ran on 2026-10-30. The 14-day window closes on 2026-11-13, nothing warns about the gap, and no OFF run is safe until P4.3 (H-8). |
| P3.8 ODbL extract | OK | 2 exports in the public bucket (Verified). |
| P3.9, P3.10, P3.10a Open Prices | Revisit decision | Built correctly. Yield: 521 prices in Canada, 64 in Ontario (Verified). It can't carry the price side of the product (C-1). |
| P3.11, P3.11a StatCan | OK | 25,420 rows. The cache claim in CLAUDE.md is wrong (M-7). |
| P3.12 to P3.13 Wikidata | Needs fix | Auto-approved matches include wrong owners on high-volume brands: IGA → Metcash (Australia), Leclerc → E.Leclerc (France), Dairyland → a New Zealand company, Ziggy's → an Australian bar (Verified in the DB, H-1). 71% of approved brands are named after their company (H-2). A changed owner on Wikidata can stay hidden with no log or queue row (Suspected, M-5). |
| P3.13a to P3.13c Budget | OK | |
| P3.14 to P3.15b Wikipedia | OK | 1,123 summaries. |
| P3.16, P3.17 SEC EDGAR | Revisit decision | About 2,400 lines of code produced 9 new edges, 3 of them wrong by the task's own hand check, all pending. Don't invest further (M-11). |
| P3.18 Corporations Canada | OK | Low yield (20 of 160 companies), as the plan expected. |
| P3.19, P3.19a Exit check, budget | OK | |
| P4.0 Refine Phase 4 | Needs fix | Good detail, but several things Phase 9 depends on have no task. See the Phase 4 review. |
| P4.1 GTIN | OK | Leaves 608 stored rows failing the table's own check until P4.3 (Verified: 608). P4.3 must stay next. |
| P4.2 Writer fix | OK | |

---

## Phase 3: decisions re-examined

Most of the 79 decisions are implementation details that still hold. These are the ones worth a second look, ordered by how soon they get expensive to change.

| Decision | Still right? | Cost to change now | Cost later | Recommendation |
|---|---|---|---|---|
| **D-013 / D-002** No retailer sources; receipts are the main price source | Right on legal grounds. Wrong as the only plan for prices. | A decision and a few plan edits. | The alternatives feature (Phase 9) ships empty, after about 100 sessions of work that assumed it. | Decide now which path to take (Question 1). |
| **D-011** Alternatives default to the same store | Not achievable on the data. | None. | Phase 9 is designed around a rule that returns nothing. | Change the default to "same category, better rated, price shown where known". Keep same-store as a filter that appears when data exists. |
| **D-014 (receipt prices)** Shared only as weekly aggregates with ≥ 2 receipts per store and product | Too strict for the scale the free tier allows. | None: no table or data yet. | A migration, re-aggregation, and a privacy-policy change after users consented to the old wording. | Decide before Phase 8 builds receipts (Question 1). |
| **D-054 / D-066** Wikidata data is approved with no review | Right for the long tail. Wrong for the brands on the most products, where errors are visible and few rows need checking. | 1 to 2 sessions (P4.25, P4.26 below). | After P4.13, roughly 750 to 1,000 products link to wrong owners, and Phase 8 shows them to users. | Amend: brands on 20+ products are checked once, and a lone foreign candidate is held. |
| **D-028** Auth links use the implicit flow | Works. Lets a crafted link swap the session. | 1 session (PKCE). | The same code change, but with users' receipts at risk in the meantime. | Fix before any user data table exists. |
| **D-006** No AI score is published without owner review | Right, given the legal risk of rating real companies. But it caps how many companies ever get a rating. | None. | Phase 7 builds a queue the owner can't clear. | Keep it. Add a scoring order and a target (H-4), and score at the parent-company level. |
| **D-042** Pipeline refuses any project but dev | Right today. No task ever creates a production project. | A decision. | Launch stalls on it. The free plan allows 2 active projects, and legacy plus dev already use both (Suspected). | Decide: promote dev to production at launch, or retire legacy (Question 4). |
| **D-077 (categories)** Free rules only for the 58% of products with no OFF category | Risky. Two or more sessions of rule-writing, with 95% precision required, for unknown coverage. | A cost decision. | Phase 9 "similar product" has no category for half the catalog. | Timebox the rules to one session. Ask the owner now about a one-off AI classification (Question 6). |
| **D-070** Budget: whole DB forecast ≈ 420 MB at 100 active users | The arithmetic is careful. The consequence isn't stated plainly anywhere the owner decides things. | None. | A full database at about 110 users. | The owner confirms now whether a paid tier at launch is acceptable (Question 3). |
| **D-005** Admin portal inside the Expo app | Fine. | | | Keep. Trim what Phase 5 builds first (M-9). |
| **D-009** One AI module for Deno and Node | Fine, with the spike. | | | Pull the spike forward: receipts need it before scoring does. |
| **D-025** Session in plain AsyncStorage on Android | Acceptable for now. | | Small. | Revisit in Phase 10 (L-8). |
| **D-074, D-075** SEC EDGAR and Corporations Canada matching | Correctly cautious. Low yield. | | | No more work on either until the review UI exists. |
| **Implicit:** every screen requires sign-in | Copied from legacy. RLS already lets anonymous users read the approved catalog. | Small now (route guards). | Larger once screens assume a user. | Ask the owner (Question 5). Search and scan without an account shorten the time to first value. |
| **Implicit:** a score belongs to one company, and a product's grade comes from its owner | Not yet decided which company in the chain: the brand's owner or the top parent. | None. | Re-scoring. | Decide in P7.0. I recommend the top corporate parent, inherited down. |

Decisions I checked and would leave alone: D-003 (public repo, with the care taken over receipts and screenshots), D-008 (one product table), D-020 (private schema, grants then RLS), D-034 (one controlling parent, cycle trigger), D-038 (citation trigger), D-046 (read, diff, write), D-058 (deactivation guard), D-078 (UPC-E rule, backed by measurement).

One housekeeping note: DECISIONS.md says "newest at the bottom", but D-046 to D-079 run newest-first after D-045 (L-9).

---

## Phase 4: the remaining plan

### Phase 4 tasks, one by one

Phase 4 is well specified: every task has scope, files and a testable check, and each fits a session. The problems are a few wrong rules and several missing tasks. New task IDs (P4.24 onward) are defined under "Proposed plan changes".

| Task | Order and size | Verdict |
|---|---|---|
| P4.3 OFF re-import | Right place: it must be next (608 rows fail a check until it runs). | Keep. Add: finish with an OFF full run, because the delta window closes on 2026-11-13. |
| P4.4 Legacy takeover | Fine. 3 products. | Keep. |
| P4.5, P4.6 Size parser | Fine. | Keep. Expect little gain: only 20,463 products have any size text. |
| P4.7 Derived-job runner | Fine. | Keep. Add the run lock here (M-4), since jobs and sources will overlap. |
| P4.8 Taxonomy | Fine. | Rewrite: the taxonomy must also define the generic items (H-5). |
| P4.9 Categories from tags | Fine. | Keep. It is the first real consumer of stored raw data. |
| P4.10 Edge evidence | Fine. | Rewrite: also keep `source_id` on companies and brands (M-6), and log blocked owner changes (M-5). |
| P4.11 Brand keys | Fine. | Keep. |
| P4.12 Private-label seed 🟡 | Fine. | Keep. Followed by the new P4.25, which audits the matches Wikidata already made. |
| P4.13 Brand rows and links | **Rule is wrong** (H-2). | Rewrite: a string that matches a company-named brand only through an alias becomes its own brand. |
| P4.14 Candidates | Fine. | Keep. |
| P4.15 Brand gold set | **Misses the riskiest links.** It samples the new resolver's candidates, not the 1,471 owner links Wikidata already approved. | Rewrite: include string → brand → owner chains that are already approved, and report precision weighted by product count. |
| P4.16 Apply links | Fine. | Keep. |
| P4.17 Categories from names | Likely more than one session, uncertain yield. | Rewrite: timebox to one session, then report. The AI option becomes an owner question now, not after Phase 7. |
| P4.18 Product matcher | Fine, on the large side. | Keep. |
| P4.19 Catalog gold set | Fine. | Keep. |
| P4.20 Receipt gold set 🟡 | **Too late.** It measures how much of a real basket the catalog covers, which is the most important unknown in the project. | Reorder: ask the owner for the receipts now, and report coverage right after P4.3 (new P4.24). |
| P4.21 Calibrate matcher | Fine. | Keep. |
| P4.22 Price bounds | Fine, low urgency with 521 prices. | Keep, but it can run last. |
| P4.23 Exit check | Fine. | Rewrite: add the coverage numbers that decide Phase 9. |

**Missing from Phase 4:** a banner seed (H-6), generic items (H-5), the audit of approved Wikidata matches (H-1), the corporate-parent rule (H-3), and a coverage probe (C-2).

### Phases 5 to 10 (outlines)

Each outline is refined by its own `.0` task, so I only list what those tasks must not miss.

- **Phase 5 (admin):** nine milestones is a phase as large as Phase 3. One person needs the review queue first, because Phase 4 leaves up to about 800 open rows and nothing can clear them. Supabase Studio already browses and edits every table for free. See M-9.
- **Phase 6 (operations):** sound, but too late. Three of its tasks are needed now (H-8). It has no task for a production project (H-7) or for backups (H-7).
- **Phase 7 (AI scores, articles):** the outline has the mechanics (module, rubric, queue) but not the two things that decide whether scores exist: where the evidence comes from, and how one reviewer gets through the volume (H-4).
- **Phase 8 (user screens):** "one task per screen" hides the hardest design work, which is the receipt flow (M-12). Receipt scanning also needs the AI module from Phase 7.
- **Phase 9 (alternatives):** see C-1. It needs a go/no-go gate on data before any UI.
- **Phase 10 (release):** missing sign-up email, the production project, Play Store requirements, error reporting and the privacy work (H-7, M-13).

### The areas the app depends on

**Catalog and pipeline.** This is the strongest part of the build. Raw storage, provenance, idempotent writers, politeness and the ODbL obligations (attribution rows, separable tables, a published extract) are all real and tested. The open-data licences are handled properly. Two things weaken it: coverage of what Ontario shoppers buy is assumed and never measured (C-2), and prices barely exist (C-1). Freshness has no automation yet (H-8). Dedupe of OFF near-duplicates is explicitly out of Phase 4, which is acceptable until search shows it matters.

**Brand → parent company.** The model (brand → owner → parent, dated edges, one current owner) is right, and private labels get a cited seed (P4.12). The data has three problems that users would see: wrong matches on big brands (H-1), brands named after companies (H-2), and chains that end at a person (H-3).

**Receipt scanning.** Nothing is built. The matcher plan (P4.18 to P4.21) is good and honest ("if receipt lines can't reach 95%, every match needs user confirmation"). Not yet planned: items without barcodes (H-5), how a receipt gets its store, what a user does with an unmatched line, per-user limits on AI calls, and whether one user's confirmation teaches the matcher for everyone (M-12). Cost per scan should be small (one vision call on a cheap model), but nothing measures it yet.

**Scores and articles.** The schema enforces the right rules: no approved score without a citation, model and rubric version on every row, nothing visible until reviewed. What's missing is upstream (evidence) and downstream (review capacity, a published method, a way for a company to dispute a rating). See H-4.

**Alternatives.** The data model supports the feature: categories, unit prices, per-store current prices, published scores. The data doesn't. Today 0 products have a category, 21% have a size, 0.5% have any price and 0 companies have a published score. Phase 4 fixes categories and Phase 7 scores. Nothing fixes prices (C-1).

---

## Phase 5: will the finished app succeed?

If every remaining task were completed exactly as written, these would still stand between Sarvis and an app people use and trust. Each links to a finding.

1. **The headline feature would be empty.** "A more ethical product, at this store, for the same price or less" needs store prices the plan has no way to get (C-1).
2. **Most companies would say "Not yet rated".** One reviewer, no auto-publish, no scoring order (H-4).
3. **Users would spot wrong owners on familiar brands** in their first session, and an ethics app that gets ownership wrong loses trust fast (H-1, H-2, H-3).
4. **A third or more of a typical receipt would not match anything**, because fresh food has no barcode (H-5). The exact share is unknown until P4.20 measures it.
5. **Nobody could sign up.** There's no mail provider for confirmation emails, and every screen sits behind sign-in (H-7).
6. **The free tier runs out at about 110 active users** (H-7). That is success arriving as an outage.
7. **Problems would be invisible.** No crash or error reporting, no usage numbers, no backups (M-13, H-7).
8. **Privacy work is a single bullet in Phase 10.** Receipts show where and when someone shops and what they buy. PIPEDA expects consent in plain words, access to one's data, and deletion. Deletion exists (P1.11). Consent wording and data export don't (M-13).
9. **It takes too long to learn any of this.** The first real user session is about 100 work sessions away (C-2).

Things I considered and am not raising: offline support (a cache is in Phase 8, which is enough for this app), app-store review of AI content (ratings are reviewed by a person), and iOS (out of scope on Windows).

---

## All findings by severity

Effort is in work sessions. "Estimate" marks my own arithmetic or outside knowledge that I could not check here.

### Critical

**C-1. The alternatives feature has no source of store prices.**
- **Evidence (Verified):** 521 price observations in all of Canada, 64 in Ontario across 25 stores, 24 in the last 90 days. The best-covered Ontario store has 10 prices. 0 banners, 0 store listings. Every retailer source is avoided (D-013).
- **Evidence (Verified, docs):** receipts are "the main source of store prices" (D-013 D7), arrive in Phase 8, and are shared only as weekly points with at least 2 receipts for the same store and product (`price_points_weekly` RLS). BUDGET §8 sizes the free tier for about 100 active users.
- **Estimate:** 100 users scanning one 30-line receipt a week is 3,000 lines a week. Spread over 20 stores with a few thousand common products each, about 1 to 2% of lines would share a store, product and week with another receipt. The other 98% stay hidden. And an alternative needs the *other* product's price at that store, which is rarer still.
- **Why it matters:** the plan says alternatives are "the main thing users will come for". Phase 9 notes "expect thin same-store coverage" but schedules no decision and no measurement before building.
- **Fix:** an owner decision now (Question 1), then: change D-011's default, loosen the sharing rule (banner and month instead of store and week), and add a data gate before Phase 9 (P4.23 rewrite, P9.0 input).
- **Effort:** 1 session for the decision and plan edits. More only if the owner opens a new price source.

**C-2. The riskiest assumptions are tested last, and users get nothing until Phase 8.**
- **Evidence (Verified):** every user screen is a placeholder (`app/src/app/(tabs)/*.tsx`). Phases 5, 6 and 7 come before any screen reads the catalog. 87 tasks took 10 days; about 120 to 150 remain (Estimate, from the size of refined phases).
- **Untested assumptions:** that OFF's Canadian subset covers what an Ontario shopper buys; that receipt lines can be matched; that the ownership data reads correctly on a real product page. Each can be tested in one to five sessions with what already exists.
- **Fix:** three steps, cheapest first.
  1. A coverage probe right after P4.3 (new P4.24): the owner's barcodes and receipt lines against the catalog.
  2. A first user slice after Phase 4 (new Phase 4B, 5 tasks): search, product page with the ownership chain, barcode scan, company page. No AI, no new tables.
  3. Pull three operations tasks forward (H-8).
- **Effort:** 1 session for the probe, 5 for the slice. The slice is work Phase 8 needs anyway, so the net cost is small.

### High

**H-1. Approved Wikidata matches put wrong owners on high-volume brands.**
- **Evidence (Verified, dev DB query on the top brand strings joined to `brand_current_owner` and `company_ultimate_parent`):**

  | OFF brand string | Products | Matched to (approved) | Why it's wrong |
  |---|---:|---|---|
  | Leclerc | 222 | E.Leclerc | The French hypermarket chain, not Biscuits Leclerc of Quebec. |
  | IGA | 180 | IGA → Metcash Limited | Metcash runs IGA in Australia. In Canada it's Sobeys. |
  | Dairyland | 90 | A New Zealand company | The Canadian brand is Saputo's. |
  | Ziggy's | 54 | "Alhambra Bar" (Australia) | It's a Loblaw deli label. |
  | PVL, POM | 48, 42 | Two Czech companies | Canadian supplement and bread brands. |
  | Allmax | 39 | A Taiwanese company | Canadian sports nutrition brand. |
  | Ace Bakery | 34 | A company with country Japan | Canadian bakery. |
  | Que Pasa, Wonderful | 26, 23 | A British and an Israeli company | Canadian tortilla chips; the US pistachio company. |
  | Kellogg's | 260 | Kellanova → Mars | Right for snacks. Cereal in Canada went to WK Kellogg Co. One brand string, two owners. |

  The "why" column is my own knowledge (Estimate); the matches are in the database. These came from looking only at matches whose owner has a non-North-American country, so the true count is higher. They are at least 11 of the 190 matched strings on 20+ products.
- **Cause:** the `single` tier (D-065) accepts a lone candidate with no country check, and D-054 approves it with no review.
- **Why now:** P4.13 will attach every OFF product with these strings to these brands. The Phase 4 gold set (P4.15) doesn't sample them.
- **Fix:** P4.25 (audit the 190 matched top strings, owner approves corrections), P4.26 (hold a lone candidate whose country is set and isn't CA or US, when the string is on 20+ products), and the P4.15 rewrite.
- **Effort:** 2 sessions.

**H-2. Most brands carry a company's name.**
- **Evidence (Verified):** 1,247 of 1,759 approved brands share a Wikidata item with a company, so the brand is named "Kraft Foods Group", "The Hershey Company", "Quaker Oats Company". "Christie" and "Cadbury" both resolve to one brand called "Mondelez International".
- **Why it matters:** the product page will show "Brand: Mondelez International" on a box of Cadbury. P4.13 as written makes it permanent by adding "Cadbury" as an alias of that brand.
- **Fix:** rewrite P4.13: a string that reaches a company-named brand only through an alias becomes its own brand, with a derived `owner` edge to that company.
- **Effort:** inside P4.13 (about half a session more).

**H-3. Ownership chains end at people.**
- **Evidence (Verified):** `company_ultimate_parent` returns "Sobey family" for Sobeys and Safeway (1,300 product mentions), "Prem Watsa" for St-Hubert, "Hershey Trust Company" for Hershey's, "Karl Albrecht Jr." for Aldi. 55 approved `companies` rows have `kind = individual`.
- **Why it matters:** it reads oddly, it names private individuals in an app that rates ethics, and it's the wrong thing to attach a score to.
- **Fix:** P4.27: the walk stops at the last company, cooperative, nonprofit or government body. Individuals stay in the data but aren't shown as the parent.
- **Effort:** 1 session.

**H-4. Scores: no evidence plan, and more review than one person can do.**
- **Evidence (Verified):** 0 approved scores, 0 rubrics. D-006: nothing is published without the owner. The only evidence sources approved are GDELT, RSS, Wikipedia summaries and three manual-only directories (SOURCES §6). 280 queue rows are already open, with no UI. Phase 4 adds up to about 525.
- **Estimate:** 1,000 companies × 6 rows (5 categories and an overall), each with citations to check, is hundreds of hours.
- **Good news (Verified):** ownership is concentrated. Among products whose brand already has an owner, **10 parent companies cover 50% and 69 cover 80%**.
- **Fix:** inputs for P7.0 (listed under plan changes): score top parents first with a stated target, score at the parent level, research evidence sources per rubric category before writing prompts, review one company per screen, publish the method, and give companies a way to dispute a rating.
- **Effort:** no new sessions now. It changes what P7.0 produces.

**H-5. Nothing models items without a barcode.**
- **Evidence (Verified):** OFF is the only product source. Restricted and in-store codes are stored with no GTIN or dropped (D-078, D-060 drops loose-produce prices). No task mentions produce, PLU items or generic products.
- **Estimate:** fresh produce, meat, bakery and deli are a large share of grocery lines and spending. P4.20 will give the real figure.
- **Why it matters:** those receipt lines would show as failures, and spending totals by company would silently leave them out.
- **Fix:** P4.28: generic items ("Bananas", "Chicken breast") as products with no brand, tied to taxonomy leaves, so a receipt line can match at category level and be shown as "fresh item, no brand".
- **Effort:** 1 session, plus a paragraph in P4.8.

**H-6. Banners don't exist.**
- **Evidence (Verified):** `banners` has 0 rows. All 100 stores have `banner_id` null. P3.10 says "banner linking (P4)", and no Phase 4 task does it.
- **Why it matters:** the matcher's "listing exact" tier, the receipt gold set, the "same chain" fallback and the price rollups all key on a banner.
- **Fix:** P4.29: a cited seed of about 25 Ontario banners with their operators, and links for the existing stores.
- **Effort:** 1 session.

**H-7. Launch blockers that no task covers.**
- **Sign-up email (Verified in PLAN P1.10):** "Supabase's built-in email only reaches project team addresses and is heavily rate-limited." No task adds a mail provider.
- **Production project (Verified by search):** the word "production" appears once in PLAN, as a key to add "later". No task creates the project, applies migrations or loads the catalog. The free plan allows 2 active projects, and legacy and dev exist (Estimate).
- **Capacity (Verified, BUDGET §8):** the DB passes its warning line at about 110 to 125 active users.
- **Backups (Estimate):** the free plan has none. The catalog can be rebuilt from sources. Review decisions, manual edits and user data can't.
- **Play Store (Estimate):** beyond the $25 fee, new personal developer accounts must run a closed test with 12 testers for 14 days before production access, and apps with accounts need a web page for requesting deletion.
- **Fix:** owner answers (Questions 3 and 4), then inputs for P6.0 and P10.0.
- **Effort:** none now; about 4 to 6 sessions inside Phases 6 and 10.

**H-8. The data is already going stale, and operations are two phases away.**
- **Evidence (Verified):** last OFF full and delta runs: 2026-10-30. The delta window is 14 days. No OFF run is safe until P4.3. No keep-alive exists, and the project pauses after 7 idle days. Raw retention isn't running: Wikidata holds 3,813 raw files against a bound of 6,000.
- **Fix:** pull three small tasks forward to follow P4.3 (P6.1 to P6.3 below): scheduled keep-alive and OFF delta, the dev-DB checks in CI, raw retention.
- **Effort:** 3 sessions, moved rather than added. Needs the dev service key as an Actions secret (owner action).

### Medium

**M-1. A crafted link can replace the signed-in session (Suspected).** `app/src/lib/auth/redirect.ts:19-25` takes tokens from the query or fragment of any opening URL, and `AuthProvider.tsx:85` sets the session with no check. A victim who opens an attacker's link is signed in as the attacker, and anything they then save belongs to the attacker's account. Fix: PKCE code exchange, and refuse to swap a different signed-in user. 1 session (P1.18), before receipts exist.

**M-2. Offline cold start shows the sign-in screen (Suspected).** `AuthProvider.tsx:103-113` waits on `getSession()`. With an expired access token and no network, supabase-js retries for about 25 s and then returns no session. Fix: a start-up timeout and a "signed in, offline" state. Same task as M-1.

**M-3. The write path isn't tested in CI (Verified).** `ci.yml` runs `npm test` with no secrets, so `writers.devdb.ts` and the run-twice e2e are skipped. Source tests use a fake writer. A writer regression shows up only when someone runs the dev checks by hand. Fix: P6.2.

**M-4. No run lock, and no retry on database errors (Suspected).** `pipeline/src/runs/driver.ts:228-241` starts a run without checking for a live one, and the stale sweep is global. `pipeline/src/db/query.ts:51` turns any transient error into a fatal one. Fix: a partial unique index on running runs per source, a sweep scoped to the source, and `withRetry` around PostgREST calls. 1 session (P2.24), before scheduling.

**M-5. A changed owner on Wikidata can stay hidden forever (Suspected).** When a new owner is blocked by the one-owner index, `ownership.ts:297, 387` discards the result: no event, no queue row. D-067 says "the new edge waits as pending until an admin decides", but nothing tells the admin. Acquisitions are exactly what this app must get right. Fix: write a run event and one queue row. Folded into P4.10.

**M-6. A second source overwrites the first one's provenance (Suspected).** `source_id` isn't in the `keep` list for companies, brands or edges (`ownership.ts:61, 238, 329`), and the auto-approve guard checks the stored source only once (`review.ts:124`). P4.10 fixes edges. Extend it to companies and brands.

**M-7. POST responses aren't cached, and CLAUDE.md says they are (Suspected).** `client.ts:390` caches GET only. A failed Wikidata full run (340+ queries) restarts from the first query. Fix: cache POST 200s (the key already includes the body) and correct the two Commands rows. Part of P2.24.

**M-8. E2E runs only by hand, against shared users in the live dev project (Verified).** Two runs at once break each other, and a paused project fails the suite. Fix: run e2e in the P6.2 job, with a concurrency group.

**M-9. Phase 5 builds more admin than one owner needs first.** Milestones include a browser and editor for every entity, CSV import and triggering runs from the portal (which needs a GitHub token on the server). Supabase Studio covers browsing and editing today. With no retailer scrapes, it isn't clear what CSVs would be imported. Fix: P5.0 orders the review queue and the quality dashboard first; the owner says whether the rest is still wanted (Question 7).

**M-10. Categories for 58% of products rest on keyword rules (Verified numbers, D-077).** See the decisions table. Fix: the P4.17 rewrite and Question 6.

**M-11. SEC EDGAR is low value for its size.** 9 new edges, 3 wrong, all pending (D-074's own hand check). Matches are frozen at fetch time, so later catalog growth never re-links (Suspected, `sec-edgar/index.ts:321-326`). Fix: none. Don't extend it; revisit when the review UI exists.

**M-12. The receipt flow has open design questions that Phase 8's outline doesn't list.**
- How a receipt gets its store and banner (read from the header, picked by the user, or both).
- What the user can do with an unmatched line.
- A per-user daily limit on scans, enforced in the edge function from the user's own JWT. The legacy function accepted any holder of the public key (SPEC "Edge functions").
- Whether one user's confirmed match becomes a listing other users' receipts match against. If so, a wrong confirmation spreads.
- A barcode miss: the OFF API is approved as a lookup fallback (S2), and no task uses it.
- Cost per scan, logged and checked against the cap.
- Fix: inputs for P8.0.

**M-13. No error reporting, no usage numbers, and privacy is one bullet.** Fix: inputs for P10.0 and P8.0: a small `client_errors` table fed by the error boundary (no new service), receipt consent wording, a data export, a privacy policy that names OpenRouter as a processor of receipt images.

### Low

- **L-1 (Verified).** `/dev/gallery` and `/dev/error-boundary` ship in the production bundle, and the gallery renders blank when signed out. Exclude dev routes from production builds.
- **L-2 (Verified).** No `+not-found` route. Expo's stock page and `/_sitemap` are public.
- **L-3 (Verified).** Leaked-password protection is off in Supabase Auth. One dashboard switch.
- **L-4 (Verified).** `npm audit` reports 18 advisories in Expo's build tooling. Recheck at the next SDK upgrade.
- **L-5 (Suspected).** No root error boundary: a render error on auth, settings or profile is uncaught.
- **L-6 (Suspected).** Accessibility: rating components label a non-accessible View; chips use `aria-selected` on buttons.
- **L-7 (Verified).** `eslint-config-expo` is in both dependency lists of `app/package.json`.
- **L-8 (Suspected).** The Android session is stored unencrypted (D-025). Revisit with SecureStore in Phase 10.
- **L-9 (Verified).** DECISIONS.md order contradicts its own header.
- **L-10 (Suspected).** The price writer re-reads a store's whole history per batch (`prices.ts:113-120`, known in D-046). Fine at 521 rows.
- **L-11 (Suspected).** The HTTP cache never evicts. A sign-up with an existing email shows "Check your inbox". The recovery flag never expires.
- **L-12 (Verified).** BUDGET mixes decimal and binary megabytes (already noted in PROGRESS P3.19a).

---

## Proposed plan changes

Nothing here is applied yet. On approval (all or part), I edit `docs/PLAN.md`, add a PROGRESS entry and record the changed decisions (D-011, D-014, D-054 and any answers to the questions below).

**Summary**

| Change | Tasks |
|---|---|
| Add to Phase 4 | P4.24 to P4.29 (6 tasks) |
| Rewrite in Phase 4 | P4.3, P4.8, P4.10, P4.13, P4.15, P4.17, P4.20, P4.23 |
| Add elsewhere | P1.18, P1.19 (app fixes), P2.24 (pipeline hardening) |
| Pull forward from Phase 6 | P6.1, P6.2, P6.3 |
| New phase between 4 and 5 | Phase 4B "First user slice": P4B.1 to P4B.5 |
| Add inputs to refinement tasks | P5.0, P6.0, P7.0, P8.0, P9.0, P10.0 |
| Reopen or delete | None. No completed task needs a redo. |

**Net effect:** 17 tasks. 7 of them (P4B.1 to P4B.4 and P6.1 to P6.3) are work the plan already had, done earlier. 10 are new sessions.

**Proposed order** (`/next` takes the first open task in file order, so this is the order in the file):
P4.3 → P4.24 → P2.24 → P6.1 → P6.2 → P6.3 → P4.4 to P4.11 → P4.27 → P4.29 → P4.12 → P4.25 → P4.26 → P4.13 to P4.16 → P4.28 → P4.17 to P4.23 → P1.18 → P1.19 → P4B.1 to P4B.5 → Phase 5.

### New tasks

#### [ ] P4.24 🟡 Coverage probe: is what the owner buys in the catalog?
- **Slice:** gold-set.
- **Goal:** measure, on real purchases, how much of a basket the catalog covers. This replaces an assumption with a number before more is built on it.
- **Deps:** P4.3.
- **🟡 Owner input:** about 50 barcodes from products at home (typed digits or photos of the barcodes), and the roughly 100 receipt lines P4.20 already asks for. If the input isn't in yet, `/next` skips to the following task.
- **In:**
  - Each barcode goes through `normalizeGtin` and a lookup. Record: found or not, has a brand string, brand has an owner.
  - Each receipt line gets a hand label: barcoded product in the catalog, barcoded product missing, or an item with no barcode (produce, meat, bakery, deli).
  - The receipt lines are saved for P4.20 under its privacy rules (line text and banner only).
- **Out:** the matcher (P4.18). Lines are labelled by hand here.
- **Files:** `docs/catalog/gold/coverage_probe.md`, `docs/catalog/gold/receipt_lines.csv`.
- **Verification:**
  - PROGRESS reports the barcode hit rate, the share of receipt lines in each of the three groups, and 10 examples of misses.
  - If fewer than 60% of barcodes are found, a task is added for an on-scan lookup through the OFF API (S2, already approved as a fallback).

#### [ ] P4.25 🟡 Audit the approved matches on high-volume brands
- **Slice:** brand-resolver.
- **Goal:** the brand strings on the most products point at the right brand and owner before P4.13 links products to them.
- **Deps:** P4.11, P4.12.
- **In:**
  - List every OFF brand key on 20+ products that already matches an approved brand (190 strings, 19,231 product mentions on 2026-11-10), with its brand, owner, owner country and top parent.
  - Check each against a source (the company's site, Wikipedia, a filing). Start from the 11 flagged in `docs/REVIEW.md` H-1.
  - A string that covers two owners in Canada (Kellogg's) is split by rule or left with no owner, and the choice is recorded.
  - **🟡 The owner approves the correction list** (a table in PROGRESS). Corrections are written with the `manual` source. A wrong approved edge is closed or rejected, never deleted, and the brand's alias is removed so the string no longer matches.
- **Out:** brands on fewer than 20 products.
- **Files:** `docs/catalog/BRAND_AUDIT.md`, `pipeline/src/jobs/brand-seed.ts` (reused), tests.
- **Verification:**
  - Every one of the 190 rows has a verdict and a source URL.
  - As `anon`, each corrected string resolves to the right owner through `brand_current_owner`, or to none.
  - A second run changes nothing. A Wikidata re-run on a sample doesn't undo a correction.

#### [ ] P4.26 Wikidata: hold a lone foreign candidate
- **Slice:** source-wikidata.
- **Goal:** stop the class of error behind H-1 from being approved again.
- **Deps:** P4.25.
- **In:**
  - In the `single` tier, a candidate whose country is set and is neither CA nor US is written with `auto_hold` (pending, hidden) when its string is on 20+ products, and gets one `review_queue` row. Below 20 products the current rule stays.
  - Bump the `wikidata` `method_version`. Record the rule in D-066.
- **Out:** re-matching the whole catalog. The P4.25 corrections stand.
- **Files:** `pipeline/src/sources/wikidata/`, tests, `docs/DECISIONS.md`.
- **Verification:**
  - Unit tests with the real cases: Leclerc, Dairyland and Ziggy's are held; Nestlé (CH) is held and queued; a CA or US lone candidate is approved as before.
  - A `--dry-run --sample` reports how many picks the rule holds.

#### [ ] P4.27 Ownership chains stop at a company
- **Slice:** schema.
- **Goal:** the parent shown to users, and scored later, is an organisation, not a person.
- **Deps:** P3.19a.
- **In:**
  - `company_ultimate_parent` walks up only through parents whose `kind` is not `individual`. A company whose only parent is a person is its own top parent.
  - `product_ownership_chain` follows. The edges to individuals stay in `company_ownership`.
  - Check family holdings that Wikidata types as a company (the "Sobey family" row): list every top parent with 100+ product mentions and fix `kind` by hand where it's wrong.
- **Out:** hiding individuals from the admin portal.
- **Files:** a new migration, `supabase/tests/ownership.sql`, `packages/core/src/db/database.types.ts`, `docs/catalog/DATA_MODEL.md`.
- **Verification:**
  - SQL check: Sobeys → Empire Company, St-Hubert → its corporate parent, Hershey's → The Hershey Company.
  - No row of `company_ultimate_parent` names an `individual` as the top parent.
  - Advisors clean. Types regenerated.

#### [ ] P4.28 Generic items for products with no barcode
- **Slice:** taxonomy.
- **Goal:** a receipt line for bananas or chicken breast matches something, and counts in spending.
- **Deps:** P4.8, P4.24.
- **In:**
  - `products.is_generic` boolean. A generic item has no GTIN and no brand, an `external_id` under the `sarvis-derived` source, and a leaf category.
  - A seed of about 150 to 300 items, built from the taxonomy leaves for produce, meat, seafood, bakery, deli and bulk, the StatCan product list, and the no-barcode lines found in P4.24.
  - Each has English and French names and common receipt spellings as aliases for the matcher.
  - Generic items never show an owner or a grade. The app labels them "fresh item, no brand".
- **Out:** PLU code lists (check the IFPS terms first; a separate task if wanted). Prices.
- **Files:** a new migration, `docs/catalog/GENERIC_ITEMS.md`, a seed job, tests.
- **Verification:**
  - Count by top-level category, and 10 examples.
  - The share of P4.24's no-barcode lines that now have a generic item.
  - As `anon`, a generic item reads with no brand and no owner. A second run changes nothing.

#### [ ] P4.29 🟡 Banner seed and store links
- **Slice:** brand-resolver.
- **Goal:** every Ontario grocery banner exists with its operator, and stores point at one.
- **Deps:** P4.7.
- **In:**
  - A cited list of about 25 banners: Loblaws, No Frills, Real Canadian Superstore, Fortinos, Zehrs, Valu-mart, Your Independent Grocer, Shoppers Drug Mart, T&T, Metro, Food Basics, Sobeys, FreshCo, Foodland, Farm Boy, Longo's, Walmart, Costco, Giant Tiger, Whole Foods, and the rest found in `stores`.
  - Each row: slug, name, operator company, receipt header spellings, a citation. **🟡 The owner approves the list.**
  - Link the 100 existing stores by name. Unlinked stores are listed.
- **Out:** store locations beyond what Open Prices gave.
- **Files:** `docs/catalog/BANNERS.md`, a seed job, tests.
- **Verification:**
  - Every banner has an approved operator. Stores linked and not linked are counted.
  - A second run changes nothing.

#### [ ] P2.24 Pipeline hardening before anything is scheduled
- **Slice:** pipeline-runs.
- **Goal:** scheduled and manual runs can't collide, and a network blip doesn't kill a long run.
- **Deps:** P4.3.
- **In:**
  - A partial unique index on `ingestion_runs (source_id, job) where status = 'running'`. A second start is refused with a clear message. The stale sweep covers only the source being started.
  - `withRetry` around PostgREST reads and writes for network errors and 5xx.
  - The HTTP cache stores POST 200 responses (the key already includes the body), so Wikidata and StatCan re-runs match what `CLAUDE.md` says.
  - If this runs long, split the cache change into its own task.
- **Out:** resuming a failed run from the middle.
- **Files:** a new migration, `pipeline/src/runs/`, `pipeline/src/db/query.ts`, `pipeline/src/http/client.ts`, tests, `CLAUDE.md`.
- **Verification:**
  - Unit tests: a second run of one source is refused; a 503 from the database is retried and succeeds; a repeated POST is served from the cache.
  - `check:writers` and the pipeline e2e pass.

#### [ ] P6.1 🟡 Scheduled keep-alive and OFF refresh
- **Slice:** ops.
- **Goal:** the dev project never pauses, and OFF stays fresh without anyone remembering.
- **Deps:** P4.3, P2.24.
- **🟡 Owner action:** add three Actions secrets (the dev URL, the dev service-role key, the contact email).
- **In:**
  - A workflow on a daily cron and `workflow_dispatch`: `pipeline run off --mode delta`. If the last completed delta is more than 13 days old, it runs `--mode full` instead.
  - It never runs on `pull_request`, so forks can't reach the secrets. A concurrency group shared with P6.2.
  - `actions/cache` for `.cache/`. On failure, the workflow opens a GitHub issue.
- **Out:** other sources, the budget monitor (P6.0).
- **Files:** `.github/workflows/pipeline-off.yml`, `pipeline/src/sources/off/`, `CLAUDE.md`.
- **Verification:**
  - A manual dispatch completes, and its run row shows the Actions URL.
  - A forced failure opens an issue. The public log shows no key, email or row data.

#### [ ] P6.2 CI runs the dev-database checks
- **Slice:** ci.
- **Goal:** a broken writer or auth flow fails a build instead of waiting for a manual check.
- **Deps:** P6.1.
- **In:** a job on pushes to `main` only: `check:gtin`, `check:writers`, the pipeline e2e, and the Playwright e2e (Chromium installed in the job). Same concurrency group as P6.1.
- **Out:** running these on pull requests.
- **Files:** `.github/workflows/ci.yml` or a new workflow.
- **Verification:** a green run with all four. A deliberately broken writer on a branch merged to a test ref turns it red; revert.

#### [ ] P6.3 Raw-retention cleanup
- **Slice:** ops.
- **Goal:** Storage stops growing without bound.
- **Deps:** P6.1.
- **In:** the cleanup job as the Phase 6 outline describes it (`retentionFor()`, `deleteRawFile()`, the per-subject rule), run weekly from the P6.1 workflow.
- **Out:** row-retention purges and budget monitoring (P6.0).
- **Files:** `pipeline/src/raw/`, `pipeline/src/cli.ts`, the workflow, tests.
- **Verification:** a dry run lists what would go. After a real run, Wikidata keeps its last 3 runs, and P4.9's OFF extract is still readable.

#### [ ] P1.18 Auth hardening before user data exists
- **Slice:** auth.
- **Goal:** a link can't swap the signed-in account, and an offline start doesn't sign the user out.
- **Deps:** P1.15.
- **In:**
  - Move email links to the PKCE flow (`exchangeCodeForSession`). Tokens in a URL are no longer accepted.
  - A link for a different user while someone is signed in asks first, or is refused.
  - Start-up: after a short timeout with no network, keep the stored session and show an offline state with retry.
  - Update D-028.
- **Out:** encrypted session storage (Phase 10).
- **Files:** `app/src/lib/auth/**`, `app/src/lib/supabase.ts`, `e2e/auth.spec.ts`, `docs/DECISIONS.md`.
- **Verification:**
  - e2e: the reset and confirm flows still pass; a URL with another user's tokens doesn't change the session.
  - A unit or e2e test with the network blocked shows the offline state, not `/auth`.

#### [ ] P1.19 Small app fixes from the review
- **Slice:** navigation.
- **Goal:** clear the low-severity items in one pass.
- **Deps:** P1.13.
- **In:** a `+not-found` screen in the app's look; no public sitemap; dev routes left out of production builds; a root error boundary; `accessible` and `role` on the rating components; `aria-pressed` on chips; the duplicate `eslint-config-expo` entry removed.
- **Owner action:** turn on leaked-password protection in the Supabase Auth settings.
- **Files:** `app/src/app/**`, `app/src/components/ui/**`, `app/package.json`, `e2e/`.
- **Verification:** a production export served locally: `/no-such-route` shows the new screen, `/_sitemap` and `/dev/gallery` are not found. e2e passes.

### New phase

#### Phase 4B — First user slice (between Phase 4 and Phase 5)

**Exit:** a signed-in user on web and Android can search the real catalog, scan a barcode, and see a product's brand, owner and parent company, with sources. The owner has used it on 30 real products.

**Why here:** it puts the catalog in front of a person about 100 sessions sooner, with no AI cost and no new tables. These four screens are in Phase 8 already; this moves them.

- [ ] **P4B.1 Search.** A `search_products` RPC (security invoker, trigram index, limit and offset) and the Search screen to baseline `07` to `09`. Deps: P4.16, P4.27. Verification: e2e searches a known product; `explain analyze` under 200 ms; screenshots on web and Android against the baseline.
- [ ] **P4B.2 Product page.** Baseline `13`: name, size, labels, image with the OFF attribution, brand → owner → parent, "Not yet rated" where there's no published score, a link to the source. Deps: P4B.1. Verification: e2e opens a product with a full chain and one with no owner; screenshots.
- [ ] **P4B.3 Barcode scan.** Camera on Android (`expo-camera`, a new dependency recorded in DECISIONS), typed entry on web, lookup through `normalizeGtin`, and a clear "not in the catalog yet" state. Deps: P4B.2. Verification: a UPC-A and its UPC-E reach the same product on the emulator; e2e for typed entry.
- [ ] **P4B.4 Company page.** Baseline `16`: the Wikipedia summary with its CC BY-SA link, the brands it owns, its parent chain, "Not yet rated". Deps: P4B.2. Verification: e2e and screenshots.
- [ ] **P4B.5 🟡 Owner walkthrough.** The owner looks up 30 products they know. Every wrong, missing or odd result is logged and becomes a task or a correction. Deps: P4B.1 to P4B.4. Verification: the list is in PROGRESS with a verdict per item.

Phase 8 keeps home, history, receipts, stories, profile and settings, and polishes these four.

### Rewrites to existing tasks

- **P4.3:** add a last step: one OFF `--mode full` run once the rewrite is verified, because the delta window closes on 2026-11-13.
- **P4.8:** the taxonomy also marks which leaves hold items with no barcode (input to P4.28).
- **P4.10:** also add `source_id` to the kept columns for companies and brands, so a second source can't take over their provenance. When an owner pick is blocked by the one-owner index, write a run event and one `review_queue` row. Verification adds: a blocked owner change appears in the queue.
- **P4.13:** change "add new spellings as aliases". A key that matches a brand only through an alias, where that brand shares its Wikidata item with a company, becomes a new brand named from the commonest OFF spelling, with a derived `owner` edge to that company. Verification adds: Cadbury and Christie are two brands, both owned by Mondelez.
- **P4.15:** the gold set also samples chains that are already approved (OFF string → brand → owner), at least 40 of the 100 rows, drawn in proportion to product count. Report precision per string and weighted by products.
- **P4.17:** timebox to one session. Apply the rules that reach 95%, report coverage, and stop. The AI option is decided by Question 6, not after Phase 7.
- **P4.20:** the owner input moves to P4.24. This task keeps the labelling against the matcher.
- **P4.23:** add to the exit report: the P4.24 coverage numbers; the share of products with a leaf category and an owner (the pool alternatives can draw from); the share that also have a size; the count of products with any price. State plainly whether Phase 9's same-store rule is reachable.

### Inputs for the refinement tasks

These are bullets to add to each outline, so the `.0` task can't miss them.

- **P5.0:** build the review queue and the quality dashboard first. Review one company or brand per screen, not one row. Everything else waits on Question 7.
- **P6.0:** a production project (Question 4) and a pipeline target flag that can't be set by accident; a weekly export of the tables that can't be rebuilt (review decisions, manual rows, audit log) to private Storage; a decision on backing up user data.
- **P7.0:**
  - Move the AI-module spike to the start of Phase 8's receipt work if receipts come first.
  - Research evidence sources per rubric category before writing prompts, including Canadian public registers (for example the federal supply-chain reports and the lobbying registry), with terms checked as in SOURCES.md.
  - Score in order of products covered, with a target: the top 70 parent companies first (80% of owned products today).
  - Decide which company in a chain a score attaches to.
  - A published method page, the date and sources on every rating, and a contact route for a company to dispute one.
  - Article links: decide whether a link from an allow-listed publisher may appear without review if it carries no good or bad tag.
- **P8.0:** the receipt design questions in M-12; consent wording for receipt prices; a mail provider for sign-up email (a free tier, the owner picks); guest access (Question 5); `client_errors` logging; a data export.
- **P9.0:** start with a gate: the P4.23 numbers, refreshed. Build the UI only for the definition the data supports (Question 1).
- **P10.0:** Play Store requirements (the fee, the closed-test rule for new personal accounts, a web page for deletion requests); the privacy policy, naming OpenRouter as a processor of receipt images; encrypted session storage on Android; the paid-tier decision (Question 3).

---

## Questions for the owner

Only the ones whose answer changes the plan. My recommendation is first in each.

1. **Prices and alternatives (C-1).** With no retailer data, "same store, same price or less" can't be met. Which way?
   - **(a) Recommended:** alternatives mean "same kind of product, better-rated company", with a price shown when one is known and its date. Same-store becomes a filter that appears once a store has data. Receipt prices are shared per banner and month, not per store and week.
   - (b) (a), and I also research one permitted price source for you to decide on (for example asking a retailer or a flyer service for permission).
   - (c) Keep the plan as written and accept that the feature starts empty.
2. **Order (C-2).** May I build the first user slice (Phase 4B) before the admin portal, and pull the three operations tasks forward?
3. **Capacity (H-7).** The free database holds about 110 active users. When you get there, is about US$25 a month acceptable, or should the app cap sign-ups or keep less history?
4. **Production project (H-7).** Promote the dev project to production at launch (recommended: the catalog is already there), or free a slot by retiring the legacy project?
5. **Sign-in wall.** May search, scan and product pages work without an account (recommended), with sign-in only for history and receipts?
6. **Categories (M-10).** 53,000 products have no category. A one-off AI classification on a cheap model would cost a few US dollars by my estimate, under a hard cap. Approve that, or rules only?
7. **Admin scope (M-9).** Do you still want CSV bulk import and "start a run from the portal"? I'd defer both.
8. **Your inputs.** P4.24 needs about 50 barcodes and 100 receipt lines from you. P6.1 needs three GitHub Actions secrets added. P4.25 and P4.29 each need you to approve a short list. This amends D-054 ("no review for Wikidata") for the biggest brands only.

One offer: I skipped the two test suites that write to the dev database and clean up after themselves (`check:writers`, the pipeline e2e). Say so if you want them run.
