# Legacy app specification

What the legacy app ("Conscious Curator", repo `MobileDev/Ethical-App`) does, written from its source code on 2026-10-26. This is the functional reference for the rebuild; it describes legacy behaviour, including bugs, and doesn't decide what to keep.

- **Part 1 (P0.3):** user app screens, flows, services, offline cache. *(this file, below)*
- **Part 2 (P0.4):** edge functions, AI prompts, RPCs, RLS, admin portal. *(to be appended)*

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
   2. On a miss, edge function `lookup-product`: Open Food Facts lookup. If OFF's brand resolves to a tracked company, it auto-creates a draft product (`source = 'auto_created'`) and returns it; else it returns the OFF info.
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
