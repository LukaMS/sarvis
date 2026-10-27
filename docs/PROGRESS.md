# Progress log

Newest entry first.

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
