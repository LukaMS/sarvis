# Progress log

Newest entry first.

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
