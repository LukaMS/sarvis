# Baseline screenshots

Visual targets for the rebuild: what the legacy app ("Conscious Curator") looks like today. New screens are compared against these (CLAUDE.md › Verifying your work), and the look should match unless `docs/PLAN.md` says otherwise.

| Folder | Contents | Task |
|---|---|---|
| `web/` | User app on web, 390 × 844 viewport | P0.6 (done 2026-10-26) |
| `android/` | User app on the Android emulator (Expo Go) | P0.7 |
| `admin/` | Admin portal, 1440 × 900 | P0.8 |

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

Every route file in `SPEC.md` › User app: screens has a row. Web files are in `web/`.

| # | Screen | Route file | Web file(s) | Android file | Notes |
|---|---|---|---|---|---|
| 1 | Root layout | `src/app/_layout.tsx` | — (visible as stack headers on every detail screen, e.g. `13-product.png`) | P0.7 | Shell only. The splash/auth-loading spinner shows for under a second and was not captured. |
| 2 | Tab layout | `src/app/(tabs)/_layout.tsx` | — (tab bar visible in `03`, `05`, `07`, `10`) | P0.7 | Floating white tab bar, top radius 24. |
| 3 | Auth — sign in | `src/app/auth.tsx` | `01-auth-sign-in.png` | P0.7 | Email/password only (Google, Apple and guest flags are off). |
| 4 | Auth — sign up | `src/app/auth.tsx` | `02-auth-sign-up.png` | P0.7 | Mode toggle only. **Not captured: "Check your inbox" state** (needs a real sign-up = write). |
| 5 | Home (Impact) | `src/app/(tabs)/index.tsx` | `03-home.png`, `04-home-scrolled.png` | P0.7 | Spotlight = Bolthouse Farms (first `Good` company). Featured = Danone story. **Not captured:** empty-scans card (the account has scans), error state. |
| 6 | Scan | `src/app/(tabs)/scan.tsx` | `05-scan.png`, `06-scan-scrolled.png` | P0.7 | **Not captured on web:** the camera modal. On web, tapping Scan Barcode does nothing visible: no camera permission in this browser, and the denial `Alert.alert` is a no-op on react-native-web, so it's a silent dead end. Also not captured: the scan result card and not-found alerts (need a real scan = write). Android should capture the camera (P0.7). |
| 7 | Search | `src/app/(tabs)/search.tsx` | `07-search-empty.png`, `08-search-results.png` (`?q=a`), `09-search-no-results.png` (`?q=zzqx`) | P0.7 | **Not captured:** "Thanks — added to review queue" state (needs a submission = write). |
| 8 | History | `src/app/(tabs)/history.tsx` | `10-history.png`, `11-history-barcode-filter.png` | P0.7 | Loads slowly (about 3 s spinner on a direct load). **Not captured:** empty state (the account has history). |
| 9 | Product detail | `src/app/product/[id].tsx` | `13-product.png`, `14-product-scrolled.png` (Alpro Oat Milk), `15-product-alternatives.png` (KitKat, with Better alternatives), `32-product-not-found.png` | P0.7 | |
| 10 | Company detail | `src/app/company/[id].tsx` | `16-company.png`, `17-company-mid.png`, `18-company-bottom.png` (Nestlé: controversies, boycotts, "Source not yet linked"), `19-company-sparse.png` (Bolthouse Farms: sparse-profile notice) | P0.7 | |
| 11 | Story detail | `src/app/story/[id].tsx` | `21-story.png` | P0.7 | All legacy stories have no body, so "Full story coming soon" shows. |
| 12 | Stories list | `src/app/stories.tsx` | `20-stories.png` | P0.7 | |
| 13 | Receipt scan | `src/app/receipt-scan.tsx` | `22-receipt-scan.png` | P0.7 | The photo picker and "Match items" were **not run** (both save a receipt = write). The placeholder shows real catalogue product names. |
| 14 | Receipt results | `src/app/receipt-results.tsx` | `24-receipt-results-empty.png` | P0.7 | Empty state only (results live in memory after a scan). **Not captured: populated results** (needs a scan = write). The populated layout can be seen in `LEGACY/argent-audit-screenshots/issue-critical-010-receipt-matcher-0-of-4-known-brands.png` (older build). |
| 15 | Receipt detail | `src/app/receipt/[id].tsx` | `12-receipt-detail.png` | P0.7 | An existing saved receipt (1 matched item, 3 "Not in database"). |
| 16 | Profile (modal) | `src/app/profile.tsx` | `25-profile.png` | P0.7 | Redacted name. On web the modal presentation renders as a normal page. |
| 17 | Settings | `src/app/settings.tsx` | `26-settings.png`, `27-settings-account.png`, `28-settings-danger.png` | P0.7 | Redacted name and email. Nothing saved. **Not captured:** guest-account variant (guest is disabled). |
| 18 | Privacy | `src/app/privacy.tsx` | `29-privacy.png`, `29b-privacy-controls.png` | P0.7 | |
| 19 | Help & Support | `src/app/help.tsx` | `30-help.png` | P0.7 | First FAQ expanded. |
| 20 | About | `src/app/about.tsx` | `31-about.png`, `31b-about-legal.png` | P0.7 | |

Rows 3/4 share `auth.tsx`, so all 19 route files are covered: 17 with screenshots, plus the 2 layout files shown through other screens.

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
