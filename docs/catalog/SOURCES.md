# Catalog sources (P0.10)

The catalog sources we could use, what each allows, and a verdict:
- **use**: the terms allow our use. Build it in Phase 3.
- **ask owner**: needs your decision before any code is written.
- **avoid**: don't build it.
- **manual only**: an admin may cite it by hand, but there's no automated import.

The CLAUDE.md scraper rules apply to every source used: robots.txt, about 1 request per second per host, backoff, caching, provenance and raw storage.

**Method.** I read terms pages, robots.txt files and API docs only. I ran no scrapers.
- robots.txt was fetched once per host with `curl`.
- Terms pages were read with WebFetch. Where that failed, I opened the page once in a normal browser view (Playwright).
- All terms and robots checks are dated **2026-10-26** unless a row says otherwise.
- Quotes are verbatim excerpts. "Unknown" always gives a reason.

**Contents**
1. [Summary](#1-summary)
2. [Products](#2-products)
3. [Prices](#3-prices)
4. [Retailers](#4-retailers)
5. [Ownership](#5-ownership)
6. [Ratings evidence and articles](#6-ratings-evidence-and-articles)
7. [Decisions for owner](#7-decisions-for-owner)

Each source card has the same fields: **Provides · Licence · Terms on automated access · robots.txt · Access method · Auth · Rate limits · Ontario coverage · Freshness · Key fields · Est. rows / size · Verdict**.

In **Key fields**, the fields marked **(key)** are the ones the P0.11 data model must give a home to.

---

## 1. Summary

| # | Source | Area | Verdict |
|---|---|---|---|
| S1 | Open Food Facts: bulk exports | Products | **use** (ODbL accepted, D1) |
| S2 | Open Food Facts: product API | Products | **use** (lookup fallback only) |
| S3 | UPCitemdb (free tier) | Products | **avoid** (owner: skip, D5) |
| S4 | GS1 Canada (ECCnet / Verified by GS1) | Products | **avoid** (paid; note only) |
| S5 | Open Prices (Open Food Facts) | Prices | **use** (thin in Canada; ODbL accepted, D1) |
| S6 | Statistics Canada 18-10-0245-01 | Prices (sanity reference) | **use** |
| S7 | Loblaw banners (PC Express platform) | Retailer | **avoid** (owner, D2) |
| S8 | Sobeys group (Voilà, Sobeys, FreshCo, Foodland) | Retailer | **avoid** (owner, D2) |
| S9 | Metro / Food Basics | Retailer | **avoid** (owner, D2) |
| S10 | Walmart.ca | Retailer | **avoid** (owner confirmed, D2) |
| S11 | Costco.ca | Retailer | **avoid** (owner confirmed, D2) |
| S12 | Longo's | Retailer | **avoid** (owner, D2) |
| S13 | Farm Boy | Retailer | **avoid** (owner, D2) |
| S14 | Giant Tiger | Retailer | **avoid** (owner, D2) |
| S15 | Flipp | Flyer aggregator | **avoid** (no scraping; no partnership for now, D3) |
| S16 | Reebee | Flyer aggregator | **avoid** (same platform as Flipp) |
| S17 | Wikidata: SPARQL query service | Ownership | **use** |
| S18 | Wikidata: dumps | Ownership | **avoid** (too large; S17 covers it) |
| S19 | Wikipedia (REST / Action API) | Ownership, company summaries | **use** |
| S20 | SEC EDGAR (Exhibit 21 subsidiaries) | Ownership | **use** |
| S21 | Corporations Canada (federal corporations) | Ownership (identity check) | **use** (low priority) |
| S22 | OpenCorporates API | Ownership | **avoid** (licence and limits; revisit with D1) |
| S23 | GDELT DOC 2.0 API | Articles | **use** |
| S24 | Publisher RSS feeds | Articles | **use** (provisional feed list, D4; terms checked per feed) |
| S25 | Google News RSS | Articles | **avoid** |
| S26 | NewsAPI (free tier) | Articles | **avoid** |
| S27 | B Corp directory (B Lab) | Ratings evidence | **manual only** (cite per company, D6) |
| S28 | Fairtrade Canada brand finder | Ratings evidence | **manual only** (cite per company, D6) |
| S29 | KnowTheChain benchmarks | Ratings evidence | **manual only** (cite per company, D6) |
| S30 | Ethical Consumer | Ratings evidence | **avoid** (paid; note only) |

This table is mirrored in the `public.sources` table (one row per S-id, joined on `sources_md_id`; seed migration `20261028221731_seed_sources`, D-032). When a verdict or terms check changes here, change the table too, in a new migration.

**What this means for the catalog:**
- **Products and ownership are well covered** by open sources: S1, S5, S17, S19 and S20.
- **Store prices are the gap.**
  - Open Prices holds only **697 CAD prices** in total.
  - StatCan has averages, not store prices.
  - Every Ontario grocer's terms limit their site to "personal, non-commercial use". Several also put bot protection in front of it (Akamai on Loblaw and Sobeys; a "press and hold" challenge on Walmart).
- With every grocer avoided (D2), real store prices come from **users' receipts** (D7; the consent wording is still a Phase 8 task), plus Open Prices.

---

## 2. Products

### S1 Open Food Facts: bulk exports

| Field | Value |
|---|---|
| Provides | Products by barcode: name, brands, quantity, categories, labels, ingredients, nutrition, images, countries sold. |
| Licence | Database: ODbL. Contents: DbCL. Images: CC BY-SA. "You must attribute any public use of the database, or works produced from the database". Share-alike: if you publicly use an adapted version of the database, you must offer that adapted database under the ODbL. Source: https://world.openfoodfacts.org/data (checked 2026-10-26). |
| Terms on automated access | Bulk use is encouraged: apps expecting heavy traffic should "host a local instance and use the daily exports", and large fetches should "download the data as a CSV or JSONL file directly" (https://openfoodfacts.github.io/openfoodfacts-server/api/, checked 2026-10-26). The terms of use have no anti-automation clause (https://world.openfoodfacts.org/terms-of-use, checked 2026-10-26). |
| robots.txt | `static.openfoodfacts.org/robots.txt` disallows `/api`, `/cgi` and `/facets` for `*`. It doesn't block `/data/`, where the exports live. The export URL redirects (302) to `openfoodfacts-ds.s3.eu-west-3.amazonaws.com`, which has no robots.txt (404). Re-checked 2026-10-30 (P3.5): unchanged. |
| Access method | Bulk dump. Nightly JSONL (`openfoodfacts-products.jsonl.gz`), CSV (`en.openfoodfacts.org.products.csv.gz`, "about 0.9 GB compressed, about 9 GB uncompressed"), Parquet on Hugging Face, and daily deltas covering the last 14 days (`/data/delta/index.txt`). |
| Auth | None. |
| Rate limits | None stated for static files. Download once per run on the Actions runner (D-010). Don't store the dump in Supabase. |
| Ontario coverage | Canada filter: **129,088 products** on ca.openfoodfacts.org (2026-10-26). There's no province field, so these are products "sold in Canada", not Ontario specifically. Completeness varies by product. |
| Freshness | Full export nightly; deltas daily. Deltas can't signal deletions, so a periodic full import is needed. |
| Key fields | **`code` (GTIN, key)**, **`product_name` (key)**, **`brands` / `brands_tags` (key)**, **`quantity` (key)**, **`categories_tags` (key)**, `labels_tags`, **`countries_tags` (key; filter)**, `image_url`, **`last_modified_t` (key; change detection)**, `ingredients_text`, `nutriscore_grade`. |
| Est. rows / size | About 129k Canadian products. The dump is several GB, processed on the runner only. A selected-column extract is roughly 0.5–1 KB per row, so about 65–130 MB before indexes. P0.11 must budget this, possibly importing only products with a name and a brand. |
| Verdict | **use**. ODbL share-alike **accepted** (D1): keep OFF-derived tables separable, publish an ODbL extract, and show attribution in the app UI. |
| Pipeline (P3.5) | Source `off`, email User-Agent (P3.1). Reads the CSV export; on 2026-10-30 it was **1.53 GB** compressed (the data page still says ~0.9 GB), tab-separated, 211 columns, no `product_quantity_unit` column (the unit comes from `quantity`, D-057). Terms re-checked 2026-10-30: no change, so `terms_checked_at` stays 2026-10-26. |

### S2 Open Food Facts: product API

| Field | Value |
|---|---|
| Provides | Live single-product lookup by barcode. Used for barcodes missing from our S1 import (the legacy `lookup-product` fallback). |
| Licence | Same as S1 (ODbL / DbCL / CC BY-SA). https://world.openfoodfacts.org/terms-of-use (checked 2026-10-26). |
| Terms on automated access | Allowed with an identifying User-Agent: "The User-Agent should be in the form of `AppName/Version (ContactEmail)`". Reads "do not require authentication other than the custom User-Agent". https://openfoodfacts.github.io/openfoodfacts-server/api/ (checked 2026-10-26). |
| robots.txt | `world.openfoodfacts.org` disallows `/api` and `/cgi` for crawlers (`*`). The API docs explicitly invite programmatic API use, so the API is governed by its documented limits. We don't crawl it. |
| Access method | REST API: `GET /api/v2/product/{code}.json?fields=…`. |
| Auth | None for reads (custom User-Agent required). |
| Rate limits | "15 req/min/IP address for all read product queries"; search "10 req/min/IP address". |
| Ontario coverage | Same data as S1, but live. |
| Freshness | Live. |
| Key fields | Same as S1. |
| Est. rows / size | Only cache misses: a few per user scan. Negligible. |
| Verdict | **use** as a fallback in the barcode lookup edge function, with a cache, the User-Agent and the limit above. Never for bulk. |

### S3 UPCitemdb (free tier)

| Field | Value |
|---|---|
| Provides | General UPC lookup: title, brand, description, images, offer links. Better on non-food than OFF. |
| Licence | Commercial service: "a limited, non-exclusive, non-transferable and terminable license"; use "solely for Customer's operations". No clause found on caching, storing or republishing. https://www.upcitemdb.com/terms (checked 2026-10-26). |
| Terms on automated access | API use is the intended access. "UPCitemdb reserves the right to refuse connections/traffic without warning" (https://www.upcitemdb.com/terms, checked 2026-10-26). |
| robots.txt | Disallows `/barcode`, `/norob` and `/query` for `*`. Website lookup pages are off-limits; use the API only. |
| Access method | REST API (trial endpoint). |
| Auth | Unknown for the trial endpoint: the rate-limit page doesn't say whether a key is needed. Paid plans use a key. |
| Rate limits | "plan FREE allows total of 100 combined requests per day", search "up to 40 per day", and "limited up to 6 requests per minute", applied per IP. https://www.upcitemdb.com/wp/docs/main/development/api-rate-limits/ (checked 2026-10-26). |
| Ontario coverage | Unknown: global/US-centric, with no Canada filter documented. |
| Freshness | Unknown (not documented). |
| Key fields | `ean`/`upc` (key), `title`, `brand`, `images`. |
| Est. rows / size | At most 100 lookups a day. Negligible. |
| Verdict | **avoid** (owner: skip, D5). The value is low next to OFF, and whether results may be stored and shown is unclear. |

### S4 GS1 Canada (ECCnet Registry / Verified by GS1)

| Field | Value |
|---|---|
| Provides | Authoritative brand-owner product data for Canadian GTINs (ECCnet). |
| Licence | Unknown: no public data licence. Access is by subscription ("Exclusive to GS1 Canada subscribers", per https://www.gs1ca.org/, checked 2026-10-26). |
| Terms on automated access | Unknown: no public API terms. The ECCnet outbound API is subscriber-only (robots.txt disallows `/eccnet-outbound-api/`). |
| robots.txt | Allows `/`; disallows `/eccnet-outbound-api/`, `/registry-documents/`, `/internal/` and more. |
| Access method | Subscriber API / portal. |
| Auth | Subscription login. |
| Rate limits | Unknown (subscriber terms not public). |
| Ontario coverage | National (Canadian GTIN registry). |
| Freshness | Unknown (subscriber product). |
| Key fields | GTIN (key), brand owner, product attributes. |
| Est. rows / size | Unknown (not public). |
| Verdict | **avoid**: paid (CLAUDE.md "free tiers only"). Note only. |

---

## 3. Prices

### S5 Open Prices (Open Food Facts)

| Field | Value |
|---|---|
| Provides | Crowd-sourced price observations (from receipts or shelf photos) with product code, store location (OSM) and date. |
| Licence | ODbL. "Make sure you comply with the OdBL licence, mentioning the source of your data, and ensuring to avoid combining non free data you can't release legally as open data." https://openfoodfacts.github.io/open-prices/guides/data/ (checked 2026-10-26). |
| Terms on automated access | The project offers daily dumps and an API for reuse, with no anti-automation clause (https://openfoodfacts.github.io/open-prices/guides/data/, checked 2026-10-26). |
| robots.txt | `prices.openfoodfacts.org/robots.txt` is empty (200, 0 bytes), so nothing is disallowed. |
| Access method | Bulk dump (daily JSONL: `/data/prices.jsonl.gz`, `/data/locations.jsonl.gz`, `/data/proofs.jsonl.gz`; Parquet on Hugging Face `openfoodfacts/open-prices`). REST API `/api/v1/prices`. |
| Auth | None for reads. |
| Rate limits | Unknown: the guide states none. Use the daily dump, not the API. |
| Ontario coverage | **Very thin.** `GET /api/v1/prices?currency=CAD` reported a total of **697** (2026-10-26), out of 335,980 prices worldwide. Example: Dominion, Mount Pearl, NL. There's no Ontario count without the dump. |
| Freshness | Dumps regenerated daily. Observations are sporadic. |
| Key fields | **`product_code` (GTIN, key)**, **`price` (key)**, **`currency` (key)**, **`date` (key)**, **`price_is_discounted` (key)**, `price_without_discount`, `price_per`, **`location_osm_id` / `location_osm_type` (key)**, `proof_id`, `source`. |
| Est. rows / size | Hundreds of Canadian rows today. Negligible size. |
| Verdict | **use**: free, open and GTIN-keyed (ODbL accepted, D1). Too thin to rely on. Prices from consenting users' receipts may be contributed back (D7). |

### S6 Statistics Canada table 18-10-0245-01 (monthly average retail prices)

| Field | Value |
|---|---|
| Provides | Monthly average retail prices for **110 products** (e.g. "Ground beef, per kilogram") across **13 geographies** (Canada plus provinces/territories, Ontario included): 1,308 series, Jan 2017 – Aug 2026. Source: WDS `getCubeMetadata`, 2026-10-26. |
| Licence | Statistics Canada Open Licence: "use, reproduce, publish, freely distribute, or sell the Information". Attribution: "Source: Statistics Canada, name of product, reference date." (or "Adapted from…"). https://www.statcan.gc.ca/en/terms-conditions/open-licence (checked 2026-10-26). |
| Terms on automated access | WDS is a documented public API, and the Open Licence grants reuse with no anti-automation clause (https://www.statcan.gc.ca/en/terms-conditions/open-licence, checked 2026-10-26). |
| robots.txt | `www150.statcan.gc.ca`: `Crawl-delay: 2` for `*`; disallows internal folders (`/stcsr/`, `/secure/`, …). The `/t1/wds/` API and `/n1/tbl/csv/` downloads aren't disallowed. |
| Access method | WDS REST API (`/t1/wds/rest/…`) or the full-table CSV ZIP. |
| Auth | None. |
| Rate limits | Respect `Crawl-delay: 2`. One request a month is enough. |
| Ontario coverage | Ontario series present (provincial level). Not store-specific. |
| Freshness | Monthly. Latest release 2026-10-07, reference month August 2026 (about 2 months of lag). |
| Key fields | **product name and unit (key)**, **geography (key)**, **reference month (key)**, **value (CAD, key)**, vector id. |
| Est. rows / size | About 220 Ontario + Canada series × monthly values, a few thousand rows. Under 1 MB. |
| Verdict | **use** as a **price-sanity reference** for validation (flag observations far from the Ontario average) and for context in the app. Not a store price. |

---

## 4. Retailers

Common facts:
- Every Ontario grocer below limits its site to **personal, non-commercial use** and forbids copying content without written permission.
- None publishes a product or price API or dataset.
- Several block non-browser clients outright (Akamai "Access Denied"), which per D-002 means **no workaround**.
- Store-specific prices are only shown after you pick a store.

Under CLAUDE.md ("Ask me before using a source whose terms prohibit automated access"), each grocer is listed for your decision in §7.

### S7 Loblaw banners: PC Express platform (Loblaws, No Frills, Fortinos, Zehrs, Real Canadian Superstore)

| Field | Value |
|---|---|
| Provides | Online catalogue per store: product tiles with name, brand, size, price, sale/"was" price, PC Optimum member price, unit price. The legacy worker read this (see `docs/legacy/CATALOG_REVIEW.md`). Online "prices … reflect the in-store prices of the selected store". |
| Licence | Proprietary. "Loblaws Inc. ("LINC") … are pleased to provide this mobile application or website (the "Application") for your personal, non-commercial use." Effective December 1, 2023. https://www.loblaws.ca/en/termsofuse (checked 2026-10-26; the same "Terms of use and PC Express terms and conditions" cover the PC Express banners). |
| Terms on automated access | No explicit robot clause. "you may not copy Proprietary Materials for commercial use", and "we routinely monitor the Application for suspicious activity" (same URL, checked 2026-10-26). Corporate site: "you may not copy material from this site for commercial use" (https://www.loblaw.ca/en/legal/, checked 2026-10-26). |
| robots.txt | Identical for loblaws.ca, nofrills.ca, fortinos.ca, zehrs.ca and realcanadiansuperstore.ca: `*` disallows `/cart/`, `/checkout/`, `/account/` and `/collections-id/` only. A sitemap is listed. pcexpress.ca returned 404 for robots.txt. The loblaws.ca sitemap has 1,592 URLs, all category/help pages and **0 product pages**. |
| Access method | HTML pages rendered client-side, plus an undocumented internal Next.js data route (what legacy used). No public API. |
| Auth | None to browse. Store selection by cookie. |
| Rate limits | Unknown: not published. In practice Akamai bot protection blocked the legacy worker in 7 of 12 jobs. |
| Ontario coverage | High: these banners run many Ontario stores, with per-store pricing. |
| Freshness | Live; prices change weekly or more often. |
| Key fields | store id (key), product id / article number (key), name, brand, package size, regular / sale / member price (key), unit price, promo end date. **No GTIN in listing tiles** (legacy: 0 of 96). |
| Est. rows / size | Unknown (no product sitemap). Tens of thousands of SKUs per banner, per store. |
| Verdict | **avoid** (owner decision D2, 2026-10-26): personal, non-commercial terms. No scraping and no workaround (D-002). Revisit only through written permission or a partnership. |

### S8 Sobeys group: Voilà, Sobeys, FreshCo, Foodland

| Field | Value |
|---|---|
| Provides | Voilà is the group's online grocery store in Ontario (catalogue and prices). sobeys.com, freshco.com and foodland.ca are banner sites (flyers, stores). |
| Licence | Proprietary. Voilà: "Your use of the Services is limited to personal and non-commercial use only, unless other use by you is specifically permitted by Sobeys in writing … you are not permitted to copy, modify, reuse, transmit, distribute or re-post any of the content displayed". https://voila.ca/content/terms-and-conditions--conditions-generales (checked 2026-10-26). |
| Terms on automated access | Voilà: no explicit robot clause; the copy/reuse ban above applies. sobeys.com / freshco.com / foodland.ca: **unknown**. Their terms couldn't be read because they returned Akamai "Access Denied" (403) to a plain request even for robots.txt, and the sobeys.com terms URL tried returned 404. |
| robots.txt | voila.ca: `*` disallows `/api/`, `/events/`, `/sso-login` and `/content/dp`; sitemap listed. sobeys.com, freshco.com, foodland.ca: **robots.txt itself blocked** (403 Access Denied, Akamai). |
| Access method | Voilà: HTML pages plus internal `/api/` (disallowed). Banner sites: HTML. No public API. |
| Auth | None to browse (Voilà needs a postal code / store for pricing). |
| Rate limits | Unknown: not published. Akamai blocks plain clients on three banner sites. |
| Ontario coverage | High: Voilà serves much of the GTA. FreshCo and Foodland have Ontario stores. Sobeys also owns Longo's and Farm Boy (see S12, S13). |
| Freshness | Live. |
| Key fields | product id (key), name, brand, size, price (key), promo (key), store/region (key). GTIN availability unknown (not inspected). |
| Est. rows / size | Unknown (not inspected; would need scraping). |
| Verdict | **avoid** (owner decision D2, 2026-10-26): personal, non-commercial terms. No scraping and no workaround (D-002). Revisit only through written permission or a partnership. |

### S9 Metro / Food Basics

| Field | Value |
|---|---|
| Provides | Online catalogue and flyers with prices per store (metro.ca; foodbasics.ca). |
| Licence | Proprietary. "Use of our Site is limited to personal, non-commercial use." "Any unauthorized use of the content of this Site, including any reproduction, distribution or redistribution … or downloading is prohibited without the prior written authorization of Metro." https://www.metro.ca/en/terms-of-use and https://www.foodbasics.ca/legal-notice (checked 2026-10-26; same text). |
| Terms on automated access | No explicit robot clause. The reproduction ban above applies (same URL, checked 2026-10-26). metro.ca returned 403 to a non-browser fetch of the terms page (bot protection). |
| robots.txt | Both disallow account/cart/checkout, plus `*page=*`, `*store_code=*`, `*keywords=*`, `*filter=*` and `*categories=*`. So **paginated listings and store-specific URLs are disallowed**. Sitemaps listed. |
| Access method | HTML. No public API. |
| Auth | None to browse. |
| Rate limits | Unknown: not published. Bot protection on metro.ca. |
| Ontario coverage | High (Metro and Food Basics both have many Ontario stores). |
| Freshness | Live; weekly flyers. |
| Key fields | product id (key), name, brand, size, price (key), store (key). GTIN: unknown (not inspected). |
| Est. rows / size | Unknown (not inspected). |
| Verdict | **avoid** (owner decision D2, 2026-10-26): personal, non-commercial terms. No scraping and no workaround (D-002). Revisit only through written permission or a partnership. |

### S10 Walmart.ca

| Field | Value |
|---|---|
| Provides | Online grocery and general merchandise with prices. |
| Licence | Unknown: the Canadian terms page couldn't be found. `/en/help/terms-of-use` says "This page no longer exists" and `/en/terms-of-use` returns 404 (checked 2026-10-26). Third-party summaries of walmart.com's (US) terms report an explicit ban on robots, spiders and scraping. That isn't verified for walmart.ca. |
| Terms on automated access | Unknown (as above). A non-browser fetch got a "Verify Your Identity … press and hold" bot challenge (PerimeterX-style), i.e. active bot protection. |
| robots.txt | `*` disallows `/search/*`, `/ws/*`, `/en/ip/*` (product pages; `/en/ip/*/*` allowed), cart and account. Sitemaps for categories and brands. |
| Access method | HTML behind a bot challenge. No public API for prices. |
| Auth | None to browse. |
| Rate limits | Unknown: not published. Bot challenge. |
| Ontario coverage | High (many Ontario stores). |
| Freshness | Live. |
| Key fields | product id (key), name, brand, price (key), store (key). |
| Est. rows / size | Unknown (not inspected). |
| Verdict | **avoid** (owner confirmed, D2): active bot challenge (D-002), and the terms couldn't be confirmed. |

### S11 Costco.ca

| Field | Value |
|---|---|
| Provides | Online product catalogue with prices (warehouse prices differ). |
| Licence | Proprietary. "TERMS AND CONDITIONS OF USE, JUNE 1, 2024". https://www.costco.ca/terms-and-conditions-of-use.html (checked 2026-10-26). |
| Terms on automated access | **Explicitly prohibited:** "(f) use of any data mining, bots, spiders, automated tools or similar data gathering and extraction methods … to scrape or collect any information from the Sites", and "(d) the collection, use or disclosure of any product listings, prices or descriptions". Same URL, checked 2026-10-26. |
| robots.txt | `*` disallows account, checkout and error views, plus `/*?*pageSize=*` and `/*?*sortBy=*`. |
| Access method | HTML. No public API. |
| Auth | Membership for purchases; browsing is open. |
| Rate limits | Unknown: not published. |
| Ontario coverage | Medium (a few dozen large warehouses; bulk sizes). |
| Freshness | Live. |
| Key fields | item number (key), name, price (key). |
| Est. rows / size | Unknown (not inspected). |
| Verdict | **avoid** (owner confirmed, D2): the terms explicitly ban bots and collecting prices. |

### S12 Longo's

| Field | Value |
|---|---|
| Provides | Online grocery and flyers (GTA). |
| Licence | Proprietary. "Your use of the Services is limited to personal and non-commercial use only, unless other use by you is specifically permitted by Longo's in writing … you are not permitted to copy, modify, reuse, transmit, distribute or re-post any of the content displayed". https://www.longos.com/terms-of-service/ (checked 2026-10-26). |
| Terms on automated access | No explicit robot clause. The copy/reuse ban above applies (same URL, checked 2026-10-26). |
| robots.txt | **Blocked**: robots.txt returned 403 Akamai "Access Denied" to a plain request. The site opened normally in a browser. |
| Access method | HTML. No public API. |
| Auth | None to browse. |
| Rate limits | Unknown: not published. Akamai blocks plain clients. |
| Ontario coverage | GTA only (a few dozen stores). |
| Freshness | Live. |
| Key fields | product id (key), name, price (key), store (key). |
| Est. rows / size | Unknown (not inspected). |
| Verdict | **avoid** (owner decision D2, 2026-10-26): personal, non-commercial terms. No scraping and no workaround (D-002). Revisit only through written permission or a partnership. |

### S13 Farm Boy

| Field | Value |
|---|---|
| Provides | Weekly flyer specials and store info (Ontario). No full online catalogue with prices was seen on the home page. |
| Licence | Proprietary. "Your use of the Services is limited to personal and non-commercial use only, unless other use by you is specifically permitted by Farm Boy in writing … you are not permitted to copy, modify, reuse, transmit, distribute or re-post any of the content displayed". https://www.farmboy.ca/terms-conditions/ (checked 2026-10-26). |
| Terms on automated access | No explicit robot clause. The copy/reuse ban above applies (same URL, checked 2026-10-26). |
| robots.txt | `*` allows most pages with **`Crawl-delay: 10`**; disallows `/wp-admin/` and WooCommerce paths. Sitemap listed. |
| Access method | HTML (WordPress / WooCommerce). |
| Auth | None. |
| Rate limits | `Crawl-delay: 10` (robots.txt). |
| Ontario coverage | Medium (Ontario-only chain). |
| Freshness | Weekly flyer. |
| Key fields | product name, price (key), flyer dates (key). |
| Est. rows / size | Flyer items only: about 100 a week (estimate from a typical flyer, not measured). |
| Verdict | **avoid** (owner decision D2, 2026-10-26): personal, non-commercial terms. No scraping and no workaround (D-002). Revisit only through written permission or a partnership. |

### S14 Giant Tiger

| Field | Value |
|---|---|
| Provides | Online store (Shopify) with prices, including some grocery. |
| Licence | Proprietary. "intended to be for your personal, non-commercial use only"; content "may not be copied (except for viewing of this website pursuant to these terms) … without prior express written permission from Giant Tiger". https://www.gianttiger.com/policies/terms-of-service (checked 2026-10-26; no effective date shown). |
| Terms on automated access | No explicit robot clause. The copy ban above applies (same URL, checked 2026-10-26). |
| robots.txt | Shopify default plus extras: `*` disallows admin, cart, checkout, account, sorted/filtered collection URLs and `/policies/`. |
| Access method | HTML (Shopify). No documented public API. |
| Auth | None. |
| Rate limits | Unknown: not published. |
| Ontario coverage | Medium (many Ontario stores; online prices may not match store prices; unverified). |
| Freshness | Live. |
| Key fields | product handle/id (key), title, price (key). |
| Est. rows / size | Unknown (not inspected). |
| Verdict | **avoid** (owner decision D2, 2026-10-26): personal, non-commercial terms. No scraping and no workaround (D-002). Revisit only through written permission or a partnership. |

### S15 Flipp (flyer aggregator)

| Field | Value |
|---|---|
| Provides | Digital weekly flyers for most Canadian grocers, by postal code. Item-level prices for promoted items. |
| Licence | Unknown: Flipp's terms page couldn't be found. `flipp.com/en-ca/terms-of-use` showed an error page and `/en-ca/terms` redirected to the flyer home page (checked 2026-10-26). Flyer content belongs to the retailers. |
| Terms on automated access | Unknown (as above). No public API documented. |
| robots.txt | `*` disallows `/fr-ca/browser/`, many French flyer paths and item paths `/*-*/*-*/item/45*`; Baiduspider is fully disallowed. |
| Access method | Client-rendered web app plus undocumented internal APIs. No public API. |
| Auth | None to browse. |
| Rate limits | Unknown: not published. |
| Ontario coverage | High for promoted items across most chains. Not full catalogues. |
| Freshness | Weekly (flyer cycle). |
| Key fields | merchant (key), flyer validity dates (key), item name, sale price (key), postal-code region (key). No GTIN. |
| Est. rows / size | Unknown: thousands of items a week across Ontario chains (estimate, not measured). |
| Verdict | **avoid** (owner decision D3): no scraping. A data partnership isn't being pursued for now. |

### S16 Reebee (flyer aggregator)

| Field | Value |
|---|---|
| Provides | Digital flyers (Canada). |
| Licence | Unknown: terms not found. reebee.com serves **the same robots.txt as flipp.com** (byte-identical, 987 bytes), so it appears to run on the Flipp platform. |
| Terms on automated access | Unknown (as above). |
| robots.txt | Identical to S15. |
| Access method | Web app (same platform as S15). |
| Auth | None to browse. |
| Rate limits | Unknown: not published. |
| Ontario coverage | Unknown: assumed to overlap with Flipp. |
| Freshness | Weekly. |
| Key fields | Same as S15. |
| Est. rows / size | Unknown (not inspected). |
| Verdict | **avoid**: it duplicates S15, which is avoided (D3). |

---

## 5. Ownership

### S17 Wikidata: SPARQL query service

| Field | Value |
|---|---|
| Provides | Brand → owner company → parent chains with dates: P127 owned by, P749 parent organization, P355 subsidiary, P1830 owner of, P580/P582 start/end qualifiers, P571 inception. Stable QIDs, external IDs (e.g. P1320 OpenCorporates, P5531 SEC CIK) and official websites. |
| Licence | CC0: "All structured data … is released into the public domain". https://www.wikidata.org/wiki/Wikidata:Licensing (checked 2026-10-26). |
| Terms on automated access | Allowed within limits: "One client (user agent + IP) is allowed 60 seconds of processing time each 60 seconds", "limited to 5 parallel queries per IP", and "Clients who don't comply with the User-Agent policy may be blocked completely". https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual (checked 2026-10-26). User-Agent policy: "Scripts should use an informative User-Agent string with contact information, or they may be blocked without notice" (https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy, checked 2026-10-26). |
| robots.txt | `query.wikidata.org` disallows `/sparql` and `/bigdata` for crawlers. That stops indexing; the documented query service is meant for programmatic use under the limits above. `www.wikidata.org` disallows `/w/` and `/api/` for crawlers. |
| Access method | SPARQL endpoint (`https://query.wikidata.org/sparql`, GET for small queries, POST for large); entity JSON for single items. |
| Auth | None (informative User-Agent required). |
| Rate limits | 60 s of query time per minute per client; 5 parallel per IP; 30 errors/min; 60 s timeout per query; 429 with `Retry-After`. |
| Ontario coverage | Global. Good for multinationals; patchy for small Canadian brands. |
| Freshness | Live (edits appear within minutes). |
| Key fields | **QID (key)**, **label / aliases (key)**, **P127 / P749 / P355 edges (key)**, **P580 / P582 dates (key)**, P17 country, P856 website, P1320 / P5531 cross-IDs. |
| Est. rows / size | Targeted queries for brands matched from S1 brand strings: a few thousand items and edges. Under 5 MB. |
| Verdict | **use**: the main ownership source (PLAN Phase 3). |

### S18 Wikidata: dumps

| Field | Value |
|---|---|
| Provides | The full Wikidata graph (JSON/RDF). |
| Licence | CC0 (as S17). |
| Terms on automated access | Bulk download is the intended use of dumps.wikimedia.org: the WDQS manual points there for loading all of Wikidata (https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual, checked 2026-10-26). |
| robots.txt | Not fetched. Not needed: dumps are plain file downloads, and this source is avoided. |
| Access method | Bulk dump. |
| Auth | None. |
| Rate limits | Download bandwidth only (not checked). |
| Ontario coverage | Global. |
| Freshness | Weekly dumps (not checked). |
| Key fields | Same as S17. |
| Est. rows / size | Over 100 GB uncompressed (estimate). Far beyond a free Actions runner's working budget and the D-010 plan. |
| Verdict | **avoid**: S17 targeted queries cover our needs. Revisit only if SPARQL limits bite. |

### S19 Wikipedia (REST / Action API)

| Field | Value |
|---|---|
| Provides | Company summaries, infobox facts (owner, parent, subsidiaries) and links for the company page. Fallback evidence for ownership. |
| Licence | Text under CC BY-SA 4.0 (and GFDL): "To re-distribute text on Wikipedia in any form, provide credit to the authors" via "a hyperlink … or URL to the page". https://en.wikipedia.org/wiki/Wikipedia:Copyrights (checked 2026-10-26). |
| Terms on automated access | Allowed with etiquette: "There is no hard speed limit on read requests, but be considerate and try not to take a site down"; send requests serially; "you should use the `maxlag` parameter" for non-interactive tasks; cache. https://www.mediawiki.org/wiki/API:Etiquette (checked 2026-10-26). User-Agent policy as S17. |
| robots.txt | Crawlers are disallowed from `/w/` and `/api/` (API use is governed by API etiquette, not crawling rules). Article pages are allowed. |
| Access method | REST API (`/api/rest_v1/page/summary/{title}`) and Action API. |
| Auth | None (informative User-Agent required). |
| Rate limits | No hard read limit; serial requests, `maxlag`, cache. |
| Ontario coverage | Good for large companies; thin for small Ontario brands. |
| Freshness | Live. |
| Key fields | page title (key), summary extract, page URL (key; attribution), revision id (key; provenance). |
| Est. rows / size | One summary per company: a few thousand rows of about 1–2 KB. A few MB. |
| Verdict | **use**: attribution and a link back are shown in the app. |

### S20 SEC EDGAR (Exhibit 21 subsidiary lists)

| Field | Value |
|---|---|
| Provides | Annual 10-K filings of US-listed companies. Exhibit 21 lists subsidiaries (e.g. food multinationals that own brands sold in Ontario). |
| Licence | Public filings: "Anyone can access and download this information for free." https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data (checked 2026-10-26). |
| Terms on automated access | Allowed under the Fair Access policy: "Current max request rate: 10 requests/second", and "Please declare your user agent in request headers" (same URL, checked 2026-10-26). |
| robots.txt | `www.sec.gov` disallows only site-framework folders (`/core/`, `/profiles/`, READMEs). `/Archives/` and `data.sec.gov` APIs aren't disallowed. |
| Access method | REST JSON (`data.sec.gov/submissions/CIK##########.json`) plus filing archives (`/Archives/edgar/…`). |
| Auth | None (declared User-Agent required). |
| Rate limits | 10 requests/second maximum (we'd stay at about 1/s per CLAUDE.md). |
| Ontario coverage | Only US-listed parents (many large CPG owners). Not Canadian-only companies. |
| Freshness | Annual (10-K cycle). |
| Key fields | **CIK (key)**, company name (key), filing accession number and date (key; provenance), Exhibit 21 subsidiary names (key) and jurisdictions. |
| Est. rows / size | About 50–100 parent companies × tens to hundreds of subsidiaries each. Under 5 MB. |
| Verdict | **use**: authoritative evidence for parent → subsidiary edges. Exhibit 21 is free text, so parsing goes to the review queue. |

### S21 Corporations Canada: federal corporations open data

| Field | Value |
|---|---|
| Provides | Federal corporations (CBCA, not-for-profits, co-ops), active and inactive, from Innovation, Science and Economic Development Canada. Useful to confirm a Canadian company's legal name and status. |
| Licence | "Open Government Licence – Canada": "worldwide, royalty-free, perpetual, non-exclusive licence to use the Information … including for commercial purposes". Attribution: "Contains information licensed under the Open Government Licence – Canada." https://open.canada.ca/en/open-government-licence-canada (checked 2026-10-26). Dataset: https://open.canada.ca/data/en/dataset/0032ce54-c5dd-4b66-99a0-320a7b5e99f2 (checked 2026-10-26). |
| Terms on automated access | Licensed open data for download. The Open Government Licence – Canada has no anti-automation clause (https://open.canada.ca/en/open-government-licence-canada, checked 2026-10-26). |
| robots.txt | `open.canada.ca`: `Crawl-delay: 20`; disallows framework folders only. `ised-isde.canada.ca` sets crawl delays for named bots only. |
| Access method | Bulk CSV (four subsets, EN/FR) plus an API (documented separately). |
| Auth | None for the CSVs. API auth unknown (not checked: low priority). |
| Rate limits | Respect `Crawl-delay: 20`; bulk files only. |
| Ontario coverage | Federal corporations only (excludes Ontario-incorporated companies and financial institutions). |
| Freshness | "Files are typically updated daily." |
| Key fields | Unknown: the dataset page doesn't list its fields. A corporation number (key) and legal name are expected; confirm when building. |
| Est. rows / size | Unknown: not stated. Process on the runner; store only matches (a few hundred rows). |
| Verdict | **use**, low priority: an identity check, not an ownership graph. |

### S22 OpenCorporates API

| Field | Value |
|---|---|
| Provides | Global company registry records, some ownership/control statements. |
| Licence | "the share-alike attribution Open Database Licence". Free accounts only "if you are going to be using the data in an open data project or product". Paid accounts "remove the OpenCorporates share-alike restrictions". https://api.opencorporates.com/documentation/API-Reference (checked 2026-10-26). |
| Terms on automated access | API use with a token: "An API key is required in order to use the OpenCorporates API." (https://api.opencorporates.com/documentation/API-Reference, checked 2026-10-26). |
| robots.txt | Disallows `/data`, `/officers`, `/search`, `/statements`, `/networks`, pagination; GPTBot fully disallowed. |
| Access method | REST API (token). |
| Auth | API token. |
| Rate limits | Default "up to 200 requests per month, and 50 requests per day". |
| Ontario coverage | Includes Ontario and federal registries. |
| Freshness | Varies by registry (not checked). |
| Key fields | jurisdiction code + company number (key), name, status. |
| Est. rows / size | Capped by 200 requests a month. Negligible. |
| Verdict | **avoid** for now: the limits are too low and the free tier needs an open licence. Revisit if D1 makes the catalog open (ODbL) anyway. |

---

## 6. Ratings evidence and articles

### S23 GDELT DOC 2.0 API

| Field | Value |
|---|---|
| Provides | Searchable index of worldwide online news: article URL, title, date, source, language and country, with theme filters (e.g. labour, environment). Gives links; we don't store full text. |
| Licence | "all datasets released by the GDELT Project are available for unlimited and unrestricted use for any academic, commercial, or governmental use of any kind without fee"; "any use or redistribution of the data must include a citation to the GDELT Project and a link to this website". https://www.gdeltproject.org/about.html (checked 2026-10-26). |
| Terms on automated access | Allowed: "unlimited and unrestricted use" (https://www.gdeltproject.org/about.html, checked 2026-10-26). |
| robots.txt | `www.gdeltproject.org` disallows `/data/` only. `api.gdeltproject.org/robots.txt` returns 404, so there are no restrictions. |
| Access method | REST API (`api.gdeltproject.org/api/v2/doc/doc?query=…&mode=ArtList&format=json`). |
| Auth | None. |
| Rate limits | Unknown: none stated in the DOC 2.0 announcement. Use about 1/s and cache. |
| Ontario coverage | Global news including Canadian outlets (`sourcecountry:` filter). |
| Freshness | Updated continuously. Searches cover a rolling **3 months** (https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/), so a scheduled job must collect regularly or miss items. |
| Key fields | **article URL (key)**, **title (key)**, **seendate (key)**, domain/source (key), language, sourcecountry. |
| Est. rows / size | Matched articles only: about 10–50 per company per quarter × a few thousand companies. Tens of MB at most; a retention cap is needed (P0.11). |
| Verdict | **use**: the main article discovery feed (Phase 7), with relevance and good/bad tagging into the review queue. |

### S24 Publisher RSS feeds (e.g. CBC, Globe and Mail, trade press)

| Field | Value |
|---|---|
| Provides | Headlines, links, dates and short summaries from chosen outlets. |
| Licence | Varies by publisher. Unknown for the example checked: https://www.cbc.ca/rss/ returned 403 to a non-browser fetch (checked 2026-10-26). |
| Terms on automated access | Varies by publisher (RSS is meant for automated reading, but reuse terms differ). Unknown for CBC (as above). |
| robots.txt | Varies by publisher (not fetched per feed: no feed list chosen yet). |
| Access method | RSS/Atom. |
| Auth | None. |
| Rate limits | Per publisher. Poll at most hourly. |
| Ontario coverage | Good for Canadian outlets. |
| Freshness | Live. |
| Key fields | item link (key), title (key), pubDate (key), feed/source (key). |
| Est. rows / size | Small (store only matched items: headline, link, date). |
| Verdict | **use** with a provisional feed list (D4, owner to narrow it later): CBC News Business, The Globe and Mail (Report on Business), Financial Post, Canadian Grocer (trade), Food in Canada (trade), The Narwhal (environment). Before any feed is added in Phase 7, check its terms and robots.txt and record them here. Store only headline, link and date, never full text. |

### S25 Google News RSS

| Field | Value |
|---|---|
| Provides | Aggregated news search results as RSS. |
| Licence | Unknown: Google's terms page wasn't fetched, because robots.txt alone rules this source out (checked 2026-10-26). |
| Terms on automated access | robots.txt forbids it (below). |
| robots.txt | `news.google.com`: `*` → `Disallow: /`, with Allow only for `/`, `/home`, `/topics/`, `/publications/`, `/stories/`, `/about`, `/swg/`. **`/rss` is not allowed.** ClaudeBot, GPTBot, CCBot and other AI agents are fully disallowed. |
| Access method | RSS (`/rss/search?q=…`). |
| Auth | None. |
| Rate limits | Unknown: not published. |
| Ontario coverage | Good (Canadian edition). |
| Freshness | Live. |
| Key fields | link, title, pubDate, source. |
| Est. rows / size | Not applicable (avoided). |
| Verdict | **avoid**: robots.txt disallows the RSS path. |

### S26 NewsAPI (Developer, free)

| Field | Value |
|---|---|
| Provides | Article search across many publishers. |
| Licence | Commercial service. Free plan "cannot be used in a staging or production environment"; the cheapest paid plan is "$449" a month. https://newsapi.org/pricing (checked 2026-10-26). |
| Terms on automated access | API use is the intended access, but the free tier is development-only (above). |
| robots.txt | Disallows `/v1/` and `/v2/` for crawlers (the API paths; the API is used with a key, not crawled). |
| Access method | REST API. |
| Auth | API key. |
| Rate limits | "100 requests per day"; "Articles have a 24 hour delay"; "Search articles up to a month old". |
| Ontario coverage | Includes Canadian sources. |
| Freshness | 24-hour delay on the free tier. |
| Key fields | url, title, publishedAt, source. |
| Est. rows / size | Not applicable (avoided). |
| Verdict | **avoid**: the free tier forbids production use and paid is $449 a month. |

### S27 B Corp directory (B Lab)

| Field | Value |
|---|---|
| Provides | Certified B Corporations, with overall B Impact score and certification status. Positive evidence for scores. |
| Licence | Proprietary. "These Terms of Use permit You to use the Website for Your personal, non-commercial use only." Last updated August 25, 2026. https://www.bcorporation.net/en-us/terms-of-use/ (checked 2026-10-26). The open "B Corp Impact Data" set on data.world is retired: "the open data community datasets are no longer accessible or available for download" (https://data.world/blab/b-corp-impact-data, checked 2026-10-26). |
| Terms on automated access | **Explicitly prohibited:** "Use any robot, spider or other automatic device, process or means to access the Website for any purpose, including monitoring or copying any of the material on the Website. Use any manual process to monitor or copy any of the material on the Website … without our prior written consent" (same URL, checked 2026-10-26). |
| robots.txt | `*` → `Allow: /` (permissive, but the terms override it). |
| Access method | HTML directory. No public API. |
| Auth | None to browse. |
| Rate limits | Unknown: not published. Non-browser fetches got 403. |
| Ontario coverage | Includes Canadian and Ontario B Corps (a minority of grocery brands). |
| Freshness | Live (certifications renew every 3 years). |
| Key fields | company name (key), certification status and date (key), overall score, directory URL (key; citation). |
| Est. rows / size | A few hundred relevant companies at most. Small. |
| Verdict | **manual only** (owner decision D6): automated access is banned. An admin records B Corp status per company with the directory URL as the citation. No bulk import. |

### S28 Fairtrade Canada: brand and product finder

| Field | Value |
|---|---|
| Provides | Fairtrade-certified brands and products sold in Canada: positive evidence (certification). |
| Licence | Unknown: the Fairtrade Canada site (now `fairtrade.net/ca-en`) shows no reuse terms on the home or policies pages fetched (https://fairtrade.net/ca-en.html, https://www.fairtrade.net/ca-en/policies.html, checked 2026-10-26). |
| Terms on automated access | Unknown (as above). |
| robots.txt | Unknown: `fairtrade.ca/robots.txt` returned the HTML home page (redirect to fairtrade.net), not a robots file. The fairtrade.net robots.txt wasn't fetched. |
| Access method | HTML finder (https://www.fairtrade.net/ca-en/products/fairtrade-local.html). |
| Auth | None. |
| Rate limits | Unknown (not published). |
| Ontario coverage | National brand list (includes brands sold in Ontario). |
| Freshness | Unknown (not stated). |
| Key fields | brand name (key), product category, certification (key), page URL (key; citation). |
| Est. rows / size | Small (dozens to a few hundred brands, estimated). |
| Verdict | **manual only** (owner decision D6): an admin records Fairtrade certification per brand with the finder URL as the citation. No bulk import. |

### S29 KnowTheChain benchmarks (Business & Human Rights Resource Centre)

| Field | Value |
|---|---|
| Provides | Forced-labour benchmark scores for large food and beverage companies (2026 edition: 45 companies). Labour-category evidence. |
| Licence | Unknown: no licence or reuse terms stated on https://www.business-humanrights.org/en/from-us/knowthechain/ (checked 2026-10-26). |
| Terms on automated access | Unknown: no terms published on the page. Data access is gated behind an email sign-up ("Access data" goes to a Mailchimp form). |
| robots.txt | Unknown: `knowthechain.org/robots.txt` returned an HTML page (the site redirects to business-humanrights.org). That site's robots.txt wasn't fetched. |
| Access method | Published reports and scorecards (HTML/PDF); data on request. |
| Auth | Email sign-up for data. |
| Rate limits | Not applicable (manual). |
| Ontario coverage | Multinationals whose brands are sold in Ontario (company list not confirmed). |
| Freshness | Benchmark every 2–3 years (food and beverage 2026). |
| Key fields | company (key), benchmark year (key), score (key), report URL (key; citation). |
| Est. rows / size | 45 companies per edition. Tiny. |
| Verdict | **manual only** (owner decision D6): an admin cites the public benchmark report per company. No bulk import. |

### S30 Ethical Consumer

| Field | Value |
|---|---|
| Provides | Company ethical ratings and shopping guides (UK). |
| Licence | Paid subscription: "£39.50" (direct debit) / "£45.50" a year for "12 months full access to all Shopping Guides and Company Profiles". No API or data-licensing offer listed. https://www.ethicalconsumer.org/subscriptions (checked 2026-10-26). |
| Terms on automated access | Unknown: not stated on the subscriptions page. Content is behind a paywall. |
| robots.txt | Disallows `/search/`, `/stories/`, user and admin paths. |
| Access method | Paywalled HTML. |
| Auth | Subscription login. |
| Rate limits | Not applicable. |
| Ontario coverage | UK-focused; overlaps for multinationals. |
| Freshness | Ongoing. |
| Key fields | company, rating, category scores. |
| Est. rows / size | Not applicable (avoided). |
| Verdict | **avoid**: paid. Note only. |

---

## 7. Decisions for owner

**Answered 2026-10-26** (recorded as DECISIONS.md D-013). The original questions are kept below with each answer.

| # | Answer |
|---|---|
| D1 | **Accept** ODbL share-alike for OFF / Open Prices data. |
| D2 | **Avoid all** Ontario grocer websites (S7, S8, S9, S12, S13, S14). S10 Walmart.ca and S11 Costco.ca avoided too. |
| D3 | **No** Flipp scraping, and no data partnership for now. |
| D4 | I pick a provisional feed list (S24); the owner narrows it later. |
| D5 | **Skip** UPCitemdb. |
| D6 | **Manual** citation per company for B Corp, Fairtrade and KnowTheChain. |
| D7 | **Yes**: receipts are the main store-price source, and consenting users' prices may go to Open Prices. The consent wording is still a Phase 8 task. |

**Answered 2026-10-27, amended 2026-10-29** (DECISIONS.md D-015):
- **User-Agent contact:** the repo URL. Sources that ask for an email (OFF, SEC EDGAR) get the owner's email from `.env` (`PIPELINE_CONTACT_EMAIL`), never committed.
- **Commercial status:** non-commercial for now and probably for a year or more, but it may become commercial. Prefer licences that allow commercial use; keep non-commercial-only data separable.

### Original questions


Answer these before any P3 retailer task (PLAN P0.10 🟡). Each item names its sources.

- **D1. Open Food Facts / Open Prices licence (ODbL share-alike): S1, S2, S5.** If Sarvis publicly uses a database adapted from OFF or Open Prices, that adapted database must be offered under the ODbL. Open Prices also asks us to avoid combining it with non-free data we can't release openly.
  - **(a)** Accept: keep OFF-derived tables separable and publish an ODbL extract. Show attribution in the app.
  - **(b)** Use OFF only as a lookup, without a stored, merged catalog. That loses most of the coverage.
  - *Recommendation:* (a). It also opens the option of contributing receipt prices back to Open Prices (see D7).
- **D2. Ontario grocers: S7 Loblaw banners, S8 Sobeys group, S9 Metro / Food Basics, S12 Longo's, S13 Farm Boy, S14 Giant Tiger.** All restrict their sites to personal, non-commercial use and ban copying. S7, S8 and S12 add Akamai blocking, and S9's robots.txt disallows pagination and store parameters.
  - *Recommendation:* **avoid all** under D-002. If you want a retailer, the route is to ask for written permission or a data partnership. Tell me which to approach and I'll draft the request.
  - Also please confirm **avoid** for **S10 Walmart.ca** (bot challenge; terms not found) and **S11 Costco.ca** (explicit ban on bots and price collection).
- **D3. Flipp: S15 (and S16 Reebee).** Flyer prices cover most chains, but there's no public API and the terms couldn't be found.
  - *Recommendation:* no scraping. Optionally send a partnership request.
- **D4. Publisher RSS: S24.** Approve a short list of outlets (e.g. CBC Business, Globe and Mail, trade press). I'd then check each feed's terms and store only headline, link and date.
- **D5. UPCitemdb: S3.** Use the free tier (100 lookups a day) as a second barcode fallback?
  - *Recommendation:* skip for now. The storage and display rights are unclear and the value next to OFF is low.
- **D6. Certification evidence: S27 B Corp, S28 Fairtrade, S29 KnowTheChain.**
  - B Corp bans automated *and* manual copying without consent.
  - Fairtrade's terms are unknown.
  - KnowTheChain's data is behind a sign-up.
  - *Recommendation:* cite their public pages manually per company with a URL, and ask B Lab for consent if you want B Corp status at scale.
- **D7. Receipt prices (existing D-002 follow-up, Phase 8).** With retailers avoided, users' receipts are the main source of real store prices. Confirm that this remains the plan, and whether consenting users' prices may also be contributed back to Open Prices (ties to D1).
