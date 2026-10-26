# Planning prompt for Claude Code

Paste everything below the line into Claude Code, started in the new `sarvis` folder. Or just type: "Read PLANNING_PROMPT.md and follow it."

---

We're rebuilding my app from the ground up. Read `CLAUDE.md` first; it has the product description, rules and environment. The legacy app (folder name "ethical-app") is at the path in `.claude/settings.json`. It's read-only reference. The legacy Supabase project is available read-only through the `supabase-legacy` MCP, and an empty dev project through `supabase-dev`.

**Your job in this session is to produce the plan, not to build anything.**

## What I want from the rebuild

1. **Keep what works.** The current app functions and I like its colour theme. Same core features, same look, but built cleanly with a real structure. It was slapped together without a plan.
2. **The catalog is the priority.** Accurate data on companies, brands, parent-company ownership, products, and store prices, at scale. The old scraper and bulk-add tools are the weakest part. Plan this as a proper data pipeline:
   - **Sources.** Research and compare free or open options before writing scrapers. Open Food Facts for products and barcodes, Wikidata for brand-to-parent-company ownership, and retailer sites for store catalogs and prices (I'm in Ontario: Loblaw banners/PC Express, Sobeys/Voilà, Metro, Walmart, No Frills, etc.). For each, record licence, terms on automated access, coverage and freshness in `docs/catalog/SOURCES.md`. Flag anything legally questionable for me to decide.
   - **Ingestion.** Raw responses stored, parsers re-runnable, idempotent upserts, provenance on every row.
   - **Matching.** Resolve the same product across sources (GTIN first, then fuzzy name/brand/size matching with a confidence score). Resolve brands to companies.
   - **Normalization.** Units, sizes, unit price, categories.
   - **AI enrichment.** OpenRouter scoring of companies against a written rubric with cited sources, plus article/news collection. Everything goes into a review queue in the admin portal.
   - **Quality.** Validation checks and a coverage/quality dashboard in the admin portal (rows per source, match rate, stale prices, unscored companies).
   - **Scheduling.** Recurring runs on free infrastructure only.
   - Each scraper is built and tested against a small sample before it's scaled up.
3. **Alternatives.** Recommend products that are more ethical and similar or lower in price. Default to alternatives at the same store the user shopped at, so the swap is realistic. Ask me if you think another approach is better.
4. **User app** (Expo, mobile and web): receipt scanning, manual search and add, ethical ratings, saved history and spending tracking, company articles, alternatives.
5. **Admin portal:** database browsing and editing, bulk import, scraper runs and their results, the AI scoring review queue, data quality dashboard. Decide whether it lives in the same Expo app (web-only routes behind an admin role) or separately, and record why in `DECISIONS.md`.

## How to plan

1. **Look before planning.** Skim the legacy app enough to understand it: folder structure, `package.json`, routes and screens, Supabase schema (via `supabase-legacy`), edge functions, OpenRouter calls, the scraper, and the admin portal. Don't read every file; that's a Phase 0 task.
2. **Ask questions.** Ask me up to 5 questions whose answers would change the plan. Wait for my answers before writing files.
3. **Write the files:**
   - `docs/PLAN.md`
   - `docs/PROGRESS.md` (with one entry for this planning session)
   - `docs/DECISIONS.md` (with any decisions made so far)
   - A `.gitignore` covering `.env`, `.screenshots/` and `node_modules`
   - Then `git init` and commit.

## Plan format (important)

I don't have enough usage to do this in one go. The plan has to be worked through one task per session, with `/next` picking up where the last session stopped.

- **Phases**, in dependency order. Phase 0 is the legacy audit:
  - write `docs/legacy/SPEC.md` (every screen, flow, table, RLS policy, edge function, and OpenRouter prompt with its expected response shape)
  - write `docs/legacy/THEME.md` (colours, fonts, spacing, component styles)
  - dump the legacy schema
  - capture baseline screenshots of every legacy screen on web and Android into `docs/baseline/`
  - write a frank review of the legacy catalog and scraper code: what to keep, what to drop
- **Phase 0 detail.** Only Phase 0 needs full task detail now. Later phases can be outlined at milestone level. The last Phase 0 task is "Refine the next phases into session-sized tasks" using what the audit found. Each later phase starts with a refinement task like that too.
- **Order.** After the foundation (scaffold, schema, auth, theme), catalog pipeline work comes before polishing user-facing screens. The app still needs to stay runnable at the end of every phase.
- **Each task gets:**
  - an ID (for example `P2.3`)
  - a checkbox
  - a one-line goal
  - dependencies
  - scope: what's in and what's explicitly out
  - the files or areas it touches
  - **verification:** the exact commands, screenshots, tests or sample runs that prove it's done
- **Size.** Each task should fit in one focused session, roughly a few files or one feature slice. If unsure, split it.
- **Mark the tasks where you need a decision from me** before starting.
- **Free tier only.** Note anything that risks the Supabase free limits (500 MB database, 1 GB storage), such as storing raw scraper data. Propose how to stay under them.

Keep your chat replies short; the detail belongs in the files.
