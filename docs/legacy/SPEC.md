# Legacy app specification

What the legacy app ("Conscious Curator", repo `MobileDev/Ethical-App`) does, written from its source code on 2026-10-26. This is the functional reference for the rebuild; it describes legacy behaviour, including bugs, and doesn't decide what to keep.

- **Part 1 (P0.3):** user app screens, flows, services, offline cache. *(this file, below)*
- **Part 2 (P0.4):** edge functions, AI prompts, RPCs, RLS, admin portal, catalog-worker pointer. *(after the user-app sections)*

Related: [`SCHEMA.md`](SCHEMA.md) (database), `THEME.md` (visual language, P0.5), `docs/baseline/` (screenshots, P0.6–P0.8).

Paths below are relative to `LEGACY/` = `C:/Users/lukam/Coding Projects/MobileDev/Ethical-App`.

---

## User app: overview

**Stack:** Expo SDK 54, Expo Router 6 (typed routes, React Compiler on), React Native 0.81, React 19.1, supabase-js 2, Reanimated 4, `@expo/vector-icons` (MaterialCommunityIcons; Ionicons on the auth screen only), `expo-camera` (barcodes), `expo-image-picker` (receipt photos), `expo-haptics`, `date-fns`, AsyncStorage. URL scheme `ethicalapp`, Android package `com.lukams.EthicalApp`. Web output is `static`.

**Config** (`src/constants/config.ts`), all overridable with `EXPO_PUBLIC_*` env vars (the legacy repo has no `.env`, only `.env.example`, so the defaults apply):

| Setting | Default | Notes |
|---|---|---|
| `SupabaseConfig.url` / `anonKey` | legacy project URL and anon key, hard-coded | Anon key is public by design. |
| `AuthProviders.google` / `apple` / `guest` | all `false` | Buttons render only when true. Apple additionally requires iOS. |
| `PASSWORD_MIN_LENGTH` | 8 | Client-side check on sign-up, upgrade and password change. |
| `LegalLinks.terms` / `privacy` / `accountDeletion` | `https://conscious-curator.app/...` | Opened in the browser. `accountDeletion` is never referenced by a screen. |
| `SUPPORT_EMAIL` | `support@conscious-curator.app` | Help screen mailto. |

**Supabase client** (`src/lib/supabase.ts`): one anon client. Session persisted in AsyncStorage on native, in the default (localStorage) on web. `autoRefreshToken`, `persistSession` on; `detectSessionInUrl` on web only.

### Navigation map

```
Root Stack (_layout.tsx) — AuthGate + ContentSync
├── auth                      (no header)
├── (tabs)                    (no header; custom tab bar)
│   ├── index   "Impact"      icon leaf
│   ├── scan    "Scan"        icon barcode-scan
│   ├── search  "Search"      icon magnify
│   └── history "History"     icon history
├── product/[id]    header "Product Details"
├── company/[id]    header "Company Details"
├── story/[id]      transparent header, white back button
├── receipt/[id]    header "Receipt Details"
├── receipt-scan    header "Scan Receipt"
├── receipt-results header "Receipt Results"
├── stories         header "Impact Stories"
├── profile         MODAL, header "Profile"
├── settings        header "Settings"
├── privacy         header "Privacy"
├── help            header "Help & Support"
└── about           header "About"
```

**Auth requirement:** every route except `auth` needs a session. `AuthGate` (root layout) redirects to `/auth` when there is no session, and from `/auth` to `/(tabs)` when there is one. There are no public, logged-out content screens. The anonymous ("guest") session counts as a session.

### Shared UI behaviour

- **Loading/error/empty:** screens using `useAsyncData` keep three states: a full-screen spinner while loading; `ErrorState` (title, message and Retry from `toFriendlyError`) on failure; `EmptyState` (icon, title, message) when there is no data. A failed *refresh* keeps the old data on screen. While in an error state, the hook retries automatically when the app returns to the foreground.
- **Route error boundary:** `product/[id]`, `company/[id]`, `story/[id]` and `receipt/[id]` export `ErrorBoundary = RouteErrorBoundary` (render crash → friendly error with retry).
- **Error copy:** all user-visible errors go through `src/lib/errors.ts`. Error kinds: offline, auth, permission, notFound, unknown. Known Supabase auth strings are mapped to plain-language titles and messages.
- **Grades:** `GradeBadge` hides or labels unrated grades (`isRatedGrade`: an empty string, `—` or `-` means unrated). `RatingPill` shows Good/Mixed/Poor. `ScoreRing` shows a 0–100 ring with its grade.
- **Brand name:** the user-visible brand is "Conscious Curator" throughout (header wordmark, share texts, alerts). The rebuild renames it to "Sarvis".

---

## User app: screens

One section per file under `src/app/` (19 files).

### Root layout — `src/app/_layout.tsx`

- **Purpose:** app shell. It wraps everything in `AuthProvider` and holds the splash screen until the stored session has been read (`isLoading`), showing a centred spinner (`AuthLoadingScreen`) meanwhile, so signed-in users never see the sign-in screen flash.
- **AuthGate:** see Auth requirement above.
- **ContentSync:** runs `syncStaleContent()` on mount and on every return to the foreground (see Offline cache). The call is effectively broken, see Known issues.
- **Theme:** custom light navigation theme from `M3Colors`. If the OS is in dark mode, React Navigation's stock `DarkTheme` is used for navigator chrome only; the screens themselves are always light.
- **Stack config:** headers per the navigation map; `profile` is presented as a modal.

### Tab layout — `src/app/(tabs)/_layout.tsx`

- Four tabs: Impact, Scan, Search, History (see map), each with a screen-reader label (e.g. "Scan a barcode or receipt").
- **Tab bar:** absolutely positioned, `surfaceContainerLowest` background, top border, 24 px top corner radii, upward shadow. Height is 62 px + bottom safe-area inset (fix for Android gesture navigation). Labels are 10 px, uppercase, letter-spaced; active colour `primary`, inactive `rgba(28,28,25,0.45)`.
- Screens pad their content by `96 + insets.bottom` so it clears the floating tab bar.

### Home ("Impact") — `src/app/(tabs)/index.tsx`

- **Purpose:** dashboard: greeting, company spotlight, featured story, recent scans, story list.
- **Entry:** default tab after sign-in; "Done" flows return to tabs.
- **Data read:**
  - `getSpotlightCompany()`: the first company with `overall_ethical_rating = 'Good'`, else the alphabetically first company, hydrated with its scores, certifications, boycotts and controversies. Cached.
  - `getFeaturedStory()`: prefers a story that is featured and has a body; then any story with a body; then any featured story; then the newest. Cached.
  - `getStories()`: all `impact_stories` with their company, newest first. Cached.
  - `getUserProfile()`: for the greeting; failure is tolerated (`null`).
  - `getRecentScans()`: the 5 latest `scan_history` rows with their company, reloaded on every focus. Separate loading/error state, so a failure is never shown as "no scans".
- **Layout:**
  - Wordmark "Conscious Curator" with a profile avatar button → `/profile`.
  - Hero "Hello, {first name | 'Curator'}".
  - "Company Spotlight": `SpotlightCompanyCard` → `/company/[id]`.
  - "Featured": `FeaturedStoryCard` → `/story/[id]`.
  - "Recent Scans": a horizontal `RecentScanCard` list with "See all" → History; or an empty card "Scan your first product" → Scan tab; or a compact `ErrorState`.
  - "Impact Stories": up to 4 non-featured `StoryCard`s; "See all" → `/stories`.
  - Sections fade in with staggered `FadeInDown`.
- **Opening a scan:** `product_id` → product; receipt scan → `getReceiptIdForScan` → `/receipt/[id]`; otherwise `company_id` → company.
- **Pull to refresh:** deletes the cache keys `spotlight_company`, `featured_story` and `impact_stories`, then refetches the content and the scans.
- **States:** full-screen spinner; full-screen `ErrorState` if the content load fails; sections are hidden when their data is null or empty.

### Scan — `src/app/(tabs)/scan.tsx`

- **Purpose:** landing page for both scan types, plus the barcode camera.
- **Data read:** `getRecentScans()` on focus (top 3); `lookupBarcodeSmart(code)` on scan.
- **Data written:** `recordScan(product, 'barcode'|'qr')` → `scan_history` insert (fire-and-forget); `requestProductAddition` → `community_submissions` insert.
- **Layout:**
  - Wordmark, then the hero "Discover Ethics" / "Search companies or scan to uncover transparency data."
  - `SearchBar` ("Search company or brand name..."); submit → `/(tabs)/search?q=…`.
  - Two "bento" cards: **Scan Barcode** (primary colour) opens the camera; **Scan Receipt** (secondary colour) → `/receipt-scan`.
  - "Recent Impact": up to 3 rows (icon, name, label, chip) with "See all" → History. The chip is based on the score: ≥ 70 "ETHICAL", < 50 "WARNING", otherwise "MIXED"; a dashed outline "NOT RATED" when there is no score. Empty: "No scans yet".
  - Educational card "The Power of Your Purchase" with a "Learn more" button → `/about`.
- **Camera modal:**
  - Full-screen `CameraView` (back camera). Barcode types: ean13, ean8, upc_a, upc_e, code128, code39, qr.
  - Overlay: close button, title "Scan Barcode", a 260 px reticle with white corners and an animated green laser line, and a hint text (or "Looking up product…" with a spinner).
  - A ref lock prevents duplicate scans; a medium haptic fires on detection.
- **Scan outcomes:**
  1. **Found** (in the DB, or auto-created by the `lookup-product` edge function): success haptic, record the scan, close the camera, show a `ScanResultCard` overlay (dimmed backdrop). Tapping the card → `/product/[id]`; it can be dismissed.
  2. **Known to Open Food Facts but not linkable:** warning haptic. Alert "Not rated yet" ("We recognised "{name}" by {brand}…") with actions **Request addition** (submission with barcode, brand, category, `source: barcode_scan`), **Try again**, **Close scanner**.
  3. **Unknown:** alert "Product not found" ("Nothing in our database matches barcode {code}…") with the same three actions (`source: barcode_scan_unknown`, name "Unknown product ({code})").
  4. **Error:** alert "Scan failed" with a friendly message.
- **Permissions:** if camera permission is denied, an alert "Camera access needed" offers Not now, **Search by name** (→ Search) and **Open Settings**.
- **States:** no loading gate for the landing page; the recent-scans failure is silent (stays empty).

### Search — `src/app/(tabs)/search.tsx`

- **Purpose:** search products and companies by name, brand or barcode.
- **Entry:** Search tab; `?q=` hand-off from the Scan search bar and from company brand chips (it then runs immediately with filter All).
- **Data read:** `searchAll(query, filter)` → RPC `search_all(p_query, p_filter)`. Max 20 products + 20 companies, using ILIKE on product name/brand/company name, exact barcode, company name and brand names. Not cached.
- **Data written:**
  - Tapping a **product** result also calls `getProduct` + `recordScan(p, 'manual_search')`, so every product opened from search is logged as a scan in History.
  - "Request addition" → `community_submissions` (`source: search_no_results`).
- **Behaviour:**
  - Input is debounced at 250 ms; a request-id guard discards stale responses.
  - Filter chips: All / Products / Companies (a filter change re-runs immediately).
  - Result rows (`SearchResultItem`) show type, name, subtitle ("brand · company" or category for products; HQ for companies) and a grade (products) or rating (companies). Product → `/product/[id]`; company → `/company/[id]`.
- **States:**
  - **Empty query:** EmptyState "Search for products & companies".
  - **Searching:** spinner.
  - **Error:** ErrorState with retry.
  - **No results:** EmptyState "No results found / Nothing matches "{q}" yet…" plus a **Request "{q}"** button. After sending, the button becomes "Thanks — we've added it to our review queue." (remembered per query for the session).

### History — `src/app/(tabs)/history.tsx`

- **Purpose:** the full scan journal.
- **Data read:** `getScanHistory()`: all of the user's `scan_history` rows with their company, newest first. Unpaginated and not cached; reloads on every focus and on pull-to-refresh.
- **Layout:**
  - Kicker "JOURNAL" and the title "History of / Scanned Goods".
  - `HistoryFilterBar`: All / Barcode / Receipt ("Barcode" = everything that isn't a receipt, including searches).
  - A `SectionList` grouped by date label ("Today", "Yesterday", "MMM d"); section headers are uppercase with a divider line.
  - `HistoryListItem` shows the source label (Receipt / Search / Barcode), name, label, and grade/score.
- **Tap:** receipt → `getReceiptIdForScan` → `/receipt/[id]` (does nothing if not found); product → product; else company.
- **States:** spinner; ErrorState (never shown as an empty list); EmptyState "No scans yet" or "No {filter} scans yet".
- **Not supported:** deleting individual scans, spending totals, store filters (the legacy app does not track spending beyond receipt totals).

### Auth — `src/app/auth.tsx`

- **Purpose:** sign in, sign up, password reset, optional OAuth and guest.
- **Modes:** sign-in (default) ↔ sign-up toggle. Sign-up adds an optional "Display name" field.
- **Fields:** email (validated by `isValidEmail`), password with a show/hide toggle. Sign-up shows the hint "At least 8 characters."
- **Actions:**
  - **Sign In / Create Account:** `signInWithEmail` / `signUpWithEmail` (display name defaults to the email local part) → `router.replace('/(tabs)')`.
  - If sign-up returns no session (email confirmation on), a **"Check your inbox"** screen shows the address, with **Resend email** (`resendConfirmationEmail`), "Back to sign in" and "Use a different email address".
  - **Forgot password?** (sign-in only): requires a valid email in the field, then `resetPassword(email)` → info message "Password reset link sent…". The redirect goes to `ethicalapp://`, but there is **no in-app screen to set the new password**.
  - **Continue with Google / Apple:** only when enabled by config flags (off by default). Native opens an auth session in the browser and parses the tokens from the callback; web uses a redirect.
  - **Continue as Guest:** only when `AuthProviders.guest` is on (default off) → `signInAnonymously()`.
- **States:** inline error (red) and info (primary) banners, cleared on any edit or mode switch; a spinner inside the primary button while loading; `KeyboardAvoidingView`.
- **Profile creation:** server-side via the `on_auth_user_created` trigger (`display_name` from metadata, then `full_name`, then `'User'`).

### Product detail — `src/app/product/[id].tsx`

- **Entry:** search results, scan result card, home/scan recent scans, history, receipt results/detail rows, alternatives.
- **Data read:** `getProduct(id)` (product + `company:companies(*)`, cached), then in parallel `getProductFeatures` (cached), `getTransparencySteps` (cached) and `getAlternatives(product)`. Alternatives: up to 3 products in the **same `category` string** with a higher `ethical_score`, highest first; not cached.
- **Layout:**
  - Hero: `ScoreRing` (100 px), name, category, `GradeBadge` (lg), and a share button. The share text is "{name} on Conscious Curator — ethical score {n}/100 ({grade})", with the score part only if rated.
  - **About** (description).
  - **Certifications:** chips from `products.certifications[]`.
  - **Key Features:** grid of icon (MaterialCommunityIcons name from the DB), title and description.
  - **Supply Chain:** numbered steps.
  - **Better alternatives:** rows with a small ScoreRing, name, company, and a "+Δ" score delta → that product.
  - **Company:** a card with an initial-letter logo, name, HQ and RatingPill → company.
- **States:** spinner; ErrorState; EmptyState "Product not found".

### Company detail — `src/app/company/[id].tsx`

- **Entry:** product company card, search results, spotlight, story related company, receipt brand matches, scans with only a `company_id`.
- **Data read:** `getCompany(id)`: the company row plus 4 queries (ethical_scores, certifications, boycotts, controversies). Cached.
- **Layout:**
  - Header: initial-letter logo, name, legal name, RatingPill, share ("{name} is rated {rating} on Conscious Curator.").
  - **Quick facts:** HQ, Founded, CEO, Revenue, Ticker; empty facts are omitted.
  - **Sparse-profile notice:** shown when there are no facts and no description ("We're still building out this company's profile…").
  - **About**.
  - **Ethical Breakdown:**
    - One card per category, tinted by rating (Good → `primaryFixed`, Mixed → `tertiaryFixed`, Poor → `errorContainer`), with notes.
    - Footer: "The overall rating summarises these N categories. A weak category is never hidden by a strong one."
    - If there are no scores: a "Category ratings … haven't been published yet" card.
  - **Certifications:** name, plus "Verified {date}" when present.
  - **Brands (N):** chips from `companies.brands[]`; tapping one searches for that brand.
  - **Controversies:** severity dot (critical = error, high = secondary, else outline), title, formatted date, description, and a source link or the text "Source not yet linked".
  - **Active Boycotts:** name, reason, and a source link or "Source not yet linked".
- **States:** spinner; ErrorState; EmptyState "Company not found".
- **Not shown:** parent company / ownership chain, products by this company, articles.

### Story detail — `src/app/story/[id].tsx`

- **Data read:** `getStory(id)` (story + company, cached).
- **Layout:**
  - Full-width cover image with a dark top gradient (keeps the white transparent-header back button legible).
  - Category pill, relative date ("3 days ago"), share button ("Read "{title}" on Conscious Curator — {subtitle}").
  - Title and subtitle.
  - The body as plain text. If there is no body, a "Full story coming soon" card stands in (true for all 6 legacy stories).
  - "Related Company" card with a RatingPill → company.
- **States:** spinner; ErrorState; EmptyState "Story not found".

### Stories list — `src/app/stories.tsx`

- **Data read:** `getStories()` (cached). Pull-to-refresh deletes `impact_stories` and refetches.
- **Layout:**
  - Kicker "EDITORIAL", title "Impact Stories", subtitle "Deep dives into the companies behind your shelf."
  - A featured hero card (prefers featured-with-body, else featured).
  - Then `StoryCard`s for the rest, with staggered fade-in.
- **States:** spinner; ErrorState; EmptyState "No stories yet".

### Receipt scan — `src/app/receipt-scan.tsx`

- **Purpose:** capture a receipt (photo or typed list) and run matching.
- **Entry:** the Scan tab's "Scan Receipt" card.
- **Layout:**
  - Hero: icon, "Scan a Receipt" and an explainer.
  - **Take a photo** (camera) and **Choose from library** cards.
  - Divider "or enter items manually", then a multiline input (placeholder: "One item per line, e.g." followed by 3 real product names from `getExampleProductNames(3)`, cached 24 h).
  - **Match items** button and a hint about the growing catalogue.
- **Photo path:**
  1. Request the camera or media-library permission. If denied: an alert with **Open Settings**.
  2. Pick the image with `base64: true, quality: 0.5`.
  3. Busy screen "Reading your receipt…" → `parseReceiptImage(base64)` → edge function `process-receipt`.
  4. If 0 items: alert "No items found".
  5. If the function is unreachable (`RECEIPT_FN_UNAVAILABLE`): alert "Photo scanning unavailable" pointing to manual entry.
  6. Other errors: alert "Receipt scan failed".
- **Manual path:** split the text by newline into `{name}` items; empty input → alert "Nothing to match".
- **Common tail (`goToResults`):**
  1. "Matching against the database…" → `matchReceiptItems`.
  2. "Saving to your history…" → `saveReceiptScan` (a failure is swallowed and the results show unsaved).
  3. Stash the result in memory with `setLastReceiptResult`, clear the input, push `/receipt-results`.
- **Data written:** `scan_history` + `receipt_scans` + `receipt_items` (on save). The image is not stored anywhere.

### Receipt results — `src/app/receipt-results.tsx`

- **Data read:** the in-memory `getLastReceiptResult()` only, with no DB fetch. A reload or deep link shows EmptyState "No receipt scanned".
- **Layout:**
  - Header: store name, title, and a summary ("3 rated · 2 matched by brand · 1 not found", non-zero parts only).
  - **Trip card:**
    - Trip Rating: the grade of the average score, or "Not rated".
    - Avg Score: the average of scored items only, or "—".
    - Total: the sum of priced items, or "—".
  - Explanatory note: either no trip rating, or "Based on N rated items. Brand matches … aren't included".
  - "Saved to your history" tick if saved.
  - **Rows**, three kinds:
    1. Exact product match: name, company · price, score, GradeBadge → product.
    2. Brand match (tinted card, tag icon): line text, "{brand} · {company}", company RatingPill → company.
    3. Not found: "Not in our database yet" with a **Request add** button. It inserts into `community_submissions` with price and matched company, then becomes a "Requested" chip with a success haptic.
  - Request note; **View saved receipt** → `/receipt/[id]` (if saved); **Done** → `router.replace('/(tabs)/scan')`.
- **No editing:** the user can't correct a match, remove a line, or change the store before or after saving.

### Receipt detail — `src/app/receipt/[id].tsx`

- **Entry:** History/Home/Scan receipt rows, and "View saved receipt".
- **Data read:** `getReceipt(id)` → `receipt_scans` + `items:receipt_items(*)`. Not cached.
- **Layout:**
  - Header: a store icon (or a receipt icon when the name is generic), the store name formatted by `formatStoreName`, Trip Rating GradeBadge, and a long date (en-US).
  - **Share Summary** only if something is rated. The message is built only from the data that exists: opening line, "item: grade" lines, and a count of unrated items.
  - Summary row: item count and total (or "No prices").
  - Item rows: name, price (if any), GradeBadge, notes (brand-match note "Company · Rating", or "Not in database"); rows are tappable (with a chevron) only when `product_id` is set.
- **States:** spinner; ErrorState; EmptyState "Receipt not found".

### Profile (modal) — `src/app/profile.tsx`

- **Entry:** the avatar button on Home.
- **Data read:** `getUserProfile()` (profile row + stats) and `getUserStats()`, reloaded on focus.
- **Layout:**
  - Initial-letter avatar, display name, and a badge pill ("Conscious Curator", or "Guest Curator" for anonymous users), bio, "Member since {Month YYYY}".
  - **Guest banner** (anonymous only) "Keep your history safe" → Settings.
  - **Stats grid:** Total Scans, Brands Avoided, Receipts, Avg Score.
  - **Menu:** Settings, Privacy, Help & Support, About.
  - **Sign Out** with a confirm alert; a guest gets a warning that their data is tied to the session.
- **States:** spinner; on failure, ErrorState plus a Sign Out button (so the user is never stuck).
- **Stats definitions** (client-side, `getUserStats`):
  - **totalScans:** count of `scan_history`.
  - **receiptsAnalyzed:** count of `receipt_scans`.
  - **ethicalScore:** the rounded mean of non-null scan scores.
  - **brandsAvoided:** the number of scans with score < 50 or grade in {C-, D+, D, D-, F}. This is *not* the DB view's definition (distinct companies graded D/F), and it counts poor scans, not avoided brands.

### Settings — `src/app/settings.tsx`

- **Data read:** `getUserProfile()` (prefills the form); `useAuth()` for the email and anonymous flag.
- **Sections:**
  - **Profile:**
    - Display name (max 40, required) and bio (max 140).
    - **Save profile** → `updateUserProfile` → `profiles` update.
  - **Account (guest):**
    - "You're browsing as a guest" card with email and password fields.
    - **Create account** → `upgradeAnonymousAccount` (`auth.updateUser`; same UUID, history kept); the user must then confirm via email.
  - **Account (signed in):**
    - "Signed in as {email}".
    - **Change email:** `auth.updateUser({email})`; takes effect after the confirmation link.
    - **Change password:** min 8 → `auth.updateUser({password})`.
  - **Data:** **Refresh cached content** → `cacheClearAll()` (every AsyncStorage key except the `sb-*` auth keys).
  - **Danger zone** (not for guests): **Delete my account**.
    - A two-step confirmation, then `deleteAccount()` → RPC `delete_own_account`, then sign out and clear the cache.
    - **Broken against the live DB:** the function was never applied (see SCHEMA.md drift), so it errors with a friendly message.
- **Feedback:** all outcomes go through `Alert`s; buttons show spinners and disable while busy.

### Privacy — `src/app/privacy.tsx`

- **Content:** four cards: What we store, Receipt photos (never stored), No selling/no ads, Security (RLS).
- **Data Controls:**
  - **Delete my scan history & receipts**: a confirm alert → `deleteAllUserActivity()`. It deletes `receipt_scans` (cascading to `receipt_items`), then `scan_history`, for this user. The account is kept.
  - "Delete my whole account" → Settings.
  - "Read the full Privacy Policy" → `LegalLinks.privacy` (external).
- `community_submissions` and the profile are *not* deleted by the activity wipe.

### Help & Support — `src/app/help.tsx`

- Static FAQ accordion (`LayoutAnimation`, one item open at a time). Nine questions: score calculation, "Not rated", barcode not found, how receipt scanning works, why no trip rating, receipt photo storage, guest use (hidden unless `AuthProviders.guest`), suggesting products, account changes and deletion.
- **Email support** → `mailto:{SUPPORT_EMAIL}?subject=Conscious Curator Support`.
- No data access.

### About — `src/app/about.tsx`

- Logo circle, app name, version pill (`expoConfig.version`), tagline "Every scan reveals the story behind the shelf."
- **Our Mission** paragraph.
- Three value cards: Transparency first, Balanced by design, Community powered.
- **Legal:** Terms of Service and Privacy Policy (external links).
- Credits: "Ratings draw on public certifications, NGO reports and news coverage. Product data enriched by Open Food Facts." Then "© {year} Conscious Curator".
- No data access.

---

## User app: flows

### F1. Sign-up and sign-in

1. Cold start: the splash screen is held while `AuthProvider` reads the stored session, then spinner → AuthGate.
2. No session → `/auth` (sign-in mode).
3. **Sign up:** enter display name (optional), email and password (≥ 8) → `auth.signUp` with `display_name` metadata and redirect `ethicalapp://`.
   - **Email confirmation on:** "Check your inbox" screen, resend available; the user later signs in normally.
   - **Confirmation off:** session created → `/(tabs)`.
   - Either way, the server trigger creates the `profiles` row.
4. **Sign in:** `signInWithPassword` → `/(tabs)`. Errors are mapped (wrong credentials, unconfirmed email, rate limit, …).
5. **Forgot password:** sends a reset email only; there is no deep-link handler or reset screen.
6. **Providers actually available in legacy builds:** email/password only. Google, Apple and Guest exist in code behind flags that default off.
7. **Sign out** (Profile): confirm → `auth.signOut` → AuthGate → `/auth`.

### F2. Barcode scan

1. Scan tab → **Scan Barcode** → camera permission (or a fallback alert) → camera modal.
2. On detection: lock, haptic, `lookupBarcodeSmart(code)`:
   1. Exact `products.barcode = code` (no normalization, so UPC-A vs EAN-13 with a leading 0 don't match here).
   2. On a miss, edge function `lookup-product`: Open Food Facts lookup. If OFF's brand resolves to a tracked company, it auto-creates a draft product (row `source = 'auto_barcode'`; the response says `source: "auto_created"`) and returns it; else it returns the OFF info. See Edge functions below.
3. **Found** → record the scan → result card → product detail.
4. **Not found / OFF-only** → alert with Request addition / Try again / Close.

### F3. Receipt scan → results → save

1. Scan tab → **Scan Receipt** → `/receipt-scan`.
2. **Photo:** the image is sent as base64 to `process-receipt`. The function (v2) uses a vision model to extract the store and items (name, price, quantity, raw, brand) and matches each item server-side against `products` (aliases → exact → trigram), returning `product_id`, `confidence` and `match_type`.
3. **Manual:** one line per item.
4. `matchReceiptItems(items, serverMatched)`, three tiers:
   1. Server-matched `product_id`s resolve against the full products list (`getProducts()`, the whole table, cached).
   2. Otherwise (manual/v1) the RPC `match_receipt_items(p_queries, p_limit=1)`, accepted at confidence ≥ 0.45. If the RPC errors, a client-side token-overlap fuzzy match is used instead.
   3. Still unmatched → **brand match**:
      - Build a brand → company index from `companies.brands[]` and company names (`getBrandIndex()`, loading all companies).
      - Look for the brand phrase in the line, or a distinctive word (length ≥ 6, not generic, owned by exactly one company).
      - The longest brand wins.
5. **Auto-save** (if signed in): a `scan_history` row (`scan_type = 'receipt'`, product_name = store or "Receipt", score = trip average, grade = trip grade, label "N items"); a `receipt_scans` row; and one `receipt_items` row per line (`product_id` or null, name, price, grade, and notes "Company · Rating" / "Not in database").
6. `/receipt-results` from memory; the user can request unmatched items. **Done** → Scan tab.
7. The saved receipt is reachable later from History → `/receipt/[id]`.

**Not in legacy:** confirming or correcting matches before saving, editing quantities, store selection or matching to a store record, de-duplicating repeat scans of the same receipt, storing the image, and feeding prices into a price catalogue.

### F4. Search

Search tab (or a `?q=` hand-off) → debounced `search_all` RPC → product/company rows → detail screens. Opening a product logs a `manual_search` scan. With no results, the user can submit a request.

### F5. History and filters

History tab → full list grouped by day → filters All / Barcode (= all non-receipt) / Receipt → detail screens. There is no search, deletion, pagination or spending view. Stats appear only on the Profile modal.

### F6. Stories

Home "Featured" / "Impact Stories" or the `/stories` list → `/story/[id]` → related company. No body text exists in the data, so every story shows "Full story coming soon".

### F7. Profile and settings

Home avatar → Profile modal (stats, menu) → Settings: edit name and bio; change email or password; guest upgrade; clear cache; delete account (broken). Also reachable: Privacy (wipe activity), Help (FAQ, mailto), About (legal links).

### F8. Account deletion

Settings → Delete my account → two confirmations → RPC `delete_own_account`. The function is defined in the legacy repo but **not present in the live DB**, so the call fails with "Something went wrong". A web deletion URL (`LegalLinks.accountDeletion`) is configured but not linked from any screen. The partial alternative is Privacy → delete scan history and receipts.

### F9. Community submissions

Three entry points insert `community_submissions(submission_type='product', status='pending', data={name, source, …})`:
- barcode not found (`barcode_scan` / `barcode_scan_unknown`, with the barcode);
- search with no results (`search_no_results`);
- an unmatched receipt line (`receipt_scan`, with price and matched company).

Users get only a local acknowledgement; there is no screen listing their submissions or their review status.

---

## User app: services (`src/lib/`)

Every exported function, by module.

### `auth-service.ts`

| Function | What it does |
|---|---|
| `isValidEmail(email)` | Permissive regex check before the network call. |
| `signUpWithEmail(email, password, displayName?)` | `auth.signUp` with `display_name` metadata and `emailRedirectTo: ethicalapp://`. Returns `{needsEmailConfirmation}`. |
| `resendConfirmationEmail(email)` | `auth.resend({type:'signup'})`. |
| `signInWithEmail(email, password)` | `auth.signInWithPassword`. |
| `signInWithGoogle()` / `signInWithApple()` | `signInWithOAuth`. Native: `WebBrowser.openAuthSessionAsync`, then parse `access_token`/`refresh_token` from the callback and `setSession`. Web: redirect. |
| `resetPassword(email)` | `auth.resetPasswordForEmail` with redirect `ethicalapp://`. |
| `signInAnonymously()` | `auth.signInAnonymously` (guest). |
| `upgradeAnonymousAccount(email, password)` | `auth.updateUser({email, password})`, keeping the same UUID. |
| `updateEmail(newEmail)` | `auth.updateUser({email})` with redirect. |
| `updatePassword(newPassword)` | `auth.updateUser({password})`. |
| `deleteAccount()` | RPC `delete_own_account` (missing in the live DB), then `signOut`. |
| `signOut()` | `auth.signOut`. |
| `getSession()` / `getUser()` | Thin wrappers. **Unused** (screens use `useAuth()` or call supabase directly). |

### `data-service.ts`

| Function | Reads/writes | Cached |
|---|---|---|
| `getCompanies()` | All companies ordered by name, each hydrated with 4 relation queries (N+1). Used only by `getBrandIndex`. | `companies` |
| `getCompany(id)` | One company + 4 relation queries. | `company:{id}` |
| `getBrandIndex()` | Builds a Map of lowercase brand → Company from `companies.brands[]` and company names. | via `companies` |
| `getProducts()` | All products + their company. Used only by receipt matching. | `products` |
| `getProduct(id)` | One product + its company. | `product:{id}` |
| `getAlternatives(product, limit=3)` | Same `category`, higher `ethical_score`, descending. | no |
| `getExampleProductNames(limit=3)` | Any N product names, for the receipt placeholder. | `example_products:{n}`, 24 h |
| `getProductFeatures(productId)` | `product_features` ordered by `sort_order`. | `product_features:{id}` |
| `getTransparencySteps(productId)` | `transparency_steps` ordered by `step_number`. | `transparency_steps:{id}` |
| `lookupByBarcode(barcode)` | Exact `products.barcode` match. Internal (used by `lookupBarcodeSmart`). | no |
| `lookupBarcodeSmart(barcode)` | Local lookup, then edge function `lookup-product`. Returns `{product?, autoCreated, external}`. Any function error → treated as not found. | no |
| `recordScan(product, scanType)` | Inserts into `scan_history` (product, company, name, score, grade, company name as label). No-op if signed out. | — |
| `getRecentScans()` | The last 5 `scan_history` rows + company. | no |
| `getScanHistory()` | All `scan_history` rows + company. | no |
| `getReceiptIdForScan(scanId)` | `receipt_scans.scan_history_id = scanId`, with a fallback via `receipt_items`. | no |
| `getReceipt(id)` | `receipt_scans` + `receipt_items`. | no |
| `getStories()` | All `impact_stories` + company, newest first. | `impact_stories` |
| `getFeaturedStory()` | Selection order: featured with body → any with body → featured → newest. | `featured_story` |
| `getStory(id)` | One story + company. | `story:{id}` |
| `getSpotlightCompany()` | The first `Good` company, else the first company. | `spotlight_company` |
| `getUserProfile()` | `profiles` row + `getUserStats()`. Throws if signed out. | no |
| `updateUserProfile({display_name, bio})` | `profiles` update for `auth.uid()`. | — |
| `deleteAllUserActivity()` | Deletes the user's `receipt_scans` (cascades to items), then `scan_history`. | — |
| `getUserStats()` | Client-side counts (see Profile). | no |
| `searchAll(query, filter)` | RPC `search_all`. | no |

### `receipt-service.ts`

| Function | What it does |
|---|---|
| `parseReceiptImage(base64)` | Invokes `process-receipt` with `{image_base64}`. Relay, not-found or network errors → `RECEIPT_FN_UNAVAILABLE`; a body `{error}` → throw. Returns `{store_name, items, serverMatched}`, where `serverMatched` means at least one item carries `product_id`. |
| `matchReceiptItems(items, serverMatched)` | The three-tier matcher (F3 step 4). Threshold 0.45, mirroring the server default. |
| `summarizeReceipt(items)` | Trip rating = `scoreToGrade(avg)` over scored products only; total = sum of priced lines; counts of rated, brand-matched and unknown lines. |
| `saveReceiptScan(items, store?)` | Inserts into `scan_history`, `receipt_scans` and `receipt_items` (F3 step 5). Three separate inserts, no transaction. Returns the receipt id or `undefined` if signed out. |
| `requestProductAddition(name, extra)` | Inserts into `community_submissions`. Throws if signed out. |
| `setLastReceiptResult(result)` / `getLastReceiptResult()` | Module-level in-memory hand-off between `receipt-scan` and `receipt-results`. |
| `RECEIPT_FN_UNAVAILABLE` (const) | Sentinel error message. |

### `cache-service.ts`

| Function | What it does |
|---|---|
| `cacheSet(key, value)` | JSON in AsyncStorage plus a `{key}:_ts` timestamp. Null/undefined are skipped. |
| `cacheGet(key)` | Parse, or `undefined`. |
| `cacheTimestamp(key)` | ms timestamp, or `undefined`. |
| `cacheIsStale(key, maxAgeMs)` | Missing or older than max age. |
| `cacheDelete(key)` | Removes the value and its timestamp. |
| `cacheClearAll()` | Removes every key not starting with `sb-` (keeps the auth session). |

### `sync-service.ts`

| Function | What it does |
|---|---|
| `getStaleTablesSinceLastSync()` | If any of `companies`, `products` or `impact_stories` is older than 1 h, calls RPC `check_content_freshness({since_ts})` and expects an array of `{table_name, last_modified}`. **Mismatch:** the live function takes `p_companies_since`, `p_products_since` and `p_stories_since` and returns an object of booleans, so the call errors (silently swallowed) and always returns `[]`. |
| `syncStaleContent()` | Evicts cache keys for the tables flagged stale: companies → `companies`, `spotlight_company`; products → `products`; impact_stories → `impact_stories`, `featured_story`. Because of the mismatch it never evicts anything. |

### Other modules

- `errors.ts`: `toFriendlyError`, `toUserMessage`, `isOfflineError` (see Shared UI behaviour).
- `score-utils.ts`:
  - **Colours:** `gradeToColor`, `ratingToColor`, `ratingToBgColor`.
  - **Grades:** `scoreToGrade` (≥ 95 A+, 90 A, 85 A-, 80 B+, 75 B, 70 B-, 60 C+, 50 C, 40 C-, 30 D+, 20 D, 10 D-, else F).
  - **Dates:** `formatScanDate`, `formatRelativeTime`, `formatDateText`.
  - **Text:** `toTitleCase`, `formatCategory`, `formatStoreName` (title-cases ALL-CAPS store names except ≤ 4-letter acronyms).
- `supabase.ts`: the client (see Overview).
- `providers/auth-provider.tsx`: `AuthProvider` / `useAuth()` → `{session, user, isLoading, isAnonymous}`, from `getSession` + `onAuthStateChange`.
- `hooks/useAsyncData.ts`: the three-state fetch hook (see Shared UI behaviour).

---

## Offline cache and freshness

- **Strategy:** `cachedQuery(key, fetcher, maxAge = 1 h)` is stale-while-revalidate.
  - Fresh cache → return it.
  - Stale cache → return it immediately and refetch in the background.
  - No cache → fetch, store, return.
- **Cached:** companies, single companies, products, single products, product features, transparency steps, stories, the featured story, single stories, the spotlight company, example product names (24 h).
- **Not cached:** scans, history, receipts, search, profile, stats, alternatives, barcode lookups. These need the network, and fail into ErrorState when offline.
- **Invalidation:**
  - The TTL (1 h).
  - Pull-to-refresh on Home (spotlight, featured, stories) and on Stories (stories).
  - Settings → Refresh cached content (everything except auth).
  - The foreground freshness check, which is non-functional (see `sync-service`).
- **Offline copy:** the offline error says "Content you've already viewed is still available", which is true only for the cached reads above.
- **No offline writes:** scans and receipts made offline fail. `recordScan` is fire-and-forget, so an offline barcode scan silently isn't logged.

---

## Known issues and gaps (input for the rebuild)

1. **Freshness RPC mismatch** (`sync-service` vs live `check_content_freshness`): cache invalidation on foreground never works.
2. **Account deletion is broken:** `delete_own_account` was never applied to the live DB.
3. **No password-reset completion screen:** the reset email's redirect goes nowhere useful.
4. **Search logs scans:** opening a product from search writes a `manual_search` row to `scan_history`, inflating History and stats.
5. **Receipts save before review:** there is no match confirmation or correction step. Each tap of "Match items" creates a new receipt.
6. **Receipt results live in memory only:** a web refresh or deep link to `/receipt-results` shows an empty state.
7. **Scaling hazards:**
   - Receipt matching loads the entire `products` table, and the brand index loads every company with 4 queries each (N+1).
   - History is unpaginated.
   - These are fine at 13 products and 11 companies; they break at catalogue scale.
8. **Barcode lookup is exact-string:** no GTIN normalization (the DB `barcodes_match` helper is used only in receipt matching).
9. **Alternatives use exact `category` string equality** and ignore price, size and store.
10. **Brands come from `companies.brands[]`** (a denormalised text array), not the `brands` table. The ownership chain (`parent_company_id`) is never shown.
11. **Stats semantics:** "Brands Avoided" counts poor scans, not brands; it differs from the DB's `user_stats_view` / `get_user_stats` definitions.
12. **Three receipt inserts with no transaction:** a partial failure leaves orphan `scan_history` rows.
13. **Unused code:** `QuickStatsBar` component; `getSession` / `getUser` service wrappers; `LegalLinks.accountDeletion`.
14. **Dark mode:** only the navigator chrome switches; screens are always light.
15. **No spending tracking** beyond a per-receipt total; no per-store or per-company spending views, which the rebuild needs (Phase 8).
16. **Web barcode scanning is a silent dead end** (seen in P0.6): with no camera permission on web, `Alert.alert` is a no-op on react-native-web, so tapping Scan Barcode does nothing. Every web `Alert.alert` (confirmations, errors, request sent) has the same problem.

---

# Part 2 — Backend, AI and admin (P0.4)

## Edge functions

Three Deno edge functions live in `LEGACY/supabase/functions/`. All three are deployed and ACTIVE in the legacy project:

| Function | Deployed version | `verify_jwt` | Called by |
|---|---|---|---|
| `process-receipt` | 6 | true | app `receipt-service.parseReceiptImage`; admin `enrich.testReceiptImage` (Receipt Lab) |
| `enrich-content` | 3 | true | admin `enrich.enrichCompany` / `enrichProduct` / `researchBrandOwner` |
| `lookup-product` | 1 | true | app `data-service.lookupBarcodeSmart` |

**Common to all three:**
- CORS `Access-Control-Allow-Origin: *`; `OPTIONS` returns `"ok"`.
- JSON responses; errors are returned as `{error: string}` with an HTTP status.
- `verify_jwt = true` only requires *a* valid JWT, and the public anon key is one. So **any holder of the anon key** (it ships in the app) can call every function directly. None checks the caller's identity or role. `enrich-content` and `process-receipt` spend OpenRouter credit per call; `lookup-product` writes product rows with the service role.
- Each creates a **service-role** Supabase client from `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (standard edge env) for settings reads and DB access.
- OpenRouter secret: `OPENROUTER_API_KEY`. Optional env: `SITE_URL` (default `https://conscious-curator.app`) and `SITE_NAME` (default `Conscious Curator`), sent as `HTTP-Referer` / `X-Title`.

### `process-receipt` (v2 in source)

- **Purpose:** read a receipt photo with a vision model, then match every line against `products` server-side.
- **Request:** `POST {image_base64: string}`, a JPEG base64 string without the data-URL prefix. The app sends `quality: 0.5` images.
- **Settings** (`app_settings`, cached 30 s per instance):
  - `receipt_models: string[]`: the model chain. Code default `["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-nano-12b-v2-vl:free"]`; live value `["google/gemini-3.1-flash-lite"]`.
  - `receipt_match_threshold: number` in (0, 1]. Default and live value 0.45.
- **Model call:** OpenRouter `chat/completions` with `response_format: {type: "json_object"}`, `temperature: 0.1`, the system prompt below, and a user message `[{type:"text", text:"Parse this receipt."}, {type:"image_url", image_url:{url:"data:image/jpeg;base64,…"}}]`.
- **Fallback chain:** tries each model in order.
  - HTTP 429/400/404 → next model.
  - Network error → next model.
  - Unparseable JSON → next model.
  - Any other non-2xx → **abort** with 502.
  - All models fail → 429 with the last error.
  - Markdown code fences are stripped before `JSON.parse`.
- **Sanitising:** max 100 items; drop items without `name`; `raw` defaults to `name`; `brand` → null if empty; `price`/`quantity` must be finite numbers, else null. There is no schema library: hand-written type guards only.
- **Matching:** for each item, build the query strings `name`, `brand + " " + name`, `raw`, and any run of 6+ digits in `raw`/`name` (a barcode). Call RPC `match_receipt_items(p_queries, p_limit=3)` with the service role. Map rows back to items, de-duplicate per product (keep the highest confidence), keep the top 3 per item.
- **Response 200:**
  ```
  { model_used, store_name, match_threshold,
    items: [{ name, price, quantity,            // v1-compatible fields
              raw, brand,
              product_id | null,                 // set only if best.confidence >= threshold
              confidence | null,                 // best candidate's, 3 dp
              match_type | null,                 // set only when attached
              candidates: [{product_id, product_name, brand, company_name,
                            ethical_score, grade, confidence, match_type}] }] }
  ```
- **Errors:**
  - 500: `OPENROUTER_API_KEY` missing.
  - 400: invalid JSON, or missing `image_base64`.
  - 429/502: model chain failure.
  - An RPC failure is logged and items come back unmatched (still 200).
- **Not done:**
  - No token, cost or latency logging.
  - No per-user rate limit.
  - The image is not stored, which matches the privacy copy.
  - The receipt date and per-line quantity are not persisted by the app.

### `enrich-content` (v2 in source)

- **Purpose:** AI research for the admin console. It fills company profiles, product profiles, and brand-ownership answers, with server-side validation. Nothing is written to the DB: the admin reviews the result and saves it through the normal table writes.
- **Request bodies:**
  - `{type: "company", name, context?}`: context is typically a Wikipedia summary and the known facts from the editor.
  - `{type: "product", name?, barcode?, context?}`: name or barcode is required; context holds Open Food Facts data and the owning company's ratings.
  - `{type: "brand_owner", name, context?}`
- **Settings** (`app_settings`, cached 30 s):
  - `enrichment_models: string[]`. Code default `["google/gemini-2.5-flash-lite", "openai/gpt-4o-mini", "google/gemma-3-27b-it:free"]`; live value `["moonshotai/kimi-k2.6"]`.
  - `enrichment_web_search: boolean` (live: `true`). When true it adds `plugins: [{id: "web", max_results: 5}]` (OpenRouter web grounding, an extra cost per call).
- **Model call:** same chain and fallback rules as process-receipt; `json_object`, `temperature: 0.1`.
- **User prompt templates:**
  - company: `Research and enrich this company.\nName: {name}\nContext (JSON):\n{context pretty-printed}`
  - product: `Research and enrich this product.\nName: {name | "(unknown)"}\nBarcode: {barcode | "(none)"}\nContext (JSON):\n{context}`
  - brand_owner: `Which company owns this brand?\nBrand: {name}\nContext (JSON):\n{context}`
- **Validation (company):**
  - `founded` must be 1400–current year, else dropped.
  - Ratings are coerced case-insensitively to Good/Mixed/Poor; an invalid overall rating becomes null.
  - **Exactly 5 `ethical_scores`** in canonical order; a missing or invalid category becomes `Mixed`, with a warning.
  - Certifications ≤ 12 (date must be ISO `YYYY-MM-DD`).
  - Boycotts ≤ 10 (status Active/Resolved/Paused, default Active).
  - Controversies ≤ 12 (severity default `medium`).
  - `source_url` must match `^https?://\S+$`, else null.
  - Brands ≤ 15.
  - String lengths are capped per field (e.g. description 1500).
- **Validation (product):**
  - `ethical_score` is clamped to an integer 0–100 (a warning when changed); `grade = scoreToGrade(score)` (same scale as the app).
  - Features ≤ 4, icon from a 24-icon allow-list (else `leaf`).
  - **Exactly 4 `transparency_steps`** titled Sourcing, Production, Packaging, Distribution, matched by `step_number` or title.
  - Certifications ≤ 10.
- **Validation (brand_owner):** `confidence` high/medium/low; invalid → `low`.
- **Response 200:** `{model_used, web_search, type, data, warnings: string[]}`, where `warnings` lists every coercion or drop.
- **Errors:** same pattern as process-receipt; 400 for a bad `type` or missing name/barcode.
- **Not done:**
  - No citations: the schema has no evidence or sources field except optional `source_url` on boycotts and controversies.
  - No confidence on company or product output.
  - No rubric version.
  - No cost logging.
  - The model and date are not stored with the saved data.
  - The model is told to "say so in notes" when unsure, so uncertainty lives only in free-text notes.

### `lookup-product`

- **Purpose:** fallback barcode lookup with automatic brand → company resolution. No AI.
- **Request:** `POST {barcode: string}` (trimmed; no GTIN normalization).
- **Steps:**
  1. Service-role re-check of `products.barcode = barcode` (another scanner may have added it) → `{found: true, source: "database", product}`.
  2. Open Food Facts: `GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json?fields=product_name,brands,categories_tags,image_url` with `User-Agent: ConsciousCurator/1.0`.
     - The first comma-separated brand is used.
     - Category is the **last** `categories_tags` entry, with the language prefix stripped and hyphens turned into spaces.
     - No OFF product, or no name and no brand → `{found: false, source: "none", off: null}`.
  3. **Brand resolution:**
     - Load **all** `brands` rows into memory.
     - Normalise names: lowercase, `&` → "and", non-alphanumerics → space.
     - Exact normalised match first; else one-sided containment with a ≥ 4-char brand, preferring the longest.
     - No brand, or a brand without `company_id` → `{found: false, source: "off", off: {name, brand, category, imageUrl}}`.
  4. **Auto-create** a `products` row: name = OFF name or "{brand} product", plus `brand_id`, `company_id`, category, barcode, `image_url`, description "Auto-created from a barcode scan via Open Food Facts.", and `source: "auto_barcode"`. No score or grade.
     - Response: `{found: true, source: "auto_created", product}`.
     - If the insert fails → `{found: false, source: "off", off}`.
- **Risks:**
  - Containment matching can attach the wrong company (e.g. a short brand name contained in a longer unrelated one).
  - Anyone with the anon key can create product rows.
  - OFF is called without caching or rate limiting.

## AI prompts (verbatim)

**Every OpenRouter call site** (`grep -rn openrouter LEGACY/supabase LEGACY/admin/src LEGACY/src`):

| Call site | Function | Prompts used |
|---|---|---|
| `supabase/functions/process-receipt/index.ts:174` | `parseWithModels` | Receipt `SYSTEM_PROMPT` |
| `supabase/functions/enrich-content/index.ts:191` | `callModels` | `COMPANY_SYSTEM_PROMPT`, `PRODUCT_SYSTEM_PROMPT`, `BRAND_OWNER_SYSTEM_PROMPT` |

The app and the admin never call OpenRouter directly; they only invoke the edge functions.

### Receipt parser — `process-receipt` `SYSTEM_PROMPT`

```text
You are a receipt parser for a consumer-ethics app. Given a photo of a shopping receipt, extract the purchased products.
Return ONLY valid JSON — no markdown, no explanation:
{
  "store_name": string | null,
  "items": [
    {
      "raw": string,          // the line exactly as printed on the receipt
      "name": string,         // cleaned, human-readable product name with abbreviations expanded ("ORG" → "Organic", "WW BRD" → "Whole Wheat Bread")
      "brand": string | null, // brand if identifiable from the line (e.g. "KFT" → "Kraft", "GV" → "Great Value"), else null
      "price": number | null,
      "quantity": number | null
    }
  ]
}
Rules:
- One entry per purchased product line. Ignore totals, subtotals, tax, deposits, discounts, loyalty points, payment lines and store metadata.
- Expand common receipt abbreviations in "name". Keep it concise (2-6 words).
- If a quantity multiplier line applies (e.g. "2 @ 3.99"), set quantity and the total price for the line.
- If you cannot read the receipt clearly, return {"store_name": null, "items": []}.
```

Expected response shape: `{store_name: string|null, items: [{raw, name, brand|null, price|null, quantity|null}]}`.

### Company research — `enrich-content` `COMPANY_SYSTEM_PROMPT`

```text
You are a research assistant for an ethical-consumer app.
Given a company name and optional context (Wikipedia summary, known facts), return ONLY valid JSON matching this schema — no markdown, no explanation:

{
  "company_name": string,
  "legal_name": string | null,
  "headquarters": "City, Country" | null,
  "founded": number | null,
  "public_or_private": "Public" | "Private" | null,
  "stock_ticker": string | null,
  "revenue_range": string | null,
  "ceo": string | null,
  "description": "2-4 sentence factual overview of the company and its ethical reputation",
  "overall_ethical_rating": "Good" | "Mixed" | "Poor",
  "brands": string[],
  "ethical_scores": [
    { "category": "environment" | "labour" | "animal_welfare" | "politics_and_tax" | "human_rights", "rating": "Good" | "Mixed" | "Poor", "notes": "1-2 sentence factual summary" }
  ],
  "certifications": [ { "name": string, "verified": boolean, "verified_date": "YYYY-MM-DD" | null } ],
  "boycotts": [ { "name": string, "reason": string, "status": "Active" | "Resolved" | "Paused", "source_url": string | null } ],
  "controversies": [ { "title": string, "date_text": string, "description": string, "source_url": string | null, "severity": "low" | "medium" | "high" | "critical" } ]
}

Rules:
- Always return all 5 ethical_scores categories exactly once.
- Prefer well-known, recent (2023–2026) facts. If unsure, use "Mixed" and say so in notes.
- Overall: Good = majority Good with no Poor; Poor = 2+ Poor or any critical ongoing controversy; else Mixed.
- Include notable certifications, active boycotts, and major controversies when known; empty arrays are fine.
- NEVER invent source URLs or statistics — use null when unsure. Accuracy beats completeness.
- Keep brands to major consumer brands owned by this company (up to ~10).
```

Note: the "Overall" rule line is the only written rating rubric in the legacy system. It has no version.

### Product research — `enrich-content` `PRODUCT_SYSTEM_PROMPT`

```text
You are a research assistant for an ethical-consumer app.
Given a product (name and/or barcode) plus optional context from Open Food Facts and the owning company, return ONLY valid JSON matching this schema — no markdown, no explanation:

{
  "name": string,
  "brand": string | null,
  "brand_owner": string | null,
  "category": string | null,
  "description": "1-2 sentence product description focused on what it is and any ethical angles",
  "ethical_score": number,
  "certifications": string[],
  "features": [ { "icon": string, "title": string, "description": string } ],
  "transparency_steps": [ { "step_number": number, "title": string, "description": string } ]
}

Rules:
- ethical_score is 0–100 and should reflect the owning company's ethics plus product-specific factors (packaging, sourcing, certifications).
- If owning-company ethical ratings are provided in context, stay consistent with them.
- brand: the consumer-facing brand printed on the packaging (e.g. "Unico"). Often different from the owner.
- brand_owner: the company that owns the brand (e.g. "Sun-Brite Foods"). null only if genuinely unknown.
- features: 2–4 items. icon must be one of: sprout, recycle, water-outline, molecule-co2, leaf, package-variant, rabbit, hand-heart, dna, cow, snowflake, water-alert, bottle-soda, factory, alert-circle, certificate, earth, shield-check, account-group, tree, fish, flash, truck-delivery, store
- transparency_steps: exactly 4 steps titled Sourcing, Production, Packaging, Distribution (step_number 1–4) describing this product's supply chain as factually as possible.
- Prefer Open Food Facts context for name/category/certifications when provided.
- NEVER invent certifications or statistics you are unsure about.
```

### Brand owner — `enrich-content` `BRAND_OWNER_SYSTEM_PROMPT`

```text
You identify which company owns a consumer brand.
Given a brand name (and optional product context), return ONLY valid JSON — no markdown, no explanation:

{
  "brand": string,               // canonical brand spelling
  "owner_company_name": string | null,  // the company that owns this brand today (ultimate consumer-facing parent, e.g. "Nestlé" not a holding shell)
  "confidence": "high" | "medium" | "low",
  "note": string                 // one sentence: how the brand relates to the owner (acquisition year, subsidiary chain, etc.)
}

Rules:
- Report the CURRENT owner after any acquisitions you know about.
- If the brand is owned through a subsidiary, name the well-known parent and mention the subsidiary in the note.
- If you do not recognize the brand, set owner_company_name to null and confidence to "low". Never guess.
```

### `app_settings` keys

| Key | Type | Live value | Read by | Edited in |
|---|---|---|---|---|
| `receipt_models` | string[] | `["google/gemini-3.1-flash-lite"]` | process-receipt | admin Settings → AI pipeline |
| `receipt_match_threshold` | number | `0.45` | process-receipt (the app mirrors 0.45 as a constant) | admin Settings |
| `enrichment_models` | string[] | `["moonshotai/kimi-k2.6"]` | enrich-content | admin Settings |
| `enrichment_web_search` | boolean | `true` | enrich-content | admin Settings |

## RPCs

All are in `schema.sql` (bodies) and `SCHEMA.md` (summary). Call sites, found by grepping `.rpc("` across `src`, `admin/src`, `supabase/functions` and `catalog-worker/src`:

| RPC | Called from | Role used | Notes |
|---|---|---|---|
| `search_all(p_query, p_filter)` | app Search tab | user JWT | ILIKE over products and companies, 20 each. |
| `match_receipt_items(p_queries, p_limit)` | app receipt fallback (`p_limit` 1); process-receipt (3, service role); admin Receipt Lab (3) | user / service | Tiers: alias exact 1.0, barcode 0.99, name exact 0.98, brand+name exact 0.95, trigram ×0.9, alias trigram ×0.9. |
| `check_content_freshness(...)` | app `sync-service` | user | **Signature mismatch**: called with `{since_ts}`, but defined with 3 `p_*_since` args returning an object. Always fails silently. |
| `delete_own_account()` | app Settings | user | **Not in the live DB** (the migration was never applied). |
| `claim_scrape_job(p_worker_id, p_stale_before)` | catalog-worker | service | Atomic claim with `SKIP LOCKED`; reclaims stale jobs. |
| `request_scrape_job_cancel(p_id)` | admin Jobs | service | queued → cancelled; running → cancelling. |
| `get_user_stats(p_user_id)` | **nobody** | — | SECURITY DEFINER, executable by anon; leaks stats (SCHEMA.md security note 2). |

Unused DB objects: `user_stats_view` and `company_details_view` have no client callers.

## RLS (per table)

From `SCHEMA.md`. Legend: **R** public read (`USING true`); **own** = `auth.uid()` = owner column; **—** = RLS on, no policies (service role only).

| Table | SELECT | INSERT | UPDATE | DELETE | Who writes in practice |
|---|---|---|---|---|---|
| companies, brands, ethical_scores, certifications, boycotts, controversies, products, product_features, transparency_steps, impact_stories | R | — | — | — | admin SPA (service role); `lookup-product` inserts products (service role) |
| product_aliases | — | — | — | — | admin Receipt Lab (service role) |
| app_settings | — | — | — | — | admin Settings (service role); read by edge functions (service role) |
| profiles | own | — (trigger) | own | — | `handle_new_user` trigger; app Settings |
| scan_history | own | own | own | own | app |
| receipt_scans | own | own | own | own | app |
| receipt_items | own (via receipt_scans) | own (via receipt_scans) | **—** | own (via receipt_scans) | app insert; admin Receipt Lab relinks with the service role |
| community_submissions | own | own | own while `pending` | own while `pending` | app insert; admin review (service role) |
| retailers, retailer_stores, retailer_categories, catalog_products, retailer_products, retailer_product_categories, store_products, store_product_price_history, scrape_jobs, scrape_job_events, retailer_request_profiles | — | — | — | — | admin Retailer Catalogue pages and catalog-worker (both service role) |

**Implication:** with only the anon key, the admin console can read the public editorial tables but cannot write anything, cannot read `app_settings`, and cannot see any catalogue table. **Every admin write therefore depends on the service-role key held in the browser.**

## Admin portal (`LEGACY/admin/`)

**Stack:** Vite 5 + React 18 + TypeScript SPA with `react-router-dom` hash routing (`#/…`) and hand-rolled CSS (`src/index.css`, 1650 lines; see THEME.md, P0.5). Run with `npm run dev` from `admin/`. It is **meant to run locally only**.

**Connection model** (`src/lib/supabase.ts`, flagged): **the service-role key is used in the browser.**
- Settings → "Supabase connection" takes a URL (default: the legacy project) and a key, labelled "API key (service_role recommended)". Both are stored in plain text in `localStorage["cc-admin-connection"]`.
- The key's JWT `role` claim is decoded; the sidebar then shows "Service role · full access", or warns that an anon key "only allows reading public data".
- A single supabase-js client (no session) is built from that key and used for **every** query, insert, update, delete and edge-function call.
- There is no admin login, no user identity, and no audit of who changed what. Anyone with the browser profile, or any XSS, gets full DB access.
- All data access goes through `src/lib/api.ts` (editorial), `src/lib/catalog-api.ts` (retailer catalogue), `src/lib/settings.ts` (`app_settings`) and `src/lib/enrich.ts` (edge functions). Pages never build queries directly.
- External calls straight from the browser (`src/lib/external.ts`): Open Food Facts product API and `cgi/search.pl` name search; Wikipedia `w/api.php` search and the REST page summary.

**Navigation** (`components/Layout.tsx`): a sidebar with sections and a connection status pill.
- Dashboard.
- **Catalog:** Products, Brands, Companies.
- **Intake:** Receipt Lab, Submissions.
- **Content:** Stories, QR Codes.
- **Retailer Catalogue:** Overview, Retailers, Stores, Categories, Jobs, Product Explorer.
- **System:** Activity, Settings.

Pages are listed below, one section per file under `admin/src/pages/` (19 files). "Key" is the key each page needs to work: service role, unless it is read-only on public tables.

### Dashboard — `admin/src/pages/Dashboard.tsx`

- Route `#/`.
- **Data health** counters (`getDataHealth`), each linking to a filtered list:
  - products without a barcode;
  - products not linked to a brand;
  - brands without an owner company;
  - companies without ethical scores;
  - receipt items not matched to products;
  - auto-created products awaiting review (`source <> 'manual'`).
- Quick barcode check (`findProductByBarcode`) with "Create it now →" → Product editor.
- **Recent scans** (`listScanHistory`) and **Pending submissions** (`listSubmissions`).
- Row counts (`countRows`).
- **Key:** service role (reads `scan_history`, `receipt_items` and `community_submissions` across all users).

### Products — `admin/src/pages/Products.tsx`

- Route `#/products`. Table: thumbnail, product, Brand → Company, category, barcode, score/grade.
- Filters: text, "Missing barcode", "Missing brand link". Paged. Delete with a confirm dialog (`deleteProduct`).
- "Add your first product" → editor.
- **Key:** service role for delete; the list works with anon.

### Product editor — `admin/src/pages/ProductEditor.tsx`

- Routes `#/products/new` and `#/products/:id`; also opened from Submissions with a `prefill` state.
- **Intro text:** "Look up a barcode or search by name, link the brand, then AI-fill the rest."
- **Lookup:**
  - The barcode field (6–14 digits) → Open Food Facts lookup, which prefills name, brand, category, image, labels and description.
  - "Search products by name (Open Food Facts)…" → pick a result.
  - Duplicate-barcode check (`findProductByBarcode`).
- **Identity & ownership:**
  - Brand combobox (search existing brands or create one inline: `insertBrand`, with an optional new owner company via `insertCompany`).
  - "Research owner" → `researchBrandOwner` (AI brand_owner).
  - The company is derived from the brand's owner ("edit on the brand"); without a brand, an owner company must be picked.
- **Fields:**
  - name, category, description, image URL (must be http(s));
  - ethical score 0–100 (grade auto-computed with `scoreToGrade`);
  - certifications (chips);
  - Key features (icon / title / description, from the allow-listed icons);
  - Transparency steps;
  - **Receipt aliases** (`addProductAlias` / `deleteProductAlias`; "learned automatically from Receipt Lab corrections").
- **AI fill:**
  - "AI enrich" → `enrichProduct({name, barcode, context: OFF data + owning-company ratings})`, with a progress overlay (`EnrichProgress`, plus an unload guard).
  - A **"Review AI suggestions"** modal shows the proposed values and warnings; the admin applies them selectively, then saves.
- **Save:** `insertProduct` / `updateProduct`, then `replaceProductChildren` (**delete + reinsert** `product_features` and `transparency_steps`).
- **Provenance written:** none. There is no record that a value came from AI, OFF or a person; `products.source` stays `manual` for editor-created rows.
- **Key:** service role.

### Brands — `admin/src/pages/Brands.tsx`

- Route `#/brands`. Table: brand, owner company (RatingBadge), product count. Filter.
- Edit modal: name, owner company (pick or create), notes. Saving relinks products via DB triggers ("Brand updated — its products were relinked automatically.").
- **Merge into another brand** (`mergeBrands`: move products, delete the source).
- Delete with a confirm dialog.
- "Research owner" (AI brand_owner) per brand.
- **Bulk brand link** (`components/BulkBrandLink.tsx`): proposes a brand for every product without `brand_id`, using:
  1. the product's text `brand` equals a brand name;
  2. the product name starts with a brand name (longest wins);
  3. the product's company owns exactly one brand.
  Each proposal shows its reason, the admin confirms, then `linkProductToBrand` runs.
- **Key:** service role.

### Companies — `admin/src/pages/Companies.tsx`

- Route `#/companies`. Table: company, rating, brands, products. Filter, delete with confirm (`deleteCompany`, which cascades to scores, products etc. per the FKs).
- **Key:** service role for delete.

### Company editor — `admin/src/pages/CompanyEditor.tsx`

- Routes `#/companies/new` and `#/companies/:id`.
- **Intro text:** "Wikipedia for basics · AI for ethics data (reviewed before apply)".
- **Wikipedia:** search (`searchWikipedia`) → pick → `fetchWikiSummary` prefills the description and basics ("Basics filled from Wikipedia. Run AI Enrich for ethics data.").
- **Fields:**
  - Company basics: name, slug (required, `slugify`), legal name, HQ, founded, public/private (segmented), ticker, revenue range, CEO, logo URL, description.
  - **Parent company** ("For subsidiaries of other companies you track").
  - Overall rating.
  - **Category scores:** 5 categories × Good/Mixed/Poor with notes.
  - Certifications (name, verified, date).
  - Boycotts (name, reason, status, source URL).
  - Controversies (title, date text, description, source URL, severity).
- **Owned brands:**
  - Add a brand: an existing brand is re-linked (`findBrandByName` + `updateBrand`), else it is created on save.
  - Unlink a brand.
- **AI enrich:** `enrichCompany(name, context)` → a "Review AI research" modal with warnings → "Applied. Review the form, then save."
- **Save:**
  - `insertCompany` / `updateCompany`.
  - Then `replaceCompanyChildren` for each of ethical_scores, certifications, boycotts and controversies: **delete all rows, then reinsert**. Any history of individual rows is lost on every save.
  - Then brand inserts and links.
- **Provenance written:** none (no model, date, sources or reviewer).
- **Key:** service role.

### Receipt Lab — `admin/src/pages/ReceiptLab.tsx`

- Route `#/receipts`.
- **Parser test:**
  - Upload a receipt image → `testReceiptImage` (process-receipt).
  - Shows the preview, Parse summary (model, store, items found, matched to database, auto-match threshold), and per line: receipt text, best suggestion, a `ConfidenceBar`, and "Too uncertain to accept in one click" below the threshold.
- **Unmatched queue:**
  - `listUnmatchedReceiptItems` (all users' `receipt_items` with `product_id IS NULL`), grouped by text with a "Seen" count.
  - Suggestions come from `matchReceiptItems` (RPC).
  - **Link to product:** product search (`listProducts`) → `linkReceiptItemsToProduct` (updates every unmatched item with that exact text) **and** `addProductAlias(text)`, so future receipts match.
  - "Queue is clear — every receipt item is matched."
- **Key:** service role (reads and updates other users' receipt items).

### Submissions — `admin/src/pages/Submissions.tsx`

- Route `#/submissions`. Inbox of `community_submissions`: type, suggestion, barcode, where from (the `data.source`), submitted, status.
- Filter pending/all ("No pending submissions — inbox zero.").
- **Actions:**
  - **Approve & create record:** sets `status=approved`, `reviewed_at`, `reviewer_notes`, then navigates to the Product (or Company) editor with `prefill = submission.data`.
  - **Approve without creating a record.**
  - **Reject** with reviewer notes ("visible to admins only").
- `reviewed_by` is never set (there is no admin identity).
- Users are not notified.
- **Key:** service role.

### Stories — `admin/src/pages/Stories.tsx`

- Route `#/stories`. Table: story, category, company, published, status ("No body" flag).
- Modal: title (required), subtitle, category, body, cover image URL, related company, published date, Featured.
- **Featured is single-select:** saving calls `unfeatureOtherStories`.
- Create, update, delete (`insertStory` / `updateStory` / `deleteStory`).
- **Key:** service role.

### QR Codes — `admin/src/pages/QrCodes.tsx`

- Route `#/qr-codes`. Lists products with barcodes and renders a QR code per barcode (`components/QrImage.tsx`, client-side). Download or print.
- Custom QR value field ("e.g. a barcode you're about to assign").
- Purpose: test the app's scanner without physical products (the app accepts `qr` codes).
- **Key:** anon is enough (reads public products).

### Activity — `admin/src/pages/Activity.tsx`

- Route `#/activity`.
- **Recent scans** (`listScanHistory`, 200) with the user's display name (`listProfiles`), type, product and grade.
- **Recent receipts** (`listReceiptScans`, 200) with store, items, total and trip rating.
- Counts of active users and "Unresolved scans".
- **Key:** service role. It exposes every user's activity; there is no PII minimisation.

### Settings — `admin/src/pages/Settings.tsx`

- Route `#/settings`.
- **Supabase connection:** URL + key (with JWT and URL validation), "Test connection" (`testConnection`: select 1 company), save/clear. "Local use only."
- **AI pipeline** (`getSetting` / `setSetting` on `app_settings`):
  - Receipt vision models (chips; "Needs vision-capable models").
  - Receipt match threshold (0–1).
  - Enrichment models (chips).
  - Web search grounding toggle ("slightly higher cost").
  - Validation: at least one model per chain.
- **Key:** service role (`app_settings` has no policies).

### Retailer Catalogue — Overview — `admin/src/pages/catalog/Overview.tsx`

- Route `#/catalog`.
- KPI tiles (`getOverview`): retailers, enabled stores, catalog products, retailer products, store price points, active jobs, failed jobs (7 days), last successful sync.
- Recent jobs table (type, store, status, products, requested).
- **Key:** service role.

### Retailer Catalogue — Retailers — `admin/src/pages/catalog/Retailers.tsx`

- Route `#/catalog/retailers`. Table: retailer, provider key ("Fixed — maps to the worker provider."), country, currency, status.
- Edit modal: name, base URL (`configuration_json`), default currency, enabled.
- There is no create: retailers come from seed migrations ("Apply the seed migration to add Fortinos.").
- **Key:** service role.

### Retailer Catalogue — Stores — `admin/src/pages/catalog/Stores.tsx`

- Route `#/catalog/stores`. Table: store, retailer, external id, status, last sync.
- Create/edit modal: retailer, external store id ("The retailer's own store id (e.g. Fortinos storeId)."), display name, city, province, postal code, enabled.
- Delete with a confirm dialog (cascades to `store_products`).
- **Queue jobs** per store (`createJob`): full sync, "Dry run (fetch + normalize, no writes)", "Count only (no writes)".
  - Guard: refuses a second full/incremental sync while one is queued or running for the store.
- **Key:** service role.

### Retailer Catalogue — Categories — `admin/src/pages/catalog/Categories.tsx`

- Route `#/catalog/categories`. Per-retailer category list: name, external id, URL path, last count, last sync, enabled.
- Create/edit modal: external category id, name, URL path (e.g. `food/dairy-eggs`), nav id (e.g. `flyout-L2-Dairy-and-Eggs`), enabled. Delete with confirm.
- **Count-only test** against a chosen store (queues a `count_only` job with `categoryExternalIds`).
- **Key:** service role.

### Retailer Catalogue — Jobs — `admin/src/pages/catalog/Jobs.tsx`

- Route `#/catalog/jobs`. "Catalogue ingestion jobs and their progress."
- Table: type, store, status (labelled), progress, products, requested. Filter by status.
- **Key:** service role.

### Retailer Catalogue — Job details — `admin/src/pages/catalog/JobDetails.tsx`

- Route `#/catalog/jobs/:id`. Live view ("Live — polling every 3s…") of `getJob` + `listJobEvents`:
  - requested / started / heartbeat / completed timestamps;
  - counters;
  - the event log (time, severity, event, category/page, message).
- **Cancel** → RPC `request_scrape_job_cancel` ("Cancellation requested"). **Retry** re-queues the same parameters (`retryJob`).
- **Key:** service role.

### Retailer Catalogue — Product Explorer — `admin/src/pages/catalog/ProductExplorer.tsx`

- Route `#/catalog/products`. Pick a store, then filter by name, brand and availability ("Any" / "Available online").
- Table (`searchStoreProducts`): product, regular price, effective price, unit price, availability, checked-at. Read-only.
- **Key:** service role.

### Admin components with behaviour

- `components/BulkBrandLink.tsx`: see Brands.
- `components/EnrichProgress.tsx`: progress overlay while AI runs, plus `useUnloadGuard` (warns before closing the tab mid-request).
- `components/QrImage.tsx`: client-side QR rendering.
- `components/RequireConnection.tsx`: gate that shows a "Connect to Supabase" prompt when no connection is stored.
- `components/pickers.tsx`, `components/ui.tsx`: form controls, tables, modals, toasts, badges. Visual detail goes in THEME.md.

## Catalog worker (pointer)

`LEGACY/catalog-worker/` is a separate Node + TypeScript process (Vitest tests) that runs on the developer's machine:
- It polls `scrape_jobs` with the service role and claims jobs via `claim_scrape_job`.
- It runs a **provider** per `provider_key`; only **Fortinos** exists (Loblaw Next.js data routes). It attaches to a real Chrome session over CDP to get past Akamai bot protection (dropped by D-002).
- It normalises listings into `catalog_products` → `retailer_products` → `store_products` with batched upserts, appends `store_product_price_history` when a price or promotion field changes, and writes progress and heartbeat to `scrape_jobs` / `scrape_job_events`.

The legacy DB has 96 Fortinos products from 12 jobs. A file-by-file keep/adapt/drop review is task **P0.9** (`docs/legacy/CATALOG_REVIEW.md`).

## Backend and admin: issues for the rebuild

1. **Service-role key in the browser** (admin). The rebuild needs real admin auth (D-005: role on `profiles` + `is_admin()` + RLS) and server-side privileged operations only.
2. **Edge functions are open to anyone with the anon key**, including the paid OpenRouter calls and product auto-creation. They need auth checks (user, or admin for enrichment), rate limits, and a spend guard (D-009).
3. **No AI provenance:** the model, date, prompt or rubric version, sources and confidence are not stored. The only "rubric" is one line in the company prompt. Phase 7 needs all of these.
4. **No cost or token logging** for OpenRouter.
5. **Delete-and-reinsert saves** for company and product child rows destroy row identity and any future per-row provenance.
6. **No admin identity:** `community_submissions.reviewed_by` is never set, and there is no change history.
7. **Validation is hand-written** in Deno, with no shared schema between server and client (the rebuild uses zod in `packages/core`).
8. **`lookup-product` brand resolution** loads every brand into memory and uses loose containment matching; there is no confidence or review queue for auto-created products beyond a Dashboard counter.
9. **Barcode lookups** (app and edge function) don't normalize GTINs.
10. **Brand data is duplicated:** `companies.brands[]`, `brands`, and `products.brand` text, kept in sync by triggers. The app reads the array, while the admin and the edge functions use the table.
