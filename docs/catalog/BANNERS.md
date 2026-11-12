# Banners (P4.29)

The retail banners Sarvis knows, each with the company that operates it. Store rows, store listings, receipt headers and price rollups all key on a banner (DATA_MODEL §3.4). `banners` has 0 rows until the owner approves this list. After approval, `pipeline job banner-seed` writes it through the `manual` source.

**Status:** draft, 2026-11-11. Waiting on the owner (PROGRESS, "Waiting on Luka").

## Rules (D-098, Proposed)

- **Operator** = the company that controls the stores under the banner, at group level: Loblaw Companies, Metro, Sobeys, and so on. That holds whether the group owns the banner outright, holds a majority (Longo's 51%, Marché Adonis 55.5%), or franchises it (Valu-mart, Your Independent Grocer, IGA).
- The Wikidata company rows named after a banner (`no-frills`, `food-basics`, `farm-boy`, …) are **not** used as operators. They duplicate the banner, and some have no edge to their group: `farm-boy` and `longos` are their own top parents today. With the group as operator, the top parent is right without new ownership edges.
- **Spellings** are what the matcher and the receipt parser compare against: the banner name, its short forms, and its other-language name. The job compares them case-, accent- and punctuation-insensitively, so `NO FRILLS` and `No Frills` are one spelling. They're stored in a new `banners.aliases text[]` column (mirrors `brands.aliases`; the migration ships with the write).
- **Store links:** a store gets a banner when its name, folded the same way, **starts with** a spelling followed by a word break (`Thrifty Foods James Bay` → Thrifty Foods). The longest spelling wins (`Costco Business Center` beats `Costco`). A store already linked, or with `banner_id` locked, is left alone.
- `country` is `CA` for every row. `website` is the banner's Canadian home page.

## The list (40 banners)

✔ = the citation was opened and read on 2026-11-11 and supports the operator.

### Loblaw Companies (`loblaw-companies`), 14

| Slug | Name | Spellings | Citation |
|---|---|---|---|
| `loblaws` | Loblaws | Loblaws, Loblaw | ✔ https://en.wikipedia.org/wiki/Loblaw_Companies |
| `no-frills` | No Frills | No Frills, NoFrills, Nofrills | ✔ https://en.wikipedia.org/wiki/Loblaw_Companies |
| `real-canadian-superstore` | Real Canadian Superstore | Real Canadian Superstore, Superstore, RCSS | ✔ https://en.wikipedia.org/wiki/Real_Canadian_Superstore |
| `fortinos` | Fortinos | Fortinos, Fortino's | ✔ https://en.wikipedia.org/wiki/Loblaw_Companies |
| `zehrs` | Zehrs | Zehrs, Zehrs Markets | ✔ https://en.wikipedia.org/wiki/Loblaw_Companies |
| `valu-mart` | Valu-mart | Valu-mart, Valumart | ✔ https://en.wikipedia.org/wiki/Valu-mart (franchised) |
| `your-independent-grocer` | Your Independent Grocer | Your Independent Grocer, Independent Grocer, YIG | ✔ https://en.wikipedia.org/wiki/Your_Independent_Grocer (franchised) |
| `real-canadian-wholesale-club` | Real Canadian Wholesale Club | Real Canadian Wholesale Club, Wholesale Club | ✔ https://en.wikipedia.org/wiki/Loblaw_Companies |
| `provigo` | Provigo | Provigo | ✔ https://en.wikipedia.org/wiki/Loblaw_Companies |
| `maxi` | Maxi | Maxi, Maxi & Cie | ✔ https://en.wikipedia.org/wiki/Loblaw_Companies |
| `dominion` | Dominion | Dominion | ✔ https://en.wikipedia.org/wiki/Dominion_Stores_(Newfoundland) (Newfoundland and Labrador only) |
| `t-and-t` | T&T Supermarket | T&T Supermarket, T&T, 大統華, 大統華 T&T Supermarket | ✔ https://en.wikipedia.org/wiki/T%26T_Supermarket (Loblaw since 2009) |
| `shoppers-drug-mart` | Shoppers Drug Mart | Shoppers Drug Mart, Shoppers, SDM | ✔ https://en.wikipedia.org/wiki/Shoppers_Drug_Mart (Loblaw since 2014) |
| `pharmaprix` | Pharmaprix | Pharmaprix | ✔ https://en.wikipedia.org/wiki/Shoppers_Drug_Mart ("named Pharmaprix in Quebec") |

### Metro (`metro`, Metro Inc.), 5

| Slug | Name | Spellings | Citation |
|---|---|---|---|
| `metro` | Metro | Metro, Metro Plus | ✔ https://en.wikipedia.org/wiki/Metro_Inc. |
| `food-basics` | Food Basics | Food Basics | ✔ https://en.wikipedia.org/wiki/Metro_Inc. |
| `super-c` | Super C | Super C | ✔ https://en.wikipedia.org/wiki/Metro_Inc. |
| `marche-adonis` | Marché Adonis | Marché Adonis, Adonis | ✔ https://en.wikipedia.org/wiki/Metro_Inc. (55.5% since 2011) |
| `jean-coutu` | Jean Coutu | Jean Coutu, PJC Jean Coutu | ✔ https://en.wikipedia.org/wiki/Metro_Inc. (Metro since 2018) |

### Sobeys (`sobeys`, wholly owned by Empire Company), 5, and Empire Company (`empire-company`), 2

| Slug | Name | Operator | Spellings | Citation |
|---|---|---|---|---|
| `sobeys` | Sobeys | `sobeys` | Sobeys, Sobey's | ✔ https://en.wikipedia.org/wiki/Sobeys |
| `freshco` | FreshCo | `sobeys` | FreshCo, Fresh Co | ✔ https://en.wikipedia.org/wiki/Sobeys |
| `foodland` | Foodland | `sobeys` | Foodland | ✔ https://en.wikipedia.org/wiki/Sobeys |
| `iga` | IGA | `sobeys` | IGA, IGA Extra | ✔ https://en.wikipedia.org/wiki/IGA,_Inc. ("supplied by Sobeys, which franchises the name"; Quebec stores are independently owned franchisees) |
| `thrifty-foods` | Thrifty Foods | `sobeys` | Thrifty Foods | ✔ https://en.wikipedia.org/wiki/Thrifty_Foods |
| `farm-boy` | Farm Boy | `empire-company` | Farm Boy, Farmboy | ✔ https://en.wikipedia.org/wiki/Farm_Boy ("majority owned by … Empire Company Ltd." since 2018) |
| `longos` | Longo's | `empire-company` | Longo's, Longos | ✔ https://en.wikipedia.org/wiki/Longo%27s (Empire 51%, Longo family 49%, since 2021) |

### Other operators, 14

| Slug | Name | Operator | Spellings | Citation |
|---|---|---|---|---|
| `walmart` | Walmart | `walmart-canada` | Walmart, Walmart Supercentre, Wal-Mart | ✔ https://en.wikipedia.org/wiki/Walmart_Canada |
| `costco` | Costco | `costco` | Costco, Costco Wholesale | ✔ https://en.wikipedia.org/wiki/Costco |
| `costco-business-centre` | Costco Business Centre | `costco` | Costco Business Centre, Costco Business Center | ✔ https://en.wikipedia.org/wiki/Costco (format described; the page doesn't list Canadian locations, Open Prices has 2 in Montréal) |
| `giant-tiger` | Giant Tiger | `giant-tiger` | Giant Tiger, Tigre Géant | ✔ https://en.wikipedia.org/wiki/Giant_Tiger (private, Ottawa) |
| `whole-foods-market` | Whole Foods Market | `whole-foods-market` | Whole Foods Market, Whole Foods | ✔ https://en.wikipedia.org/wiki/Whole_Foods_Market (Amazon since 2017; in Canada since 2002) |
| `save-on-foods` | Save-On-Foods | `pattison-food-group` | Save-On-Foods, Save On Foods | ✔ https://en.wikipedia.org/wiki/Save-On-Foods |
| `choices-markets` | Choices Market | `pattison-food-group` | Choices Market, Choices Markets | ✔ https://en.wikipedia.org/wiki/Choices_Markets (Buy-Low Foods, part of Pattison Food Group, since 2017; the sale sentence is tagged "citation needed") |
| `london-drugs` | London Drugs | `london-drugs` | London Drugs | ✔ https://en.wikipedia.org/wiki/London_Drugs (owned by H.Y. Louie Co., which has no company row) |
| `calgary-co-op` | Calgary Co-op | `calgary-co-op` | Calgary Co-op, Calgary Coop | ✔ https://en.wikipedia.org/wiki/Calgary_Co-op (retail cooperative) |
| `bulk-barn` | Bulk Barn | `bulk-barn` | Bulk Barn | ✔ https://en.wikipedia.org/wiki/Bulk_Barn (private, Ofield family) |
| `healthy-planet` | Healthy Planet | `healthy-planet` | Healthy Planet | ✔ https://www.wikidata.org/wiki/Q113001393 ("Canadian health food store chain"; its own site returned 403) |
| `highland-farms` | Highland Farms | `highland-farms` | Highland Farms | ✔ https://en.wikipedia.org/wiki/Highland_Farms (family-owned, Ontario) |
| `dollarama` | Dollarama | `dollarama` | Dollarama | ✔ https://en.wikipedia.org/wiki/Dollarama (sells grocery) |
| `dollar-tree` | Dollar Tree | **new** `dollar-tree` (Dollar Tree, Inc., US) | Dollar Tree, Dollar Tree Canada | ✔ https://en.wikipedia.org/wiki/Dollar_Tree (Canadian stores since 2010) |

Every operator except `dollar-tree` is already an approved `companies` row. `dollar-tree` would be a new company row through the `manual` source.

### Left out on purpose

- **Safeway, Atlantic Superstore, Extra Foods, Independent City Market, Rexall, Nations Fresh Foods, Pusateri's, Rabba, Galleria, Coppa's, Fiesta Farms:** no store row yet and not on the plan's list. Easy to add when a receipt or a store needs one. (Independent City Market isn't named on the Loblaw page as such, only "CityMarket".)
- **IKEA, Winners, Simons, Sephora, Hudson's Bay** and the book, game, photo and outdoor shops: not grocery.

## Store links (preview, 2026-11-11)

A SQL dry run of the rule above on the 100 `stores` rows (the job itself is written after approval):

- **73 stores link to 29 banners:** Costco 13, Dollarama 8, Walmart 8 (5 Walmart + 3 Walmart Supercentre), Real Canadian Superstore 6, Metro 4, No Frills 4, Costco Business Centre 2, Farm Boy 2, IGA 2, London Drugs 2, Marché Adonis 2, Save-On-Foods 2, Super C 2, and 1 each for Bulk Barn, Calgary Co-op, Choices Market, Dollar Tree, Dominion, Food Basics, Fortinos, FreshCo, Healthy Planet, Jean Coutu, Pharmaprix, Provigo, Shoppers Drug Mart, T&T (`大統華 T&T Supermarket`), Thrifty Foods (`Thrifty Foods James Bay`) and Zehrs.
- **27 stay unlinked:**
  - Food shops with one store each, no banner needed yet: Avril (a Quebec health grocer), Mayrand Entrepot d Alimentation, Marché Balkan, La Vieille Europe, Marché public 440, Goodway's Specialty Foods, Mediterranean Market, Arhoma, Kelowna Farmers Market.
  - Unclear: Lost Lake (Greater Sudbury), Runnymede (Toronto).
  - Not grocery: IKEA, Winners (2), Simons, Sephora, Hudson's Bay, Gosselin Photo, La Cordée Plein Air, Les jeux Ludold, Librairie Fleury, Tour de Jeux, Le Magasin General d'Hochlag.
  - Not shops (Open Prices locations that are bus stops, a park, a city hall): 8 Ave (EB) at McBride Blvd, 8 Ave (WB) at McBride Blvd, Tipperary Park, New Westminster City Hall.

## Found while building the list

- `avril` (Q104744254) is the French agri-food group Avril, `pending`. It isn't the Quebec grocer of the same name. No action now; it stays hidden.
- Ownership edges Wikidata lacks: `farm-boy` → Empire, `longos` → Empire (51%), `choices-market` → Pattison Food Group, `dominion` → Loblaw, `london-drugs` → H.Y. Louie. With group operators the banners don't need them, but the brand side may (Farm Boy and Longo's are also own brands). That's P4.12's list.
