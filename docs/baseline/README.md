# Baseline screenshots

Visual targets for the rebuild: what the legacy app ("Conscious Curator") looks like today. New screens are compared against these (CLAUDE.md › Verifying your work), and the look should match unless `docs/PLAN.md` says otherwise.

| Folder | Contents | Task |
|---|---|---|
| `web/` | User app on web, 390 × 844 viewport | P0.6 (done 2026-10-26) |
| `android/` | User app on the Android emulator (Expo Go), 640 × 1428 (half of 1280 × 2856) | P0.7 (done 2026-10-26) |
| `admin/` | Admin portal, 1440 × 900 viewport, full-page captures | P0.8 (done 2026-10-26) |

## How the web set was captured (P0.6)

- **Legacy app:** `LEGACY/` (`C:/Users/lukam/Coding Projects/MobileDev/Ethical-App`) served with `CI=1 npx expo start --web --port 8090`, read-only.
  - The legacy repo has no `.env`, so it ran against the live legacy Supabase project with the default anon key.
  - `git status` and the `git diff` hash of the legacy repo were identical before and after the run (the owner's pre-existing uncommitted changes there were left untouched).
- **Browser:** Playwright MCP (Chromium), viewport 390 × 844, device pixel ratio 1, screenshots at CSS scale.
- **Account:** the owner's existing legacy account. **No writes:**
  - no scans recorded, no submissions, no receipts, no profile saves;
  - products and companies were opened by URL, not from search results, because tapping a search result records a `manual_search` scan;
  - sign-out was done by clearing the local session in `localStorage`, not through the app's Sign Out button.
- **Timing:** each screen was captured after its loading spinner disappeared, plus 1.5 s for `FadeInDown` entrance animations. Scrolled shots scroll the screen's inner ScrollView, then wait 0.8 s.
- **Redaction:** the owner's first name and email were replaced *in the page DOM only* before each screenshot: name → "Alex", avatar initial → "A", email → `you@example.com`. A post-redaction leak check found nothing on every shot. Nothing was saved to the database.
- **Web direct loads:** screens opened by URL have no stack history, so detail screens show their header title without a back arrow. In-app navigation shows a "Back" button.

## Screens

Every route file in `SPEC.md` › User app: screens has a row. Web files are in `web/`, Android files in `android/` (same numbering where the screen matches).

| # | Screen | Route file | Web file(s) | Android file | Notes |
|---|---|---|---|---|---|
| 1 | Root layout | `src/app/_layout.tsx` | — (visible as stack headers on every detail screen, e.g. `13-product.png`) | — (stack headers with native ← back arrow on every detail screen, e.g. `12-receipt-detail.png`) | Shell only. The splash/auth-loading spinner shows for under a second and was not captured. |
| 2 | Tab layout | `src/app/(tabs)/_layout.tsx` | — (tab bar visible in `03`, `05`, `07`, `10`) | — (tab bar visible in `03`, `05`, `07`, `10`) | Floating white tab bar, top radius 24. |
| 3 | Auth — sign in | `src/app/auth.tsx` | `01-auth-sign-in.png` | `01-auth-sign-in.png` | Email/password only (Google, Apple and guest flags are off). |
| 4 | Auth — sign up | `src/app/auth.tsx` | `02-auth-sign-up.png` | `02-auth-sign-up.png` | Mode toggle only. **Not captured: "Check your inbox" state** (needs a real sign-up = write). |
| 5 | Home (Impact) | `src/app/(tabs)/index.tsx` | `03-home.png`, `04-home-scrolled.png` | `03-home.png` (greeting redacted), `04-home-scrolled.png` | Spotlight = Bolthouse Farms (first `Good` company). Featured = Danone story. **Not captured:** empty-scans card (the account has scans), error state. |
| 6 | Scan | `src/app/(tabs)/scan.tsx` | `05-scan.png`, `06-scan-scrolled.png` | `05-scan.png`, `06-scan-scrolled.png`, `05b-scan-camera-permission.png`, `05c-scan-camera.png` | **Not captured on web:** the camera modal. On web, tapping Scan Barcode does nothing visible: no camera permission in this browser, and the denial `Alert.alert` is a no-op on react-native-web, so it's a silent dead end. Also not captured: the scan result card and not-found alerts (need a real scan = write). Android has the camera: `05b` (system permission prompt, "Only this time" granted) and `05c` (scanner modal over the emulator's virtual scene; closed immediately, nothing scanned). |
| 7 | Search | `src/app/(tabs)/search.tsx` | `07-search-empty.png`, `08-search-results.png` (`?q=a`), `09-search-no-results.png` (`?q=zzqx`) | `07-search-empty.png`, `08-search-results.png`, `09-search-no-results.png` | **Not captured:** "Thanks — added to review queue" state (needs a submission = write). |
| 8 | History | `src/app/(tabs)/history.tsx` | `10-history.png`, `11-history-barcode-filter.png` | `10-history.png`, `11-history-barcode-filter.png` | Loads slowly (about 3 s spinner on a direct load). **Not captured:** empty state (the account has history). |
| 9 | Product detail | `src/app/product/[id].tsx` | `13-product.png`, `14-product-scrolled.png` (Alpro Oat Milk), `15-product-alternatives.png` (KitKat, with Better alternatives), `32-product-not-found.png` | `13-product.png`, `14-product-scrolled.png`, `15-product-alternatives.png`, `32-product-not-found.png` | |
| 10 | Company detail | `src/app/company/[id].tsx` | `16-company.png`, `17-company-mid.png`, `18-company-bottom.png` (Nestlé: controversies, boycotts, "Source not yet linked"), `19-company-sparse.png` (Bolthouse Farms: sparse-profile notice) | `16-company.png`, `17-company-mid.png`, `18-company-bottom.png`, `19-company-sparse.png` | |
| 11 | Story detail | `src/app/story/[id].tsx` | `21-story.png` | `21-story.png` | All legacy stories have no body, so "Full story coming soon" shows. |
| 12 | Stories list | `src/app/stories.tsx` | `20-stories.png` | `20-stories.png` | |
| 13 | Receipt scan | `src/app/receipt-scan.tsx` | `22-receipt-scan.png` | `22-receipt-scan.png` | The photo picker and "Match items" were **not run** (both save a receipt = write). The placeholder shows real catalogue product names. |
| 14 | Receipt results | `src/app/receipt-results.tsx` | `24-receipt-results-empty.png` | `24-receipt-results-empty.png` | Empty state only (results live in memory after a scan). **Not captured: populated results** (needs a scan = write). The populated layout can be seen in `LEGACY/argent-audit-screenshots/issue-critical-010-receipt-matcher-0-of-4-known-brands.png` (older build). |
| 15 | Receipt detail | `src/app/receipt/[id].tsx` | `12-receipt-detail.png` | `12-receipt-detail.png` | An existing saved receipt (1 matched item, 3 "Not in database"). |
| 16 | Profile (modal) | `src/app/profile.tsx` | `25-profile.png` | `25-profile.png` (name + initial redacted) | Redacted name. On web the modal presentation renders as a normal page. |
| 17 | Settings | `src/app/settings.tsx` | `26-settings.png`, `27-settings-account.png`, `28-settings-danger.png` | `26-settings.png` (name + email redacted), `28-settings-danger.png`. No separate middle shot: the taller screen covers it in two. | Redacted name and email. Nothing saved. **Not captured:** guest-account variant (guest is disabled). |
| 18 | Privacy | `src/app/privacy.tsx` | `29-privacy.png`, `29b-privacy-controls.png` | `29-privacy.png`, `29b-privacy-controls.png` | |
| 19 | Help & Support | `src/app/help.tsx` | `30-help.png` | `30-help.png` | First FAQ expanded. |
| 20 | About | `src/app/about.tsx` | `31-about.png`, `31b-about-legal.png` | `31-about.png`, `31b-about-legal.png` | |

Rows 3/4 share `auth.tsx`, so all 19 route files are covered: 17 with screenshots, plus the 2 layout files shown through other screens.

## How the Android set was captured (P0.7)

- **Device:** emulator `Pixel_10_Pro` (Android 17, 1280 × 2856, 480 dpi), with Expo Go installed by `npx expo start --android` (it wasn't on the emulator before).
- **Legacy app:** served with `CI=1 npx expo start --android --port 8090`. The legacy repo's `git status` and diff hash were again identical before and after.
- **Same account and no-writes rules as web.** Screens were opened with Expo deep links (`adb shell am start -a android.intent.action.VIEW -d exp://<host>:8090/--/<route>`), so nothing was opened from a search result. Sign-in was through the form. The sign-up form was only switched to, never submitted.
- **Screenshots:** taken with the mobile MCP at half resolution (640 × 1428). Captures waited 4–6 s after each deep link and checked on screen; swipes were used for scrolled shots.
- **Redaction (D-012):** on Profile, Settings and the Home greeting, the name, initial and email text boxes (bounds from the MCP element list) were painted over with the surrounding colour, with "Alex" / "A" / `you@example.com` drawn in the original text colour, before resizing. The raw full-resolution captures stayed in the session scratchpad and are not in the repo.

## Android vs web — differences to expect

- **Headers:** Android shows the native stack header with a ← back arrow (deep links push onto the stack). Web direct loads show the title only.
- **Status bar and gesture bar:** Android draws content under a translucent status bar and has a gesture pill at the bottom. The tab bar adds the bottom inset (62 + inset), and on Home the floating tab bar overlaps the bottom of the Recent Scans cards.
- **Tab bar:** active state is the icon and label colour only, as on web. The grey square behind IMPACT in `android/03-home.png` is leftover Android focus/press state from the sign-in tap, not part of the design (other tab shots don't show it).
- **Fonts:** Roboto (Android system font) versus the browser's default sans on web (Segoe UI on this Windows machine). Weights and sizes match; widths differ slightly, so line breaks differ (e.g. the story title fits on one line on Android).
- **Screen height:** the taller Android viewport shows more per screen. Settings needs only 2 shots, and Privacy shows its first data-control button.
- **Camera:** works on Android (permission prompt → scanner modal). On web it's a silent dead end (see web row 6).
- **Modal:** Profile opens as a full-screen card with a back arrow on Android; on web it's a normal page.
- **Console (Android, from the Metro log):** `[sync] freshness check failed … check_content_freshness(since_ts)` ×23 (the known SPEC bug, on each foreground and focus), plus one `setLayoutAnimationEnabledExperimental is currently a no-op in the New Architecture` warning from the Help FAQ accordion (`LayoutAnimation` won't animate there).

## Admin portal (P0.8)

**How captured**
- `LEGACY/admin` served with `npx vite --port 5180 --strictPort` (the project's `npm run dev` with a fixed port). Playwright at 1440 × 900, `fullPage: true`.
- **Browse only:** no save, enrich, delete, link, look-up, test or job buttons were pressed. The legacy repo was unchanged afterwards (git status and diff hash identical).
- **Connected with the public anon key only, deliberately.** The legacy admin expects the service-role key in the browser (SPEC › Admin portal), and that would give a tool write access to production data, which CLAUDE.md forbids.
  - The key was read from `LEGACY/src/constants/config.ts` and injected into `localStorage` by a gated init script, without ever being printed. Its JWT role was checked to be `anon` before any page loaded.
  - The connection was removed and the browser closed afterwards. The API-key field on Settings is a password input (dots) and was masked as well.
- **What the anon key shows:** RLS lets the anon role read only the public editorial tables. So:
  - the editorial pages (Products, Brands, Companies, editors, Stories, QR Codes) show **real data**;
  - user data (Activity, Submissions, Receipt Lab's unmatched queue, Dashboard's scans, receipts and users counts), `app_settings` (Settings › AI pipeline shows defaults and placeholders, not live values) and every Retailer Catalogue table show **empty/zero states**, because RLS returns no rows rather than errors.
  - Data-filled versions of those pages, taken with a service-role key on an older build, exist in `LEGACY/playwright-admin-audit-screenshots/`. Use them as hints only.
- **Full-page artifact:** on pages longer than the viewport, the fixed sidebar appears only in the first 900 px.

**Pages** (one row per file in `LEGACY/admin/src/pages/`, 19 files)

| # | Page file | Route | Admin file | State captured |
|---|---|---|---|---|
| — | (connection gate) `components/RequireConnection.tsx` | `#/` with no connection | `00-not-connected.png` | "Connect to Supabase" prompt |
| 1 | `admin/src/pages/Dashboard.tsx` | `#/` | `01-dashboard.png` | Real counts for products/brands/companies and data health. Scans, receipts, users and submissions are 0 (RLS). |
| 2 | `admin/src/pages/Products.tsx` | `#/products` | `02-products.png` | Real: 13 products, filter chips, 12 "no brand". |
| 3 | `admin/src/pages/ProductEditor.tsx` | `#/products/new`, `#/products/:id` | `03-product-editor-new.png`, `04-product-editor-existing.png` (KitKat) | Quick fill bar, identity and ownership, features, supply-chain steps, QR. Not saved. |
| 4 | `admin/src/pages/Brands.tsx` | `#/brands` | `05-brands.png` | Real: 49 brands with owners. Bulk link and merge not opened. |
| 5 | `admin/src/pages/Companies.tsx` | `#/companies` | `06-companies.png` | Real: 11 companies. |
| 6 | `admin/src/pages/CompanyEditor.tsx` | `#/companies/new`, `#/companies/:id` | `07-company-editor-new.png`, `08-company-editor-existing.png` (Nestlé) | Wikipedia search, basics, category scores, certifications, boycotts, controversies, owned brands. Not saved. |
| 7 | `admin/src/pages/ReceiptLab.tsx` | `#/receipts` | `09-receipt-lab.png` | Default "Parser test bench" tab (drop zone, Run parser disabled). The "Unmatched queue" tab was not opened; it would be empty under RLS. No image was parsed, since that would call the paid edge function. |
| 8 | `admin/src/pages/Submissions.tsx` | `#/submissions` | `10-submissions.png` | Empty inbox (RLS; 6 real rows exist). |
| 9 | `admin/src/pages/Stories.tsx` | `#/stories` | `11-stories.png` | Real: 6 stories with "No body" flags. |
| 10 | `admin/src/pages/QrCodes.tsx` | `#/qr-codes` | `12-qr-codes.png` | Real: QR per product barcode. |
| 11 | `admin/src/pages/Activity.tsx` | `#/activity` | `13-activity.png` | Empty (RLS on scans, receipts and profiles). |
| 12 | `admin/src/pages/Settings.tsx` | `#/settings` | `14-settings.png` | Connection card shows "Current key type: anon"; the AI pipeline fields are empty (app_settings unreadable). |
| 13 | `admin/src/pages/catalog/Overview.tsx` | `#/catalog` | `15-catalog-overview.png` | All zeros (RLS; 96 real products exist). |
| 14 | `admin/src/pages/catalog/Retailers.tsx` | `#/catalog/retailers` | `16-catalog-retailers.png` | Empty (RLS). |
| 15 | `admin/src/pages/catalog/Stores.tsx` | `#/catalog/stores` | `17-catalog-stores.png` | Empty (RLS). |
| 16 | `admin/src/pages/catalog/Categories.tsx` | `#/catalog/categories` | `18-catalog-categories.png` | Empty (RLS). |
| 17 | `admin/src/pages/catalog/Jobs.tsx` | `#/catalog/jobs` | `19-catalog-jobs.png` | Empty (RLS). |
| 18 | `admin/src/pages/catalog/JobDetails.tsx` | `#/catalog/jobs/:id` | `20-catalog-job-details.png` | "Job not found" (no readable job id with anon). |
| 19 | `admin/src/pages/catalog/ProductExplorer.tsx` | `#/catalog/products` | `21-catalog-product-explorer.png` | "Select a store" with no stores listed (RLS). |

**Console (admin):** the only error is `favicon.ico` 404 (the admin has no favicon). There are 21 warnings, all the React Router v7 future-flag notice (`v7_startTransition`), one per page load. No request errors: RLS-filtered selects return 200 with empty arrays.

## Console (web)

Across the whole session, the only console **error** was:

```
Failed to load resource: 404  …/rest/v1/rpc/check_content_freshness
[sync] freshness check failed: Could not find the function public.check_content_freshness(since_ts) in the schema cache
```

It fires once per page load. This is the RPC signature mismatch documented in `docs/legacy/SPEC.md` (sync-service).

Warnings (react-native-web deprecations, harmless for the baseline):
- `"shadow*" style props are deprecated. Use "boxShadow".`
- `props.pointerEvents is deprecated. Use style.pointerEvents`

## Older reference screenshots (not baselines)

`LEGACY/argent-audit-screenshots/` (47) and `LEGACY/playwright-admin-audit-screenshots/` (26) come from earlier audits. Some show states that weren't captured here (populated receipt results, sign-up errors, offline states). They predate later fixes, so use them only as hints, not as targets.
