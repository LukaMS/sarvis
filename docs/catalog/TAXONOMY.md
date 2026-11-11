# Sarvis taxonomy

Version `taxonomy@1.0.0` (P4.8, D-090). This is the grocery category tree that products, generic items (P4.28), price bounds (P4.21) and "similar product" alternatives (Phase 9) use.

**The source of truth is `pipeline/src/taxonomy/tree.ts`.** The seed migration (`supabase/migrations/20261111135803_taxonomy_v1.sql`) is generated from it by `npm run taxonomy:sql --workspace @sarvis/pipeline`, and a unit test keeps the two identical. `npm run check:taxonomy --workspace @sarvis/pipeline` compares dev with the tree and measures coverage.

## 1. Shape

Three levels. The slug is the path, and `categories.level` counts its `/`.

| Level | Role | Count | Example |
|---|---|---|---|
| 0 | Aisle | 17 | `dairy-eggs` |
| 1 | Group | 79 | `dairy-eggs/cheese` |
| 2 | Leaf | 325 | `dairy-eggs/cheese/cheddar` |

Total: 421 nodes. That is a little over the plan's "about 200–400", because StatCan prices some items separately (six frozen vegetables, three beef cuts, three chicken cuts) and each one needs its own leaf.

- **Every group has at least one leaf, and every leaf is at level 2.** A product can still stop at a group or an aisle when its tags say no more (§3).
- **A leaf is narrow enough for "a similar product"**: cheddar, not cheese; frozen peas, not frozen vegetables. Where OFF and StatCan can't tell items apart, a leaf groups a few (`stone-fruit`, `sardines-other`).
- **Design inputs:** the `categories_tags` counts of the 38,680 categorised OFF products in full run `7179a9c8` (7,092 distinct tags), and the 105 StatCan product labels in `reference_prices`.
- **Non-food aisles** that OFF or StatCan hold get nodes: supplements (`health`, 877 products), personal care (StatCan prices toothpaste, shampoo and deodorant), household (StatCan prices laundry detergent), baby. There is no pet node: OFF holds about 20 pet-food products, and the plan doesn't cover pet food.
- **Alcohol** sits under `beverages/alcohol`. Ontario grocers sell beer and wine, and OFF holds 546 such products.

## 2. Sold-loose leaves

`categories.sold_loose = true` marks the 84 leaves whose items are often sold without a barcode: fresh fruit and vegetables, fresh meat cuts, seafood counter items, in-store bakery, deli counter meats and salads, and bulk nuts, seeds, dried fruit, rice, grains and dried legumes. P4.28 seeds its generic items (bananas, chicken breast) from these leaves. They are marked `◦` in the listing below. Packaged leaves inside those aisles (`salad-greens` kits, `bacon`, `breaded-chicken`, `english-muffins`) are not marked.

## 3. OFF tag mappings

`category_mappings` holds 1,350 rows under the `off` source, keyed on the OFF tag (`en:cheddar-cheese`). They are `approved` / `auto` with `method = derived` and `method_version = taxonomy@1.0.0` (reference data, like `sources`). An admin decision on a mapping (`decision_method = admin`) is never overwritten by a re-seed.

- **Only tags seen in the dump are mapped.** All 1,350 occur in run `7179a9c8`. Tags guessed while designing the tree but absent from the Canadian dump were removed.
- **OFF tags carry their ancestors**, so a product holding `en:cheddar-cheese` also holds `en:cheeses` and `en:dairies`. Broad tags map to groups or aisles, and rare tags need no row of their own.
- **Confidence:** 0.90 for an ordinary tag, and 0.60 for a **weak** tag (`~` in the tree). A weak tag is one whose products often belong elsewhere: `en:cheeses` on cheese crisps, `en:hazelnut-butters` on Nutella, `en:fatty-fishes` on canned tuna, `en:sandwiches` on burgers and burritos, `en:tomatoes` on canned tomatoes. 128 tags are weak. StatCan mappings are 1.00.

**The pick rule** (`pipeline/src/taxonomy/assign.ts`, `pickCategory`; P4.9 applies it):
1. Among the product's tags that have a mapping, the one with the **deepest** category wins (leaf > group > aisle).
2. On a tie, the **higher confidence** wins, so a weak tag loses.
3. On a further tie, the tag **listed later** wins. OFF lists a product's tags from general to specific.

Examples (unit tests): Old Dutch Cheese Pleesers → `snacks/chips` (crisps beat cheese); Nutella & GO! → `breakfast/spreads/chocolate-spreads`; maple syrup → `maple-syrup`, not `other-syrups`; smoked salmon → `smoked-fish`, not `salmon`.

**Known limits:**
- `en:tomatoes` alone means canned tomatoes in 8 of 12 sampled products, so it maps (weak) to `pantry/canned/canned-tomatoes`. A fresh tomato tagged only `en:tomatoes` lands there too. Fresh tomatoes are usually also tagged `en:fresh-vegetables` or `en:cherry-tomatoes`.
- `en:fruits` and `en:vegetables` alone are mixed (fresh, canned and juice), so they map weak to the fresh groups.
- **Unmapped on purpose:** tags that say nothing about the aisle, such as `en:plant-based-foods-and-beverages`, `en:plant-based-foods`, `en:cereals-and-potatoes`, `en:cereals-and-their-products` (breads, pastas and cereals), `en:fats`, `en:desserts`, `en:sweeteners`, and pet food. A product with only these tags gets no category from tags. P4.17 (name rules) can still classify it.

## 4. `products.category_rule`

One `smallint` per product records which rule set `category_id`, in place of a `match_candidates` row per product (D-077). `null` when there is no category. A check keeps a rule from existing without a category.

| Code | Rule | Task |
|---|---|---|
| 1 | OFF tags, by the pick rule above | P4.9 |
| 10–49 | Name rules (one code per rule) | P4.17 |
| 50–59 | AI classification | Phase 7 |
| 90 | Manual (admin) | Phase 5 |

The `categorize-tags` job (rule 1, D-093) replaces a name or AI rule when tags map, never a manual one, and clears its own rule when the tags stop mapping. On 2026-11-11 it set 37,235 OFF products (run `1e373c9d`, after sample `e132ebe3`).

## 5. StatCan mappings

All 105 StatCan product labels in `reference_prices` map to a node (105 rows under `statcan-18100245`, keyed on the label). Most map to a leaf. These map to a group because the label spans several leaves: Block cheese → `dairy-eggs/cheese`, Yogurt → `dairy-eggs/yogurt`, Flatbread and pita → `bakery/flatbreads`, Dry or fresh pasta → `pantry/pasta`, Pasta sauce → `condiments/pasta-sauces`, Salad dressing → `condiments/dressings`, Cereal → `breakfast/cereal`, Crackers and crisp breads → `snacks/crackers`, Cookies and sweet biscuits → `snacks/cookies`, Frozen pizza → `prepared-meals/pizza`, Tea → `beverages/tea`, Baby food → `baby/food`, Infant formula → `baby/formula`. Setting `reference_prices.category_id` from these is P4.21's job.

## 6. Coverage (2026-11-11, run `7179a9c8`)

`check:taxonomy` on 93,411 OFF rows, 38,680 of them with tags:

| Deepest node reached | Products | Share of categorised |
|---|---|---|
| Leaf | 26,203 | 67.74% |
| Group | 8,750 | 22.62% |
| Aisle | 2,299 | 5.94% |
| **Mapped** | **37,252** | **96.31%** |
| Unmapped | 1,428 | 3.69% |

By aisle: snacks 5,961, pantry 5,751, beverages 4,092, dairy-eggs 3,472, breakfast 2,858, candy-chocolate 2,718, bakery 2,386, condiments 2,359, meat-seafood 2,143, deli 1,363, prepared-meals 1,147, produce 1,027, frozen 911, health 877, personal-care 101, baby 70, household 16.

**Hand check while designing:** 70 random categorised products were read against their picked node. The conflicts between same-level mappings were listed, and the wrong ones were fixed with weak tags. After the fixes, 4 of the 70 are wrong: a muffin mix under cakes (OFF tags it `en:chocolate-cakes`), tzatziki under yogurt, a yogurt starter under creamers, and dried basil under the condiments aisle. About 10 more stop at a vague but correct node (a multigrain bread at `bakery`). P4.9's 50-product hand check measures the final rate.

## 7. Changing the taxonomy

1. Edit `tree.ts` and bump `TAXONOMY_VERSION`.
2. Generate a new migration with `npm run taxonomy:sql`, apply it on dev, save it under its version, and point `TAXONOMY_MIGRATION` at it.
3. Run `npm test` (the migration must equal the generator) and `npm run check:taxonomy`.
4. Renaming or removing a slug that products use needs a data migration first. The seed only upserts and never deletes.

## 8. The tree

`◦` = sold loose. Leaf slugs are `<aisle>/<group>/<leaf>`.

**Fruits & vegetables** (`produce`)

- Fresh fruit (`fruits`): apples ◦, bananas ◦, berries ◦, citrus ◦, grapes ◦, pears ◦, melons ◦, stone-fruit ◦, avocados ◦, tropical-fruit ◦
- Fresh vegetables (`vegetables`): potatoes ◦, sweet-potatoes ◦, onions-garlic ◦, carrots-root-vegetables ◦, tomatoes ◦, peppers ◦, cucumbers ◦, lettuce ◦, salad-greens, leafy-greens ◦, broccoli-cauliflower ◦, cabbage ◦, celery ◦, squash ◦, mushrooms ◦, beans-peas-corn ◦, fresh-herbs ◦

**Dairy & eggs** (`dairy-eggs`)

- Milk (`milk`): white-milk, lactose-free-milk, flavoured-milk, goat-other-milk, canned-powdered-milk
- Cream & creamers (`cream`): cream, sour-cream, creamers, whipped-topping
- Butter & margarine (`butter-margarine`): butter, margarine
- Cheese (`cheese`): cheddar, mozzarella, parmesan-hard, semi-soft, swiss-alpine, soft-ripened, blue, feta-greek, cream-cheese, cottage-ricotta, processed
- Yogurt & kefir (`yogurt`): plain-yogurt, flavoured-yogurt, greek-yogurt, drinkable
- Eggs (`eggs`): chicken-eggs, liquid-egg
- Puddings & dairy desserts (`desserts`): puddings
- Plant-based alternatives (`plant-based`): soy-milk, almond-milk, oat-milk, other-plant-milk, plant-based-yogurt, plant-based-cheese, plant-based-cream

**Meat & seafood** (`meat-seafood`)

- Beef (`beef`): ground-beef ◦, steaks ◦, roasts ◦, stewing ◦, burgers
- Pork (`pork`): chops-loin ◦, ribs ◦, shoulder-roasts ◦, ground-pork ◦, bacon
- Chicken & turkey (`poultry`): whole-chicken ◦, chicken-breasts ◦, chicken-thighs ◦, chicken-drumsticks ◦, chicken-wings ◦, ground-poultry ◦, turkey ◦, duck-other ◦, breaded-chicken
- Sausages & hot dogs (`sausages`): hot-dogs, fresh-sausages ◦, smoked-sausages
- Lamb, veal & other meat (`lamb-other`): lamb ◦, veal ◦, game ◦
- Fish & seafood (`seafood`): salmon ◦, white-fish ◦, breaded-fish, shrimp, shellfish ◦, smoked-fish, other-fish ◦
- Tofu & meat alternatives (`plant-protein`): tofu-tempeh, meatless-burgers, meatless-other

**Deli & ready to eat** (`deli`)

- Deli meats (`cold-cuts`): ham ◦, cured-ham ◦, poultry-slices ◦, salami-pepperoni ◦, roast-beef-other ◦, pate
- Dips & spreads (`dips`): hummus, guacamole, tzatziki-other
- Salads & sandwiches (`prepared`): salads ◦, sandwiches-wraps, sushi, rotisserie ◦

**Bakery** (`bakery`)

- Bread (`bread`): white-bread ◦, whole-grain-bread ◦, rye-sourdough ◦, artisan-bread ◦, gluten-free-bread
- Buns, rolls & bagels (`buns-bagels`): hamburger-hot-dog-buns ◦, dinner-rolls ◦, bagels ◦, english-muffins
- Tortillas, pitas & naan (`flatbreads`): tortillas-wraps, pitas, naan
- Pastries & sweet baked goods (`pastries`): croissants ◦, muffins ◦, donuts ◦, sweet-buns-brioche ◦
- Cakes & pies (`cakes-pies`): cakes ◦, pies-tarts ◦, cheesecakes ◦, brownies-squares ◦

**Pantry** (`pantry`)

- Pasta & noodles (`pasta`): long-pasta, short-pasta, egg-noodles-lasagna, stuffed-pasta, gnocchi, asian-noodles, instant-noodles, gluten-free-pasta, pasta-kits
- Rice & grains (`rice-grains`): white-rice ◦, aromatic-rice, brown-wild-rice ◦, rice-mixes, quinoa ◦, other-grains ◦
- Beans & lentils (`beans-legumes`): canned-beans, baked-beans, dried-lentils ◦, dried-beans ◦
- Canned vegetables & fruit (`canned`): canned-tomatoes, canned-corn, canned-vegetables-other, canned-fruit, dried-vegetables
- Canned fish & meat (`canned-fish-meat`): canned-tuna, canned-salmon, sardines-other, canned-meat
- Soups & broths (`soups-broths`): canned-soup, broth-stock, soup-mixes
- Baking (`baking`): flour, sugar, sugar-substitutes, baking-mixes, chocolate-chips-cocoa, baking-ingredients, dough-crusts, breadcrumbs-coatings
- Oils & vinegars (`oils-vinegars`): olive-oil, canola-oil, vegetable-oil, specialty-oils, cooking-fats, vinegar
- Spices & seasonings (`spices-seasonings`): spices, dried-herbs, salt, seasoning-mixes
- World foods (`world-foods`): asian-ingredients, coconut-milk, latin-ingredients

**Condiments & sauces** (`condiments`)

- Pasta sauces (`pasta-sauces`): tomato-pasta-sauce, pesto, cream-sauces, pizza-sauce
- Ketchup, mustard & mayo (`table-condiments`): ketchup, mustard, mayonnaise, relish
- Cooking & table sauces (`cooking-sauces`): bbq-sauce, hot-sauce, soy-asian-sauces, meal-sauces, salsa
- Salad dressings (`dressings`): creamy-dressing, vinaigrettes
- Pickles & olives (`pickles-olives`): pickles, olives, sauerkraut-kimchi

**Breakfast & spreads** (`breakfast`)

- Cereal (`cereal`): cold-cereal, granola-muesli, oatmeal
- Pancakes & waffles (`pancakes-waffles`): pancake-mixes, frozen-waffles
- Spreads, honey & syrups (`spreads`): peanut-butter, nut-seed-butters, jam, honey, maple-syrup, other-syrups, chocolate-spreads

**Snacks** (`snacks`)

- Chips & salty snacks (`chips`): potato-chips, tortilla-chips, other-chips, popcorn, pretzels, puffs
- Crackers & rice cakes (`crackers`): crackers, rice-cakes
- Cookies & sweet biscuits (`cookies`): chocolate-chip, sandwich-cookies, wafers, shortbread-tea
- Snack bars (`bars`): granola-bars, protein-bars, nut-fruit-bars
- Nuts, seeds & dried fruit (`nuts-seeds-dried-fruit`): almonds ◦, peanuts ◦, other-nuts ◦, seeds ◦, dried-fruit ◦, trail-mix ◦
- Jerky & meat snacks (`meat-snacks`): jerky
- Fruit snacks & applesauce (`fruit-snacks`): applesauce, fruit-gummies

**Candy & chocolate** (`candy-chocolate`)

- Chocolate (`chocolate`): milk-chocolate, dark-chocolate, white-chocolate, candy-bars, chocolate-bites, seasonal-chocolate
- Candy (`candy`): gummies, hard-candy-mints, marshmallows
- Gum (`gum`): chewing-gum

**Frozen** (`frozen`)

- Frozen vegetables (`vegetables`): broccoli, corn, peas, green-beans, mixed-vegetables, spinach, other-vegetables
- Frozen fruit (`fruit`): strawberries, berries, other-fruit
- Frozen potatoes (`potatoes`): fries, other-potatoes
- Ice cream & frozen desserts (`desserts`): ice-cream, novelties, sorbet-frozen-yogurt, plant-based-frozen

**Prepared meals** (`prepared-meals`)

- Pizza (`pizza`): frozen-pizza, pizza-snacks
- Pasta dishes (`pasta-dishes`): lasagna, other-pasta-dishes
- Entrées & bowls (`entrees`): meat-entrees, fish-entrees, vegetarian-entrees, rice-dishes
- Burritos, pies & hand-held (`hand-held`): burritos-wraps, savoury-pies, appetizers

**Beverages** (`beverages`)

- Water (`water`): still-water, sparkling-water, flavoured-water
- Soft drinks (`soft-drinks`): cola, other-soft-drinks
- Juice (`juice`): orange-juice, apple-juice, other-juice, vegetable-juice, lemonade-iced, smoothies
- Coffee (`coffee`): ground-coffee, whole-bean, pods, instant-coffee, ready-to-drink-coffee
- Tea (`tea`): black-green-tea, herbal-tea, iced-tea, kombucha
- Energy & sports drinks (`energy-sports`): energy-drinks, sports-drinks
- Hot chocolate & drink mixes (`drink-mixes`): hot-chocolate, drink-mixes
- Beer, wine & spirits (`alcohol`): beer, wine, cider-coolers, spirits, non-alcoholic

**Baby** (`baby`)

- Baby food (`food`): purees, cereal-snacks
- Infant formula (`formula`): infant-formula, toddler-milk

**Supplements & nutrition** (`health`)

- Protein & sports nutrition (`sports-nutrition`): protein-powder, protein-shakes, pre-workout
- Vitamins & supplements (`vitamins`): vitamins-minerals, other-supplements

**Household** (`household`)

- Laundry (`laundry`): detergent, fabric-care
- Cleaning (`cleaning`): dish, cleaners
- Paper, wraps & bags (`paper-wraps`): paper, wraps-bags

**Personal care** (`personal-care`)

- Oral care (`oral`): toothpaste, other-oral
- Hair care (`hair`): shampoo, conditioner-styling
- Body & skin (`body`): deodorant, soap-body-wash, skin-care

