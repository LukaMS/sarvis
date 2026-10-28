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

## D-021 Theme module — Accepted (P1.6)
- **Location:** `app/src/theme/` (colours, grades, ratings, radius, spacing, typography, elevation), imported through `app/src/theme/index.ts`. Pure TS with no React Native runtime imports (typography uses only `import type`), so Vitest tests it in Node.
- **Only tokens legacy renders:** the 27 M3 roles with uses > 0. The 14 unused roles (e.g. `onPrimaryContainer`, `surfaceDim`, `inversePrimary`) and the Expo template's `Colors`, `Fonts`, `Spacing`, `BottomTabInset` and `MaxContentWidth` are left out, and a test asserts the template names stay out. Add a role back only when a rebuilt screen needs it.
- **AppColors:** the 3 aliases legacy uses (`scoreRingTrack`, `textMuted`, `storyOverlay`), plus named tokens for the colours legacy hard-coded: `tabInactive` (the rgba the tab bar actually renders, not legacy's `outline` alias), `scanBackdrop`, `coverGradientTop`, `statusBarScrimTail` and `scannerLaser`.
- **Typed grades and ratings:** `Grade` and `Rating` union types. `gradeToColor` and `ratingToColor` accept `null`/unknown and fall back to `outline`, as legacy does. `scoreToGrade` is table-driven from `GRADE_THRESHOLDS` and keeps legacy's thresholds. When the pipeline needs it (Phase 7 scoring), move `scoreToGrade` and the grade types to `packages/core` and re-export them from the theme.
- **Typography:** named roles (`heroTitle` … `chipLabel`) with the size, weight, tracking, line height and case from THEME.md's type-scale table, each at the low end of any range the table gives. System fonts (D-015).
- **Spacing:** the literal values legacy repeats (gutter 24, list gap 8, …) as named tokens, not a numeric scale, because legacy has no scale.
- **Tests:** `app/` is now a Vitest project (`app/vitest.config.mts`; `.mts` because `app/package.json` isn't ESM). `theme.test.ts` parses THEME.md's tables and text, so if THEME.md and the theme drift apart, the test fails.

## D-022 Rating primitives and the dev gallery — Accepted (P1.7)
- **New dependency `react-native-svg` 15.12.1** (installed with `npx expo install`, so it's the SDK 54 version Expo Go ships). ScoreRing needs an SVG arc, and legacy used the same library and version. No other ring technique (border tricks, canvas) matches the legacy look on web and Android.
- **Components** live in `app/src/components/ui/`, one file per component, named exports, imported by relative path (the app has no `@/` alias). Each takes an optional `testID`. SectionHeader gives its action `${testID}-action`.
- **Legacy look kept as is, including one quirk:** ScoreRing rotates the SVG -90° *and* applies a quarter dash offset, so the arc starts at 9 o'clock, not 12. The legacy baselines (`13-product.png`, web and Android) show exactly that, so the rebuild matches it. Changing it to 12 o'clock would be a design change and needs the owner's OK.
- **Small clean-ups that don't change the look:** ScoreRing rounds the score to an integer for the label and arc (legacy would print decimals), and draws no arc at 0 (legacy drew a round-cap dot). Badge and pill tints use `withAlpha(color, TintAlpha.badge)` instead of string concatenation.
- **`/dev/gallery`** (`app/src/app/dev/gallery.tsx`) renders every variant: 13 grades plus unrated at sm/md/lg, the 3 ratings plus unrated, rings at the 5 legacy sizes (100/7, 80/6, 64/5, 48/4, 40/3) for scores 97, 78, 55, 25, 5, 0 and unscored, and SectionHeader with and without an action. If `__DEV__` is false it renders `<Redirect href="/" />` (the hooks live in a child component, so the early return doesn't break hook order).
- **E2E pattern:** `e2e/gallery.spec.ts` checks visibility with `toBeVisible()` alone. `scrollIntoViewIfNeeded()` failed on a cold Metro start ("Element is not attached to the DOM"), because the statically rendered page is replaced once it hydrates. `toBeVisible()` retries and doesn't need the element in the viewport.

## D-023 Interaction and state primitives — Accepted (P1.8)
- **New dependency `@expo/vector-icons` ^15.0.3** (installed with `npx expo install`). Legacy draws every icon with MaterialCommunityIcons. `expo` already pulls the package in, but the app imports it directly, so it's now an explicit dependency.
- **No Reanimated or expo-linear-gradient yet.** PressableScale uses React Native's built-in `Animated.spring` with legacy's spring (damping 20, stiffness 300, scale 0.97) and `useNativeDriver`. StatusBarScrim draws its 12 px fade with `react-native-svg` (D-022). Each one-component use doesn't justify a dependency. Reanimated comes in with the `FadeInDown` entrances in Phase 8.
- **PressableScale animates the Pressable itself** (`Animated.createAnimatedComponent(Pressable)`), as legacy does, so margins in `style` don't widen the touch area.
- **Button** (`Button.tsx`) covers every legacy button: `variant` primary / secondary / text, `shape` pill (radius full, 20 × 12, 14 / 700, as on Search's Request button) or block (48 high, radius 12, auth screen). It also has `icon`, `disabled`, `loading` (spinner, presses blocked) and `destructive` (text in `error`). ErrorState's retry pill (18 × 10) and RouteErrorBoundary's larger pill (28 × 13, 15 / 700) keep their legacy padding through `style`. `testID` is required.
- **FilterChips** is one generic, typed component (`options`, `selected`, `onSelect`, `labelFor`) that replaces legacy's two identical `HistoryFilterBar` and `SearchFilterChips`. Each chip's testID is `${testID}-${option}`. The container has the gutter but no bottom margin; screens set their own spacing (legacy used 8 on History and 16 on Search).
- **Card** is white, radius 16, padding 16, with no margin and no shadow. With `onPress` it becomes a PressableScale.
- **`aria-*` instead of `accessibilityState`** for selected, disabled and busy. React Native Web 0.21 ignores `accessibilityState`, and RN 0.81 maps `aria-*` on native, where Android reports `selected`, `disabled` and "busy".
- **`FriendlyError`** (kind, title, message, retryable) is defined and exported in `ErrorState.tsx`, matching legacy `src/lib/errors.ts`. The mapping from raw errors (`toUserMessage`) belongs to the data layer. When that's built, move the type there and re-export it.
- **RouteErrorBoundary:** a route opts in with `export { RouteErrorBoundary as ErrorBoundary }`. `/dev/error-boundary` throws while rendering so the boundary can be tested, and redirects home when `!__DEV__`. In development, native also shows LogBox's "Render Error" overlay on top. Once dismissed, the boundary is underneath. Release builds don't show LogBox.
- **E2E on RN Web** (`e2e/helpers.ts`):
  - `tap(locator)` scrolls the element into view, waits two animation frames, then clicks. A plain `click()` on an element inside a ScrollView scrolls and presses in one step, and the late scroll event cancels the RN Web press, so nothing happens.
  - Tests that press things open the page with `waitUntil: 'networkidle'`, so presses aren't lost on the static HTML before it hydrates.
  - RN Web writes `aria-selected` only when it's true, so assert `not.toHaveAttribute('aria-selected', 'true')` for unselected chips.

## D-024 App shell and navigation chrome — Accepted (P1.9)
- **The tab bar is the stock bottom-tabs bar styled through `screenOptions`, as in legacy.** The plan named `TabBar.tsx`; it holds the `TABS` list, `useTabScreenOptions()` (bar, label and item styles from THEME.md) and `tabOptions(tab)` (title, icon, a11y label, `tabBarButtonTestID` = `tab-<id>`). No custom `tabBar` component, so nothing is redrawn by hand.
- **Option types come from expo-router** (`ComponentProps<typeof Tabs.Screen>['options']`), so the app doesn't import `@react-navigation/*` directly and needs no new dependency.
- **No React Navigation `ThemeProvider`.** Legacy used one only to set the navigator background to `surface` (and the stock `DarkTheme` in OS dark mode, which changed nothing visible because headers and the tab bar set their colours explicitly). The rebuild sets `contentStyle` (stack) and `sceneStyle` (tabs) to `surface` instead. Screens stay light in dark mode, as THEME.md says.
- **Headers:** one shared option set (surface background, primary tint, back title "Back") with a route → title map in the root layout. Story detail: transparent header, white tint, empty title. Profile: modal.
- **Placeholders** (`components/navigation/PlaceholderScreen.tsx`): `TabPlaceholder` draws the hero block (wordmark, 36 / 900 title, 15 / 500 subtitle); Impact also has legacy's profile button and StatusBarScrim. `StackPlaceholder` shows a title and the `id` param; story adds a dark cover band so the white back arrow is visible. testIDs are `screen-<name>` (plus `-title`, `-wordmark`, `-param`). Until Phase 8 builds real entry points, the Impact placeholder lists a link to every stack route (`impact-link-<name>`).
- **`product`, `company`, `story` and `receipt` export `RouteErrorBoundary` as `ErrorBoundary` now,** per SPEC "Route error boundary".
- **The root URL is now the Impact tab.** The P1.2 `placeholder-home` screen is gone; `e2e/smoke.spec.ts` checks `screen-impact-wordmark` reads "Sarvis".
- **E2E:** on web the header back button is a link named "Go back", not a button.

## D-025 Email auth, AuthGate and e2e test users — Accepted (P1.10)
- **New dependencies:**
  - `@supabase/supabase-js` ^2.118.0 in `app/` (the client) and as a root devDependency (the Node test-user script).
  - `@react-native-async-storage/async-storage` 2.2.0 in `app/` (`npx expo install`, the SDK 54 version). It stores the session on native, as in legacy. Web uses supabase-js's default `localStorage`.
- **AuthGate = expo-router `Stack.Protected` guards,** not legacy's `useSegments` + `router.replace` effect. `auth` is guarded by `!session`, and every app route by `session`. Sign-in and sign-out just change the session, and the router moves to the first allowed screen, so screens never navigate after auth. The dev routes (`/dev/*`) are outside both guards so the gallery stays reachable. The root layout shows a spinner until the stored session has been read, as legacy did, so signed-in users never see `/auth` flash.
- **Env loading:** one `.env` at the repo root. The app's `start` / `web` / `android` scripts run Expo through `node --env-file-if-exists=../.env`, because Expo only reads `.env` from `app/`. `supabase.ts` throws a clear error if the URL or key is missing, or if the URL has a path (`/rest/v1/` broke every call during setup).
- **Error copy:** `app/src/lib/errors.ts` ports legacy `toFriendlyError` / `toUserMessage` (without the guest and anonymous strings, D-015). `FriendlyError` moved there from `ErrorState.tsx`, as D-023 anticipated. `ErrorState` re-exports it.
- **Auth screen:** a port of legacy `auth.tsx` limited to email (no provider buttons or divider, D-015). The primary and resend buttons use the shared `Button` (`shape="block"`). "Forgot password?" sends Supabase's reset email, as legacy did, and the reset link is handled in **P1.15**. Email links redirect to `Linking.createURL('/')` (`sarvis://` in builds), so there's no `expo-auth-session` dependency.
- **Sign-out** uses supabase-js's default (global) scope, as in legacy.
- **Test users (D-015 option a):**
  - `scripts/dev-create-test-user.ts` runs on Node's built-in TypeScript stripping and `--env-file`, so it needs no tsx or dotenv.
  - It refuses any URL but `https://smqovgawfjmxernqlxjd.supabase.co`.
  - It creates the user, or resets the password of an existing one, with `email_confirm: true` and `display_name` metadata.
  - It never prints the key or password.
- **E2E:**
  - `e2e/global-setup.ts` creates `e2e-shell@example.com` and `e2e-auth@example.com` with new random passwords on every run. Passwords are passed to workers through env and never written to disk.
  - Global setup then signs the shell user in through the UI and saves its storage state (`e2e/.auth/`, gitignored), which is the default for every spec. `auth.spec` starts signed out and uses its own user, because a global sign-out would revoke the shared session.
  - E2E needs the dev service-role key, so it still runs locally only, not in CI.

## D-026 Account deletion RPC and cross-platform confirms — Accepted (P1.11)

- **RPC shape:** `private.delete_own_account()` (security definer, `search_path = ''`) deletes `auth.users where id = auth.uid()` and raises if there is no uid. `public.delete_own_account()` is a security-**invoker** SQL wrapper, so the app can call `rpc('delete_own_account')` while the privileged body stays in `private` (D-020). Both have `EXECUTE` revoked from `public` and `anon` and granted to `authenticated`. The security advisor flags nothing.
- **Cascade, not an explicit list:** unlike legacy, the function doesn't delete table by table. Every user-owned table must reference `auth.users` with `on delete cascade` (profiles already does). Later phases keep to that, so deletion stays one statement.
- **Client:** `deleteAccount()` calls the RPC, then `signOut({ scope: 'local' })`. supabase-js still calls `/logout`, which returns 403 because the session is gone. supabase-js treats that as signed out, and the browser logs it. The e2e test allows that one request and nothing else.
- **Dialogs:** `app/src/lib/dialogs.ts` (`confirmAsync`, `showAlert`). React Native Web's `Alert.alert` does nothing, so legacy's two-step delete never opened on web. On web the helper uses `window.confirm` / `window.alert`, which can't label their buttons, and native keeps `Alert.alert` with the legacy button labels. Phase 8 can swap in a styled modal without changing callers.
- **Button:** `destructive` on the primary variant now gives the legacy delete look (an `errorContainer` fill with an `error` label).

## D-027 Web-only `/admin` gate — Accepted (P1.12)

- **Route shape:** an `(admin)` group whose pages live under `(admin)/admin/`, so URLs are `/admin`, `/admin/…`. The root layout lists `(admin)` inside the signed-in `Stack.Protected` guard, so signed-out users go to `/auth` like every other app route. (An unlisted route would escape the guard.)
- **Web-only by platform file:** `(admin)/_layout.tsx` is the native layout and only `<Redirect href="/" />`. `(admin)/_layout.web.tsx` is the gate. Metro picks the `.web` file on web, so the gate never ships to native.
- **The server decides:** `public.admin_ping()` (security invoker, `search_path = ''`, `EXECUTE` for `authenticated` only) returns `true` when `private.is_admin()` is true and raises `42501 Admin only` otherwise. PostgREST turns that into a 403. The gate calls it through `checkIsAdmin()` in `app/src/lib/admin.ts`: `42501` → "Not authorised" ErrorState with "Back to home", any other error → a retryable ErrorState, `true` → `<Slot />`. Nothing under the layout renders before the answer. The RPC is the server-side proof only. Real admin data in Phase 5 is protected by RLS policies on `private.is_admin()`, not by this check.
- **Lazy loading without `asyncRoutes`:** route files under `(admin)/admin/` are thin `React.lazy(() => import(...))` wrappers around components in `app/src/components/admin/`. `expo export -p web` puts each in its own chunk (`AdminHome-<hash>.js`, 1 KB today), and only the gate is in the entry bundle. Expo Router's `asyncRoutes` would split every route, which the user app doesn't need.
- **Test admin:** `ensureTestUser` / `npm run dev:test-user` take `role` (`--role user|admin`) and set `profiles.role` with the dev service-role client. Clients can't write that column. E2E global setup creates `e2e-admin@example.com` as admin and resets the other e2e users to `user` on every run.
- **E2E workers capped at 4:** the dev server renders each page on one Node thread, so at the default 8 workers page loads queued for about 5 s each and the multi-reload auth specs hit the 30 s timeout. This happened even without the new spec. At 4 workers the suite is faster (about 40 s) and passed 3 runs in a row.

## D-028 Auth email links and the password-reset flow — Accepted (P1.15)

- **The app reads auth links itself, on every platform.** `detectSessionInUrl` is now `false`. On start, `AuthProvider` reads the opening URL: `window.location.href` on web, `Linking.getInitialURL()` on native. Native also listens for `url` events while the app is open. It parses the URL with `parseAuthRedirect` (`app/src/lib/auth/redirect.ts`, unit tested), calls `setSession` with the fragment's tokens, then lets the guards run (`isLoading` stays true until then). With `detectSessionInUrl`, supabase-js fired `PASSWORD_RECOVERY` from an async init that could run before the provider subscribed, so the reset screen could be missed. One code path also means sign-up confirmation links now work on Android, not just web.
- **Implicit flow, no PKCE:** Supabase's default email links redirect with `#access_token=…&refresh_token=…&type=…`, or `#error=…&error_description=…` for a used or expired link. There is no `code` handling, because the client doesn't use PKCE.
- **Recovery is a guard state:**
  - A `type=recovery` link sets `recovering`. The root layout then exposes only `/reset-password` (`Stack.Protected guard={signedIn && recovering}`); the tabs and stack routes need `signedIn && !recovering`.
  - Saving the password (`updateUser`) or cancelling (sign out) clears it.
  - The recovering user's id is kept in AsyncStorage (localStorage on web), so a reload or app restart still lands on `/reset-password`.
- **Link errors show on `/auth`:** the provider holds the mapped copy ("That link has expired…"), and the auth screen shows it like its own errors until the next edit or action.
- **Tokens leave the address bar:** on web, `history.replaceState` drops the fragment once it's read.
- **Shared field:** `components/ui/PasswordField.tsx` (input + show/hide toggle, `${testID}-toggle`) and `authInputStyle.ts` are used by `/auth` and `/reset-password`. testIDs are unchanged.
- **Testing without email:** `npm run dev:recovery-link -- --email <e> [--redirect <url>]` (`scripts/dev-recovery-link.ts`, dev project only) prints the `generateLink` action link, which is the same URL the reset email contains. E2E uses `generateRecoveryLink` with `e2e-reset@example.com`.
- **Redirect allow-list (dev project):** `http://localhost:8081/` and `exp://127.0.0.1:8081/--/` already pass. `sarvis://` was added by the owner in **P1.17** (`sarvis://**`). Before that, Supabase fell back to the Site URL, `http://localhost:3000`.

## D-029 The guarded deep-link dev warning is expected — Accepted (P1.16)

- **What it is:** React Navigation's `useNavigationBuilder` (`@react-navigation/core` 7.24) calls `console.error("The 'state' or 'screen' passed in the params couldn't be applied to the navigator with the screens: …")` when the nested params from a deep link name a screen that the navigator doesn't currently have. With `Stack.Protected`, the root stack has only `auth` and the dev routes while signed out, only `reset-password` while recovering, and so on. The navigator ignores the params and uses its default `'firstMatch'` behaviour: it shows the first open screen. That is the correct landing (`/auth`, `/reset-password`, or the tabs).
- **Expected, not a misuse:** React Navigation documents this exact case: "Opened a deep link to a screen, but a login screen was shown." The call is wrapped in `process.env.NODE_ENV !== 'production'`, so release builds never log it, and LogBox only exists in development.
- **When it shows:** any deep link to a route that is guarded out at that moment. On Android, Metro logged it for signed-out `/settings` and `/admin` and for a recovery link targeting `/`. LogBox showed the toast for a link that reached the already-open app. A link that made Expo Go reload the app logged it without a toast. Web doesn't hit it: e2e checks for console errors on signed-out deep links. Signed-in deep links don't log it.
- **Why not silence it:** the only switch is the navigator option `UNSTABLE_routeNamesChangeBehavior: 'lastUnhandled'`. It is marked unstable, and it also changes behaviour: it keeps the unhandled target and opens it once the guard allows, which means sending the user to the deep-link target after sign-in. P1.16 puts that feature out of scope. If Phase 8 wants it, try that option first, then re-test the e2e guard specs and the reset flow. Filtering the message with `LogBox.ignoreLogs` would hide a real misconfiguration too, so we don't.

## D-030 Phase 2 task plan choices — Accepted (P2.0)
- **Migration order follows foreign keys, not the DATA_MODEL section order:** bookkeeping → sources seed → matching and review → ownership → products → stores and prices; AI and audit → scoring and evidence; editorial last. `match_candidates` comes before ownership because `brand_ownership.match_candidate_id` references it, and `ai_calls` comes before `company_scores`.
- **`banners` ships with the ownership migration (P2.4), not stores and prices.** `product_identifiers.banner_id` (P2.5) references it, and a banner is a company's operating link. The columns stay as in DATA_MODEL §3.4.
- **GTIN normalization moves from Phase 4 to Phase 2:** the TS function in P2.10 and the SQL check in P2.5, with the same test vectors. The fixture source and the legacy re-import key products on GTIN, so they need it. Phase 4 extends it with whatever the real P3 data shows.
- **`sources` is seeded by a data migration** that upserts on `key`. It covers every S-id, including avoided sources (`enabled = false`), so a later approval is a one-row change and the verdict refusal can be tested. Source rows are reference config and belong in version control, like schema. S24 RSS feeds get one row per feed, each added when its terms are checked.
- **Legacy scores import under a `legacy` rubric row** with no owner approval date. `company_scores.rubric_id` is required, and legacy scores had no rubric. They stay `pending` (no citations, R13).
- **Tests that hit the dev DB run locally and are skipped in CI.** CI holds no secrets (D-019). The run-twice e2e test (P2.17) skips when `SUPABASE_DEV_SERVICE_ROLE_KEY` is unset. Each schema task saves its RLS checks as `supabase/tests/<domain>.sql`, run inside `begin … rollback`.
- **No new tools for running TS:** the pipeline uses Node 22 `--experimental-strip-types`, as `scripts/` already does. New runtime dependencies so far are `zod` (core, P2.10) and `@supabase/supabase-js` (pipeline, P2.12). Each is recorded with its reason in its task.
**Why:** each task stays one session, and every migration applies cleanly on top of the previous one.

## D-031 Pipeline bookkeeping schema details — Accepted (P2.1)
- **`sources` is public-read, every column.** DATA_MODEL §3.1 planned to show the public only the attribution columns, through a column-limited view, and keep the rest admin-only. Postgres column grants are per role, though, and admins share the `authenticated` role. A column-limited view that hides columns from non-admins would have to be a security-definer view, which the advisor flags as an error. Every column in `sources` mirrors the public SOURCES.md in a public repo, so nothing is lost by making it readable. The table comment forbids secrets and private notes. Writes stay admin-only. The `source_attributions` view (`security_invoker`) still gives the About screen the attribution fields, including `licence_url`, which ODbL attribution needs, and hides avoided sources.
- **`normalize_match_text()`** is `immutable` and names the dictionary (`extensions.unaccent('extensions.unaccent'::regdictionary, …)`) so expression indexes can use it. `unaccent` also maps ’ to ', so "Ben’s" and "Ben's" match.
- **`slug` is a domain** (`^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 64 characters), so every slug column shares one check. Source keys use it too.
- **Checks beyond DATA_MODEL:**
  - an `avoid` source can't be `enabled`;
  - `rate_limit_per_sec` must be > 0 and ≤ 1 (the CLAUDE.md limit);
  - a run has `finished_at` if and only if it isn't `running`;
  - `sample_size` is set exactly for `sample` runs, and optionally for `dry_run`;
  - `access_method` adds `scrape` (avoided retailers) and `internal` (`manual`, `legacy-import`, `receipts`, `derived`, `fixture`).
- **`raw_objects.run_id` is nullable.** Edge-function lookups and AI responses (D-009) store raw files outside a run. Deleting a run cascades to its events, failures and raw-object rows. Facts use `on delete set null` for `raw_object_id` (later domains).
- **The `raw` bucket** is private, holds `application/gzip` only, and caps files at 50 MB (the free-tier per-file limit). It has one policy: admins can read. No client can write; the pipeline uses the service role.

## D-032 Sources seed details — Accepted (P2.2)
- **Keys:** `off` (S1), `off-api` (S2), `open-prices`, `statcan-18100245`, `wikidata`, `wikipedia`, `sec-edgar`, `corp-canada`, `gdelt`, and so on. Avoided sources get keys too (`loblaw-pc-express`, `costco-ca`, …). The full list is in the migration `20261028221731_seed_sources`.
- **The upsert only touches rows that differ.** `on conflict (key) do update … where (columns) is distinct from (excluded columns)`, so a re-run changes 0 rows and leaves `updated_at` alone. The seed mirrors SOURCES.md, verdict and `enabled` included: change a verdict in SOURCES.md first, then in a new migration.
- **S24 is one umbrella row** (`rss-publishers`, verdict `use`, `enabled = false`), so every S-id is present and the verdict counts match SOURCES.md §1. No job may run it. Each feed gets its own row with `sources_md_id = 'S24'` when its terms are checked (D-013 D4).
- **`rate_limit_per_sec` takes the stricter of 1 req/s and the published limit:** S2 0.25 (15/min), S6 0.5 (`Crawl-delay: 2`), S21 0.05 (`Crawl-delay: 20`), S3 and S13 0.1. Daily caps (S22) aren't modelled; the source is avoided.
- **`url_template`** is set for OFF product pages (S1, S2) and Wikidata entities (S17, `https://www.wikidata.org/wiki/{external_id}`). Others have no exact URL rule yet.
- **`refresh_interval` is left null** until the Phase 6 freshness policy.
- **Internal sources** (`manual`, `legacy-import`, `receipts`, `derived`, `fixture`) have `access_method = internal`, verdict `use` and no licence or attribution. They pass the `source_attributions` filter (verdict ≠ `avoid`), so the About screen should list only rows with `attribution_text`. `fixture` is enabled on dev; whether it exists on production is a release question.
- **Manual-only sources (S27–S29) stay enabled.** The verdict alone blocks jobs, and admins cite them by hand.

## D-033 Matching and review schema details — Accepted (P2.3)
- **`kind` pins the subject and candidate tables.** The ids are polymorphic, so they can't have foreign keys. A check pins each kind instead: `listing_product` is `store_listings` → `products`, `product_brand` is `products` → `brands`, `brand_company` is `brands` → `companies`, `company_company` is `companies` → `companies`, and `category` is `products` or `store_listings` → `categories`. A new kind, such as fuzzy duplicates of brands, needs a migration.
- **Decisions are consistent by constraint.** In `match_candidates`, `decided_at` and `decision_method` are set exactly when `status` isn't `pending`. An `auto` decision has no `decided_by`. The `+review` block (README) follows the same rule with `reviewed_at`, and adds `legacy` for bulk decisions on legacy-imported facts.
- **`match_method`** is checked against the DATA_MODEL list plus `rule:<name>` (lower-case). `features` must be a JSON object of at most 1 KB, and `score` must be between 0 and 1.
- **`review_queue` allows one open row per `(item_table, item_id)`** (partial unique index), so a re-run job can't queue the same fact twice. `item_id` must look like a uuid or a bigint. `priority` is 0–100, higher first, with a default of 50. `resolved_at` is set exactly when the row isn't `open`.
- **`run_id` on `match_candidates` is `on delete set null`**, because the accepted row is the decision record and must outlive its run. Profile references (`decided_by`, `assigned_to`, `resolved_by`, `reviewed_by`) are also `on delete set null`, so none of them can be required.
- **Added columns:** `match_candidates.created_at` (for the 30-day cleanup). There's no `updated_at`; `decided_at` records the one change that matters.
- **Public `+review` tables use two select policies,** one for anon (`approved`) and one for authenticated (`approved` or admin), because anon can't execute `private.is_admin()`.

## D-034 Ownership schema details — Accepted (P2.4)
- **Edge keys use `unique nulls not distinct`** on `(parent, child, relation, valid_from)` and `(brand, company, relation, valid_from)`. It's the same rule as DATA_MODEL's `coalesce(valid_from, '-infinity')`, but it's a plain column constraint, so imports can name it as an `on conflict` target.
- **Cycles:** a `before insert or update` trigger (`private.company_ownership_reject_cycle`, security definer) rejects an edge whose child already reaches its parent through **pending or approved** edges, whatever the relation or dates. Rejected and superseded edges are ignored, so a historical reverse takeover is stored by superseding the old edge first. Reopening a rejected edge is checked too. An advisory transaction lock serializes edge writes, so two concurrent inserts can't close a loop. The error code is `23514`.
- **One controlling parent:** at most one current (`valid_to is null`), approved `subsidiary` / `majority_stake` / `division` edge per child company (partial unique index). `minority_stake` and `joint_venture` don't confer control and aren't limited. This makes `company_ultimate_parent` a single chain.
- **Brand ownership relations:** `owner` and `private_label_of` both count as ownership. The partial unique index allows one current approved row of either per brand, and `brand_current_owner` shows either. A `licensee` is never the owner.
- **`confidence` is nullable** (legacy and manual edges have none, and inventing a value would be fake precision), but an edge with `method = 'ai'` must have one.
- **`company_ultimate_parent`** has one row per visible company; a company with no controlling parent is its own top parent at depth 0. It walks approved, current, controlling edges to a depth of at most 20, with a path check as a second guard against loops. It's a recursive view over all companies, so a filter on `company_id` doesn't narrow the walk. That's fine at the planned scale (a few thousand companies). If the product screen gets slow, add an RPC that walks from one company.
- **`ai_call_id` isn't added yet.** `ai_calls` arrives in P2.7, which adds the column and its foreign key to the edge tables (PLAN P2.7).
- **Status and checks:** brands use the company statuses (`active`, `defunct`, `merged`, `rejected`). `merged` holds if and only if `merged_into_id` is set, and a row can't merge into itself. Anon sees every company and brand except `rejected` ones. `banners` has no status, so it's fully public. `wikidata_qid` must look like `Q123`, `sec_cik` is 10 zero-padded digits, `country` is upper-case ISO 3166-1 alpha-2, and URLs must be http(s).
- **Deletes:** deleting a company or brand cascades to its edges. `merged_into_id` and `banners.operator_company_id` are `on delete restrict`.

## D-035 Products schema details — Accepted (P2.5)
- **GTIN in SQL:** three immutable public functions. `gtin_is_valid(text)` accepts 8, 12, 13 or 14 digits with a correct GS1 mod-10 check digit. `gtin_normalize(text)` returns the GTIN-14 form or null. `gtin_is_restricted(text)` is true for GS1 prefixes 02 and 20–29 (`002…` / `02…` as GTIN-14). Input must be digits only; cleaning is the TS side's job (P2.10). `products.gtin` and `product_identifiers` (`gtin_alt`) both require a valid, unrestricted 14-digit code. EAN-8 restricted prefixes and UPC-E expansion are left to the P4 parser.
- **Shared test vectors:** the GTIN vectors live in `supabase/tests/products.sql`. P2.10's `normalizeGtin()` must give the same answers (a line added to P2.10's verification).
- **`category_mappings.source_id`** is a single column for both meanings: the source whose category key is mapped, and the `+prov` source. How the mapping was made (manual, AI, derived) is in `method` / `method_version`. An AI mapping must carry a `confidence`. `ai_call_id` is added in P2.7, as for the ownership edges.
- **Categories:** the slug is the path (`dairy/milk/plant-based`), so it uses its own check (slug segments joined by `/`, ≤ 200 characters) instead of the 64-character `slug` domain. `level` must equal the number of `/`, a root has no parent, and a trigger (`private.categories_check_path`) requires a child's slug to be its parent's slug plus one segment. Categories have no `+prov`: the taxonomy is ours (DATA_MODEL §3.3).
- **Labels:** `id` is a fixed smallint, not an identity, because `products.label_codes` stores the ids. Ten seed rows: organic, fair-trade, rspo, rainforest-alliance (incl. UTZ), msc, b-corp, non-gmo, vegan, free-range, animal-welfare. Each `off_tags` value was checked against the OFF labels taxonomy API on 2026-10-28. A tag belongs to at most one label (checked in the test, not by a constraint). `label_codes` can't have a foreign key; P2.11 validation checks the codes exist.
- **Product checks:** `net_quantity` and `net_unit` are set together; `unit_parse_status = 'ok'` needs a quantity; `merged` holds if and only if `merged_into_id` is set. Anon sees only `status = 'active'` products, as DATA_MODEL says. Discontinued and merged rows are visible to admins only; the P8 product screen should resolve old scans through `merged_into_id` on the server side if needed.
- **Identifiers:** `store_sku` and `store_internal` need a banner. `plu` is 4–5 digits, `store_internal` is digits. The key is `unique nulls not distinct (scheme, value, banner_id)` (the DATA_MODEL nil-uuid rule, usable as an `on conflict` target, as in D-034). Deleting a banner or product cascades to its identifiers.
- **`product_sources`** keeps exactly the DATA_MODEL columns (no `ingestion_run_id` / `raw_object_id`), plus `last_seen_at >= fetched_at`. Admin only.
- **Views:** `products_with_source_url` adds `resolved_source_url` (stored URL, else `url_template` with `external_id`). `product_ownership_chain` has one row per visible product, with left joins, so a product with no brand or no approved owner still appears with null links. It reuses `brand_current_owner` and `company_ultimate_parent` (so the D-034 scale note applies).
- **Index budget:** `products` has six secondary indexes besides the two unique keys. Most are on low-cardinality foreign keys (brand, category, run, raw object, merge target), which B-tree deduplication keeps small. P2.19 measures the real size against BUDGET.md.

## D-036 Stores and prices schema details — Accepted (P2.6)
- **Effective price (`current_prices`):** one row per store × product. The candidates are non-member observations that have a `product_id`, plus weekly receipt points (visible ones only, through RLS). Each candidate is dated by `coalesce(last_confirmed_on, observed_on)`, or by the last day of the week for a weekly point. The newest date wins. On the same date a `sale` beats `regular` / `unknown`, which beats a receipt median. `member` never counts. So a regular price confirmed after a sale ends that sale, and a sale observed after the regular price wins. This is the legacy "sale, else regular" rule adapted to separate point readings, since there's no sale end date to check.
- **Store keys:** `(osm_type, osm_id)` unique, `(banner_id, external_store_id)` unique, and `slug` unique. Each pair must be fully set or fully null, and an external store id needs a banner. Store status is `active` / `closed` / `rejected`, and anon sees everything except `rejected` (as for companies).
- **Listings:** `listing_key` is a stored generated column, `normalize_match_text(listing_name || ' ' || size_text)`. The two keys are partial unique indexes, so an `on conflict` must repeat the predicate (`where external_sku is null` / `is not null`). The trigram index is on `normalize_match_text(listing_name)`. Anon and non-admins see only listings with a `product_id`.
- **Observations:** `method` is limited to `import` / `api` / `manual` (DATA_MODEL). Each row needs a product or a listing. `last_confirmed_on >= observed_on`, `price_without_discount >= price`, and `unit_price` and `unit_basis` are set together. The prices on all price tables are > 0 and ≤ 10,000.
- **Deletes:** prices and points cascade from their store, product or listing (as edges do in D-034). A store's banner is `on delete restrict`. Admins should reject rather than delete.
- **`price_points_monthly`:** `banner_id` is nullable, because a store's banner can be unknown, but each row needs a store or a banner. The key is `unique nulls not distinct (store_id, banner_id, product_id, month)`. It has a `source_id` (the `derived` source), which DATA_MODEL left out, so every fact has one. It's fully public. Receipt-derived monthly rows need the Phase 8 k-anonymity rule too (noted in DATA_MODEL §9).
- **Weekly and monthly dates:** `week_start` must be a Monday (ISO), and `month` / `ref_month` must be the first of the month. Weekly points have `n_receipts <= n_lines` and min ≤ median ≤ max.
- **`price_sanity_bounds`:** one row per `(category_id, unit_basis)`, so a manual override replaces the derived row. `max > min > 0`. Admin only.
- **Open Prices has no `url_template` yet,** so its observations must store `source_url` until Phase 3 adds a checked template to the `open-prices` source row.
