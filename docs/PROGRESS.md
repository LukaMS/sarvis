# Progress log

Newest entry first.

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
