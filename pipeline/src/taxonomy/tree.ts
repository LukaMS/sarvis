// The Sarvis grocery taxonomy (P4.8, D-090): the source of truth for the `categories` rows, their
// OFF tag mappings and their StatCan product mappings. `npm run taxonomy:sql` prints the seed
// migration from it, and a unit test keeps the checked-in migration equal to that output.
//
// Three levels: an aisle (level 0), a group (level 1) and a leaf (level 2). A leaf is narrow
// enough for "a similar product" (cheddar, not cheese). Every group has at least one leaf.
//
// `off` lists the OFF `categories_tags` a node takes. OFF tags carry their ancestors, so a product
// takes its deepest mapped node and rare tags need no row of their own (TAXONOMY.md §3). A tag
// prefixed with `~` is weak: a product holding it often belongs elsewhere (en:cheeses on cheese
// crisps), so its mapping gets a lower confidence and loses a tie.
//
// `loose` marks a leaf that holds items sold without a barcode (produce, meat, seafood, bakery,
// deli, bulk). P4.28 seeds generic items from those leaves. `statcan` lists the StatCan
// table 18-10-0245-01 product labels the node benchmarks.

export const TAXONOMY_VERSION = '1.0.0';
export const TAXONOMY_METHOD_VERSION = `taxonomy@${TAXONOMY_VERSION}`;
/** Confidence of a mapping: an ordinary tag, and a weak (`~`) one. */
export const STRONG_CONFIDENCE = 0.9;
export const WEAK_CONFIDENCE = 0.6;

export interface NodeSpec {
  /** One slug segment; the stored slug is the path (`dairy-eggs/cheese/cheddar`). */
  key: string;
  name: string;
  off?: readonly string[];
  statcan?: readonly string[];
  loose?: boolean;
  children?: readonly NodeSpec[];
}

type Opts = Omit<NodeSpec, 'key' | 'name' | 'children'>;
const node = (key: string, name: string, opts: Opts, children: NodeSpec[]): NodeSpec => ({
  key,
  name,
  ...opts,
  children,
});
const leaf = (key: string, name: string, opts: Opts = {}): NodeSpec => ({ key, name, ...opts });
/** A leaf of items sold loose. */
const loose = (key: string, name: string, opts: Opts = {}): NodeSpec =>
  leaf(key, name, { ...opts, loose: true });

export const TAXONOMY: readonly NodeSpec[] = [
  node('produce', 'Fruits & vegetables', { off: ['~en:fresh-plant-based-foods'] }, [
    node('fruits', 'Fresh fruit', { off: ['en:fresh-fruits', '~en:fruits'] }, [
      loose('apples', 'Apples', { off: ['en:apples'], statcan: ['Apples'] }),
      loose('bananas', 'Bananas', { off: ['en:bananas'], statcan: ['Bananas'] }),
      loose('berries', 'Berries', {
        off: [
          'en:berries',
          'en:strawberries',
          'en:blueberries',
          'en:raspberries',
          'en:blackberries',
          'en:cranberries',
        ],
        statcan: ['Strawberries'],
      }),
      loose('citrus', 'Citrus', {
        off: [
          'en:citrus',
          'en:oranges',
          'en:lemons',
          'en:limes',
          'en:mandarin-oranges',
          'en:clementines',
          'en:grapefruits',
        ],
        statcan: ['Lemons', 'Limes', 'Oranges'],
      }),
      loose('grapes', 'Grapes', { off: ['en:grapes'], statcan: ['Grapes'] }),
      loose('pears', 'Pears', { off: ['en:pears'], statcan: ['Pears'] }),
      loose('melons', 'Melons', { off: ['en:melons', 'en:watermelons'], statcan: ['Cantaloupe'] }),
      loose('stone-fruit', 'Stone fruit', {
        off: ['en:peaches', 'en:nectarines', 'en:plums', 'en:cherries', 'en:apricots'],
      }),
      loose('avocados', 'Avocados', { off: ['en:avocados'], statcan: ['Avocado'] }),
      loose('tropical-fruit', 'Tropical fruit', {
        off: [
          'en:tropical-fruits',
          'en:mangoes',
          'en:pineapples',
          'en:kiwifruits',
          'en:papayas',
          'en:coconuts',
        ],
      }),
    ]),
    node('vegetables', 'Fresh vegetables', { off: ['en:fresh-vegetables', '~en:vegetables'] }, [
      loose('potatoes', 'Potatoes', {
        off: ['en:potatoes', 'en:fresh-potatoes'],
        statcan: ['Potatoes'],
      }),
      loose('sweet-potatoes', 'Sweet potatoes', {
        off: ['en:sweet-potatoes'],
        statcan: ['Sweet potatoes'],
      }),
      loose('onions-garlic', 'Onions & garlic', {
        off: [
          '~en:onions-and-their-products',
          'en:onions',
          'en:garlics',
          'en:garlic',
          'en:shallots',
          'en:leeks',
          '~en:garlics-and-their-products',
          '~en:garlic-and-their-products',
        ],
        statcan: ['Onions'],
      }),
      loose('carrots-root-vegetables', 'Carrots & root vegetables', {
        off: ['en:carrots', 'en:root-vegetables', 'en:radishes', '~en:ginger'],
        statcan: ['Carrots'],
      }),
      loose('tomatoes', 'Tomatoes', { off: ['en:cherry-tomatoes'], statcan: ['Tomatoes'] }),
      loose('peppers', 'Peppers', {
        off: ['en:peppers', 'en:sweet-peppers', 'en:chili-peppers'],
        statcan: ['Peppers'],
      }),
      loose('cucumbers', 'Cucumbers', { off: ['en:cucumbers'], statcan: ['Cucumber'] }),
      loose('lettuce', 'Lettuce', {
        off: ['en:lettuces'],
        statcan: ['Iceberg lettuce', 'Romaine lettuce'],
      }),
      leaf('salad-greens', 'Salad greens & kits', {
        off: ['en:salad-kits'],
        statcan: ['Salad greens'],
      }),
      loose('leafy-greens', 'Spinach, kale & leafy greens', {
        off: ['en:leaf-vegetables', 'en:spinachs'],
      }),
      loose('broccoli-cauliflower', 'Broccoli & cauliflower', {
        off: ['en:broccoli', 'en:cauliflowers', 'en:brussels-sprouts'],
        statcan: ['Broccoli'],
      }),
      loose('cabbage', 'Cabbage', { off: ['en:cabbages'], statcan: ['Cabbage'] }),
      loose('celery', 'Celery', { off: ['en:celery'], statcan: ['Celery'] }),
      loose('squash', 'Squash & zucchini', {
        off: ['~en:pumpkin-and-squash-plant-products', 'en:zucchini', 'en:pumpkins'],
        statcan: ['Squash'],
      }),
      loose('mushrooms', 'Mushrooms', {
        off: ['en:mushrooms', '~en:mushrooms-and-their-products'],
        statcan: ['Mushrooms'],
      }),
      loose('beans-peas-corn', 'Green beans, peas & corn', {
        off: ['en:fresh-green-beans', 'en:corn-on-the-cob', 'en:asparagus', 'en:artichokes'],
      }),
      loose('fresh-herbs', 'Fresh herbs', { off: ['en:aromatic-plants', 'en:herbs'] }),
    ]),
  ]),

  node('dairy-eggs', 'Dairy & eggs', { off: ['~en:dairies'] }, [
    node('milk', 'Milk', { off: ['en:milks', 'en:milks-liquid-and-powder'] }, [
      leaf('white-milk', 'White milk', {
        off: [
          'en:cow-milks',
          'en:whole-milks',
          'en:skimmed-milks',
          'en:semi-skimmed-milks',
          'en:uht-milks',
          'en:homogenized-milks',
        ],
        statcan: ['Milk'],
      }),
      leaf('lactose-free-milk', 'Lactose-free milk', { off: ['en:lactose-free-milk'] }),
      leaf('flavoured-milk', 'Chocolate & flavoured milk', {
        off: ['en:flavoured-milks', 'en:chocolate-milks', '~en:dairy-drinks', 'en:milkshakes'],
      }),
      leaf('goat-other-milk', 'Goat & other milk', { off: ['en:goat-milks'] }),
      leaf('canned-powdered-milk', 'Evaporated, condensed & powdered milk', {
        off: ['en:evaporated-milks', 'en:condensed-milks', 'en:milk-powders'],
      }),
    ]),
    node('cream', 'Cream & creamers', { off: [] }, [
      leaf('cream', 'Cream', { off: ['~en:creams'], statcan: ['Cream'] }),
      leaf('sour-cream', 'Sour cream', { off: ['en:sour-creams', 'en:fermented-creams'] }),
      leaf('creamers', 'Coffee creamers', { off: ['en:creamer'] }),
      leaf('whipped-topping', 'Whipped cream & topping', { off: ['en:whipped-creams'] }),
    ]),
    node(
      'butter-margarine',
      'Butter & margarine',
      { off: ['en:spreadable-fats', '~en:dairy-spreads'] },
      [
        leaf('butter', 'Butter', {
          off: ['en:butters', 'en:salted-butters', 'en:unsalted-butters', 'en:milkfat', 'en:ghee'],
          statcan: ['Butter'],
        }),
        leaf('margarine', 'Margarine & plant-based butter', {
          off: ['en:margarines'],
          statcan: ['Margarine'],
        }),
      ],
    ),
    node(
      'cheese',
      'Cheese',
      {
        off: [
          '~en:cheeses',
          '~fr:fromage-canada',
          '~en:cow-cheeses',
          '~en:italian-cheeses',
          '~en:french-cheeses',
        ],
        statcan: ['Block cheese'],
      },
      [
        leaf('cheddar', 'Cheddar', {
          off: [
            'en:cheddar-cheese',
            'en:cheeses-from-england',
            'en:cheeses-from-the-united-kingdom',
          ],
        }),
        leaf('mozzarella', 'Mozzarella & stretched-curd', {
          off: ['en:mozzarella', 'en:stretched-curd-cheeses', 'en:burrata', 'en:provolone'],
        }),
        leaf('parmesan-hard', 'Parmesan & hard cheese', {
          off: [
            'en:parmigiano-reggiano',
            'en:grana-padano',
            'en:grated-cheese',
            'en:hard-cheeses',
            'en:pecorino',
          ],
        }),
        leaf('semi-soft', 'Gouda, havarti & semi-soft', {
          off: [
            'en:gouda',
            'en:havarti',
            'en:edam',
            'en:uncooked-pressed-cheeses',
            'en:danish-cheeses',
          ],
        }),
        leaf('swiss-alpine', 'Swiss & alpine', { off: ['en:raclette', 'en:comte'] }),
        leaf('soft-ripened', 'Brie, camembert & soft-ripened', {
          off: ['en:soft-cheeses', 'en:soft-cheeses-with-bloomy-rind', 'en:bries', 'en:camemberts'],
        }),
        leaf('blue', 'Blue cheese', { off: [] }),
        leaf('feta-greek', 'Feta & brined', {
          off: [
            'en:feta',
            'en:greek-cheeses',
            'en:halloumi',
            'en:paneer',
            'en:sheep-s-milk-cheeses',
            'en:goat-cheeses',
          ],
        }),
        leaf('cream-cheese', 'Cream cheese', { off: ['en:cream-cheeses', 'en:mascarpone'] }),
        leaf('cottage-ricotta', 'Cottage & ricotta', {
          off: ['en:cottage-cheeses', 'en:ricotta', 'en:fresh-cheeses'],
        }),
        leaf('processed', 'Slices, spreads & processed', {
          off: [
            'en:processed-cheese',
            'en:processed-cheeses',
            'en:cheese-spreads',
            'en:sliced-cheeses',
          ],
        }),
      ],
    ),
    node(
      'yogurt',
      'Yogurt & kefir',
      {
        off: ['en:yogurts', '~en:fermented-dairy-desserts', '~en:fermented-milk-products'],
        statcan: ['Yogurt'],
      },
      [
        leaf('plain-yogurt', 'Plain yogurt', {
          off: ['en:plain-yogurts', 'en:plain-fermented-dairy-desserts', 'en:cow-milk-yogurts'],
        }),
        leaf('flavoured-yogurt', 'Fruit & flavoured yogurt', {
          off: [
            'en:fruit-yogurts',
            'en:fermented-dairy-desserts-with-fruits',
            'en:flavoured-yogurts',
            'en:vanilla-yogurt',
            'en:strawberry-yogurts',
          ],
        }),
        leaf('greek-yogurt', 'Greek & Icelandic yogurt', { off: ['en:greek-style-yogurts'] }),
        leaf('drinkable', 'Kefir & drinkable yogurt', {
          off: [
            'en:kefir',
            'en:fermented-milk-drinks',
            'en:drinkable-yogurts',
            'en:yogurt-drinks',
            'en:buttermilks',
          ],
        }),
      ],
    ),
    node('eggs', 'Eggs', { off: ['en:eggs', '~en:eggs-and-their-products'] }, [
      leaf('chicken-eggs', 'Chicken eggs', {
        off: [
          'en:chicken-eggs',
          'en:fresh-eggs',
          'en:large-eggs',
          'en:extra-large-eggs',
          'en:medium-eggs',
          'en:barn-chicken-eggs',
          'en:free-range-chicken-eggs',
          'en:organic-eggs',
        ],
        statcan: ['Eggs'],
      }),
      leaf('liquid-egg', 'Liquid eggs & egg whites', { off: ['en:egg-substitutes'] }),
    ]),
    node('desserts', 'Puddings & dairy desserts', { off: ['~en:dairy-desserts'] }, [
      leaf('puddings', 'Puddings & custards', {
        off: ['en:puddings', 'en:jelly-desserts', '~en:chocolate-desserts', 'en:rice-puddings'],
      }),
    ]),
    node(
      'plant-based',
      'Plant-based alternatives',
      {
        off: [
          '~en:dairy-substitutes',
          'en:milk-substitutes',
          'en:plant-based-milk-alternatives',
          'en:non-dairy-fermented-foods',
        ],
      },
      [
        leaf('soy-milk', 'Soy milk', { off: ['en:soy-based-drinks'], statcan: ['Soy milk'] }),
        leaf('almond-milk', 'Almond milk', { off: ['en:almond-based-drinks'] }),
        leaf('oat-milk', 'Oat milk', { off: ['en:oat-based-drinks'] }),
        leaf('other-plant-milk', 'Other plant-based milk', {
          off: [
            'en:nut-based-drinks',
            'en:rice-based-drinks',
            'en:coconut-based-drinks',
            '~en:legume-based-drinks',
            '~en:cereal-based-drinks',
          ],
          statcan: ['Nut milk'],
        }),
        leaf('plant-based-yogurt', 'Plant-based yogurt', {
          off: ['en:non-dairy-yogurts', 'en:coconut-yogurts'],
        }),
        leaf('plant-based-cheese', 'Plant-based cheese', { off: ['en:cheese-substitutes'] }),
        leaf('plant-based-cream', 'Plant-based cream & creamers', {
          off: ['~en:plant-based-creams', '~en:plant-based-creams-for-cooking'],
        }),
      ],
    ),
  ]),

  node('meat-seafood', 'Meat & seafood', { off: ['~en:meats-and-their-products', '~en:meats'] }, [
    node('beef', 'Beef', { off: ['en:beef', '~en:beef-and-its-products'] }, [
      loose('ground-beef', 'Ground beef', {
        off: ['en:ground-beef', 'en:ground-meats'],
        statcan: ['Ground beef'],
      }),
      loose('steaks', 'Steaks', {
        off: ['en:beef-steaks', 'en:steaks'],
        statcan: ['Beef rib cuts', 'Beef striploin cuts', 'Beef top sirloin cuts'],
      }),
      loose('roasts', 'Roasts', { off: [] }),
      loose('stewing', 'Stewing beef', { off: [], statcan: ['Beef stewing cuts'] }),
      leaf('burgers', 'Burger patties', { off: ['~en:hamburgers', 'en:beef-patties'] }),
    ]),
    node('pork', 'Pork', { off: ['en:pork', '~en:pork-and-its-products'] }, [
      loose('chops-loin', 'Chops & loin', { off: [], statcan: ['Pork loin cuts'] }),
      loose('ribs', 'Ribs', { off: ['en:pork-ribs'], statcan: ['Pork rib cuts'] }),
      loose('shoulder-roasts', 'Shoulder & roasts', {
        off: ['en:pork-shoulders', 'en:pork-roasts'],
        statcan: ['Pork shoulder cuts'],
      }),
      loose('ground-pork', 'Ground pork', { off: [] }),
      leaf('bacon', 'Bacon', {
        off: ['en:bacon', 'en:lardons', 'en:pancetta'],
        statcan: ['Bacon'],
      }),
    ]),
    node(
      'poultry',
      'Chicken & turkey',
      { off: ['en:poultries', '~en:chicken-and-its-products', 'en:chickens'] },
      [
        loose('whole-chicken', 'Whole chicken', {
          off: ['en:whole-chickens'],
          statcan: ['Whole chicken'],
        }),
        loose('chicken-breasts', 'Chicken breasts', {
          off: ['en:chicken-breasts'],
          statcan: ['Chicken breasts'],
        }),
        loose('chicken-thighs', 'Chicken thighs', {
          off: ['en:chicken-thighs'],
          statcan: ['Chicken thigh'],
        }),
        loose('chicken-drumsticks', 'Chicken drumsticks & legs', {
          off: ['en:chicken-drumsticks'],
          statcan: ['Chicken drumsticks'],
        }),
        loose('chicken-wings', 'Chicken wings', { off: ['en:chicken-wings'] }),
        loose('ground-poultry', 'Ground chicken & turkey', { off: ['en:ground-turkey'] }),
        loose('turkey', 'Turkey', {
          off: ['en:turkeys', '~en:turkey-and-its-products', 'en:turkey-breasts'],
        }),
        loose('duck-other', 'Duck & other poultry', { off: ['~en:ducks'] }),
        leaf('breaded-chicken', 'Nuggets & breaded chicken', {
          off: [
            'en:breaded-chicken',
            'en:chicken-nuggets',
            'en:poultry-nuggets',
            'en:chicken-strips',
            'en:chicken-hamburgers',
            'en:chicken-patties',
          ],
        }),
      ],
    ),
    node('sausages', 'Sausages & hot dogs', { off: ['en:sausages'] }, [
      leaf('hot-dogs', 'Hot dogs & wieners', {
        off: ['en:frankfurter-sausages'],
        statcan: ['Wieners'],
      }),
      loose('fresh-sausages', 'Fresh sausages', {
        off: [
          'en:poultry-sausages',
          'en:chicken-sausages',
          'en:pork-sausages',
          'en:italian-sausages',
        ],
      }),
      leaf('smoked-sausages', 'Smoked & cooked sausages', { off: ['en:smoked-sausages'] }),
    ]),
    node('lamb-other', 'Lamb, veal & other meat', { off: [] }, [
      loose('lamb', 'Lamb', { off: ['en:lamb-meat'] }),
      loose('veal', 'Veal', { off: [] }),
      loose('game', 'Game & specialty meat', { off: [] }),
    ]),
    node(
      'seafood',
      'Fish & seafood',
      { off: ['~en:seafood', '~en:fishes-and-their-products', '~en:fishes', 'en:frozen-seafood'] },
      [
        loose('salmon', 'Salmon', {
          off: ['en:salmons', 'en:salmon-fillets'],
          statcan: ['Salmon'],
        }),
        loose('white-fish', 'Cod, haddock & white fish', {
          off: [
            '~en:fish-fillets',
            'fr:filet-d-aiglefin',
            'fr:filet-d-aiglefin-sauvage',
            'en:cods',
            'en:pollocks',
            'en:lean-fishes',
            'en:trouts',
          ],
        }),
        leaf('breaded-fish', 'Breaded fish & fish sticks', {
          off: ['en:breaded-fish', 'en:fish-fingers', 'en:fish-preparations'],
        }),
        leaf('shrimp', 'Shrimp & prawns', {
          off: ['en:shrimps', 'en:prawns', 'en:cooked-shrimps'],
          statcan: ['Shrimp'],
        }),
        loose('shellfish', 'Crab, lobster & shellfish', {
          off: [
            '~en:crustaceans',
            'en:mollusc',
            'en:mussels',
            'en:oysters',
            'en:lobsters',
            'en:surimi',
          ],
        }),
        leaf('smoked-fish', 'Smoked fish', {
          off: ['en:smoked-fishes', 'en:smoked-salmons', 'en:smoked-trouts', 'en:smoked-mackerels'],
        }),
        loose('other-fish', 'Tuna steaks, mackerel & other fish', {
          off: ['~en:fatty-fishes', 'en:mackerels', 'en:mackerel-fillets'],
        }),
      ],
    ),
    node(
      'plant-protein',
      'Tofu & meat alternatives',
      { off: ['en:meat-alternatives', 'en:meat-analogues'] },
      [
        leaf('tofu-tempeh', 'Tofu & tempeh', {
          off: ['en:tofu', 'xx:tofu', 'en:tempeh', 'en:smoked-tofu', 'en:seitan'],
          statcan: ['Tofu'],
        }),
        leaf('meatless-burgers', 'Meatless burgers', {
          off: ['en:vegetarian-patties'],
          statcan: ['Meatless burgers'],
        }),
        leaf('meatless-other', 'Plant-based ground, sausages & nuggets', {
          off: [
            'en:vegetarian-sausages',
            'en:vegan-sausages',
            'en:vegetarian-balls',
            'en:textured-vegetable-protein',
            'en:vegetarian-nuggets',
          ],
        }),
      ],
    ),
  ]),

  node('deli', 'Deli & ready to eat', { off: [] }, [
    node(
      'cold-cuts',
      'Deli meats',
      { off: ['~en:prepared-meats', 'fr:charcuteries-cuites', 'fr:charcuteries-diverses'] },
      [
        loose('ham', 'Ham', { off: ['en:hams', 'en:white-hams', 'en:prepared-pork-meats'] }),
        loose('cured-ham', 'Prosciutto & cured ham', { off: ['en:cured-hams'] }),
        loose('poultry-slices', 'Turkey & chicken slices', {
          off: ['en:prepared-poultry-meats', 'en:cooked-poultries'],
        }),
        loose('salami-pepperoni', 'Salami, pepperoni & dry sausage', {
          off: [
            'en:salami',
            'en:cured-sausages',
            'en:dry-sausages',
            'en:pepperoni',
            'en:chorizo',
            'en:mortadella',
          ],
        }),
        loose('roast-beef-other', 'Roast beef, bologna & other', {
          off: ['en:prepared-beef-meats', 'en:roast-beef', 'en:corned-beef'],
        }),
        leaf('pate', 'Pâté & rillettes', {
          off: [
            'en:pate',
            'en:rillettes',
            'en:foies-gras',
            'en:foies-gras-from-ducks',
            'en:liver-pates',
            'en:terrines',
          ],
        }),
      ],
    ),
    node(
      'dips',
      'Dips & spreads',
      { off: ['en:dips', 'en:Plant-based dips', '~en:salted-spreads'] },
      [
        leaf('hummus', 'Hummus', { off: ['en:hummus'], statcan: ['Hummus'] }),
        leaf('guacamole', 'Guacamole', { off: ['en:guacamoles'] }),
        leaf('tzatziki-other', 'Tzatziki & other dips', {
          off: ['en:tzatzikis', 'en:taramasalata', 'en:vegetable-dips'],
        }),
      ],
    ),
    node('prepared', 'Salads & sandwiches', { off: ['en:prepared-salads', 'fr:pret-a-manger'] }, [
      loose('salads', 'Prepared salads', {
        off: [
          'en:pasta-salads',
          'en:potato-salads',
          'en:tuna-salads',
          'en:chicken-salads',
          'en:tabbouleh',
        ],
      }),
      leaf('sandwiches-wraps', 'Sandwiches & wraps', {
        off: ['~en:sandwiches', 'en:club-sandwiches'],
      }),
      leaf('sushi', 'Sushi', { off: ['en:sushis', 'en:makis'] }),
      loose('rotisserie', 'Rotisserie & cooked chicken', {
        off: ['en:cooked-chicken', '~en:chicken-preparations'],
      }),
    ]),
  ]),

  node('bakery', 'Bakery', { off: ['en:bakery-products', '~en:breads'] }, [
    node('bread', 'Bread', { off: ['en:sliced-breads', 'en:bread-loaves'] }, [
      loose('white-bread', 'White bread', { off: ['en:white-breads'], statcan: ['White bread'] }),
      loose('whole-grain-bread', 'Whole wheat & multigrain', {
        off: [
          '~en:wheat-breads',
          'en:whole-wheat-bread',
          'en:wholemeal-breads',
          'en:whole-wheat-breads',
          'en:breads-with-seeds',
        ],
      }),
      loose('rye-sourdough', 'Rye & sourdough', {
        off: ['en:rye-breads', 'en:sourdough-breads', 'en:sourdough-bread'],
      }),
      loose('artisan-bread', 'Baguettes & artisan bread', {
        off: ['en:baguettes', '~en:special-breads'],
      }),
      leaf('gluten-free-bread', 'Gluten-free bread', { off: ['en:gluten-free-breads'] }),
    ]),
    node('buns-bagels', 'Buns, rolls & bagels', { off: [] }, [
      loose('hamburger-hot-dog-buns', 'Hamburger & hot dog buns', {
        off: ['en:hamburger-buns', 'en:hot-dog-buns'],
      }),
      loose('dinner-rolls', 'Dinner rolls', { off: ['en:bread-rolls'] }),
      loose('bagels', 'Bagels', { off: ['en:bagel-breads'] }),
      leaf('english-muffins', 'English muffins', { off: ['en:english-muffins'] }),
    ]),
    node(
      'flatbreads',
      'Tortillas, pitas & naan',
      { off: ['en:flatbreads', '~en:wheat-flatbreads'], statcan: ['Flatbread and pita'] },
      [
        leaf('tortillas-wraps', 'Tortillas & wraps', {
          off: [
            'en:tortillas',
            'en:wraps',
            'en:Tortillas',
            'en:corn-tortillas',
            'en:flour-tortillas',
          ],
        }),
        leaf('pitas', 'Pitas', { off: ['en:pitas'] }),
        leaf('naan', 'Naan & other flatbread', { off: ['en:naans', 'en:pizza-dough'] }),
      ],
    ),
    node(
      'pastries',
      'Pastries & sweet baked goods',
      { off: ['en:viennoiseries', 'en:pastries', '~en:sweet-pastries-and-pies'] },
      [
        loose('croissants', 'Croissants & danishes', { off: ['en:croissants'] }),
        loose('muffins', 'Muffins', {
          off: ['en:muffins', 'en:fruit-muffins', 'en:blueberry-muffins', 'en:chocolate-muffins'],
        }),
        loose('donuts', 'Donuts', { off: ['en:doughnuts'] }),
        loose('sweet-buns-brioche', 'Brioche, cinnamon buns & sweet buns', {
          off: ['en:brioches', 'en:cinnamon-rolls'],
        }),
      ],
    ),
    node('cakes-pies', 'Cakes & pies', { off: ['en:cakes'] }, [
      loose('cakes', 'Cakes', {
        off: [
          'en:chocolate-cakes',
          'en:sponge-cakes',
          'en:fruit-cakes',
          'en:carrot-cakes',
          'en:panettone',
          'en:pandoro',
          'en:madeleines',
        ],
      }),
      loose('pies-tarts', 'Pies & tarts', {
        off: ['en:sweet-pies', 'en:pies', 'en:apple-pies', 'en:tartlets'],
      }),
      loose('cheesecakes', 'Cheesecakes', { off: ['en:cheesecakes'] }),
      loose('brownies-squares', 'Brownies & squares', { off: ['en:brownies'] }),
    ]),
  ]),

  node('pantry', 'Pantry', { off: ['~en:groceries', '~en:Groceries'] }, [
    node(
      'pasta',
      'Pasta & noodles',
      {
        off: [
          'en:pastas',
          '~en:cereal-pastas',
          '~en:pastas-and-dumplings',
          'en:dry-pastas',
          'en:durum-wheat-pasta',
        ],
        statcan: ['Dry or fresh pasta'],
      },
      [
        leaf('long-pasta', 'Spaghetti, linguine & long pasta', {
          off: ['en:spaghetti', 'en:linguine', 'en:tagliatelle', 'en:bucatini', 'en:vermicelli'],
        }),
        leaf('short-pasta', 'Penne, macaroni & short pasta', {
          off: ['en:penne', 'en:penne-rigate', 'en:rigatoni', 'en:fusilli', 'en:orecchiette'],
        }),
        leaf('egg-noodles-lasagna', 'Egg noodles & lasagna sheets', {
          off: ['en:egg-pastas', 'en:egg-noodles', 'en:lasagna-sheets'],
        }),
        leaf('stuffed-pasta', 'Ravioli, tortellini & stuffed pasta', {
          off: [
            'en:stuffed-pastas',
            'en:raviolis',
            'en:tortellini',
            'en:tortelloni',
            'en:agnolotti',
          ],
        }),
        leaf('gnocchi', 'Gnocchi', { off: ['en:gnocchi', 'en:potato-gnocchi'] }),
        leaf('asian-noodles', 'Rice noodles & Asian noodles', {
          off: ['~en:noodles', 'en:rice-vermicelli', 'en:rice-noodles', 'en:udon', 'en:soba'],
        }),
        leaf('instant-noodles', 'Instant noodles', {
          off: ['en:instant-noodles', 'en:instant-noodle-soups'],
        }),
        leaf('gluten-free-pasta', 'Gluten-free & legume pasta', { off: ['en:gluten-free-pasta'] }),
        leaf('pasta-kits', 'Macaroni & cheese and pasta kits', { off: ['en:macaroni-and-cheese'] }),
      ],
    ),
    node('rice-grains', 'Rice & grains', { off: ['en:rices', '~en:cereal-grains'] }, [
      loose('white-rice', 'White rice', {
        off: [
          'en:white-rices',
          '~en:long-grain-rices',
          '~en:indica-rices',
          'en:parboiled-rices',
          'en:medium-grain-rices',
          'en:short-grain-rices',
          'en:arborio-rices',
          'en:glutinous-rices',
        ],
        statcan: ['White rice'],
      }),
      leaf('aromatic-rice', 'Basmati & jasmine rice', {
        off: ['en:aromatic-rices', 'en:basmati-rices', 'en:jasmine-rice'],
      }),
      loose('brown-wild-rice', 'Brown & wild rice', {
        off: ['en:brown-rices', 'en:black-rices'],
        statcan: ['Brown rice'],
      }),
      leaf('rice-mixes', 'Rice mixes & instant rice', {
        off: [
          'en:precooked-rices',
          'en:prepared-mixes-for-risotto',
          'it:preparati-per-risotto',
          'en:rice-with-sauce',
        ],
      }),
      loose('quinoa', 'Quinoa', { off: ['en:quinoa', 'en:red-quinoa'] }),
      loose('other-grains', 'Couscous, barley & other grains', {
        off: [
          'en:couscous',
          'en:cereal-semolinas',
          'en:wheat-semolinas',
          'en:durum-wheat-semolinas',
          'en:groats',
          'en:barley',
          'en:bulgur',
          'en:millet',
          'en:buckwheat',
          'en:farro',
          'en:corn-semolinas',
          'en:cornmeal',
        ],
      }),
    ]),
    node(
      'beans-legumes',
      'Beans & lentils',
      { off: ['en:legumes', '~en:legumes-and-their-products', 'en:pulses', 'en:legume-seeds'] },
      [
        leaf('canned-beans', 'Canned beans & chickpeas', {
          off: [
            'en:canned-legumes',
            'en:canned-common-beans',
            'en:canned-chickpeas',
            'en:canned-lentils',
            'en:canned-black-beans',
            'en:canned-red-kidney-beans',
            'en:refried-beans',
          ],
          statcan: ['Canned beans and lentils'],
        }),
        leaf('baked-beans', 'Baked beans', {
          off: ['en:baked-beans-in-tomato-sauce'],
          statcan: ['Canned baked beans'],
        }),
        loose('dried-lentils', 'Dried lentils & split peas', {
          off: [
            'en:lentils',
            'en:dried-lentils',
            'en:red-lentils',
            'en:green-lentils',
            'en:dried-peas',
            'en:prepared-split-peas',
          ],
          statcan: ['Dried lentils'],
        }),
        loose('dried-beans', 'Dried beans & chickpeas', {
          off: [
            'en:common-beans',
            'en:black-beans',
            'en:red-beans',
            'en:white-beans',
            'en:navy-beans',
            'en:pinto-beans',
            '~en:chickpeas',
            'en:dried-chickpeas',
            'en:mung-beans',
            'en:edamame',
            'en:fava-beans',
          ],
          statcan: ['Dry beans and legumes'],
        }),
      ],
    ),
    node(
      'canned',
      'Canned vegetables & fruit',
      { off: ['~en:canned-foods', '~en:canned-plant-based-foods', 'en:canned-vegetables'] },
      [
        leaf('canned-tomatoes', 'Canned tomatoes & paste', {
          off: [
            'en:canned-tomatoes',
            '~en:tomatoes',
            'en:canned-tomato-products',
            'en:tomato-pastes',
            'en:strained-tomatoes',
            'en:crushed-tomatoes',
            'en:tomato-purees',
          ],
          statcan: ['Canned tomatoes'],
        }),
        leaf('canned-corn', 'Canned corn', {
          off: ['en:canned-corn', 'en:canned-sweet-corn'],
          statcan: ['Canned corn'],
        }),
        leaf('canned-vegetables-other', 'Other canned vegetables', {
          off: [
            'en:canned-green-beans',
            'en:canned-peas',
            'en:canned-mushrooms',
            'en:canned-carrots',
            'en:canned-potatoes',
            'en:canned-artichokes',
            'en:artichoke-hearts',
            'en:canned-asparagus',
            'en:bamboo-shoots',
            'en:canned-pumpkin',
          ],
        }),
        leaf('canned-fruit', 'Canned fruit & fruit cups', {
          off: [
            'en:canned-fruits',
            'en:fruit-salads',
            'en:fruits-in-syrup',
            'en:canned-peaches',
            'en:canned-pineapples',
            'en:fruit-cups',
          ],
          statcan: ['Canned peach', 'Canned pear'],
        }),
        leaf('dried-vegetables', 'Dried tomatoes & vegetables', {
          off: [
            'en:dried-tomatoes',
            'en:dried-vegetables',
            'en:dried-mushrooms',
            '~en:dried-products-to-be-rehydrated',
          ],
        }),
      ],
    ),
    node(
      'canned-fish-meat',
      'Canned fish & meat',
      { off: ['en:canned-fishes', 'en:canned-seafood', 'en:canned-meats'] },
      [
        leaf('canned-tuna', 'Canned tuna', {
          off: ['en:tunas', 'en:canned-tunas', 'en:tunas-in-oil'],
          statcan: ['Canned tuna'],
        }),
        leaf('canned-salmon', 'Canned salmon', {
          off: ['en:canned-salmons', 'en:canned-wild-pink-salmon'],
          statcan: ['Canned salmon'],
        }),
        leaf('sardines-other', 'Sardines, mackerel & other canned fish', {
          off: [
            'en:sardines',
            'en:canned-sardines',
            'en:sardines-in-oil',
            'en:sardines-in-tomato-sauce',
            'en:canned-herrings',
          ],
        }),
        leaf('canned-meat', 'Canned meat', { off: [] }),
      ],
    ),
    node('soups-broths', 'Soups & broths', { off: ['en:soups'] }, [
      leaf('canned-soup', 'Canned & ready soup', {
        off: [
          'en:canned-soups',
          'en:condensed-soup',
          'en:vegetable-soups',
          'en:chicken-soups',
          'en:cream-soups',
          'en:tomato-soups',
          'en:lentil-soups',
          'en:pea-soups',
          'en:mushroom-soups',
          'en:bean-soups',
        ],
        statcan: ['Canned soup'],
      }),
      leaf('broth-stock', 'Broth & stock', {
        off: [
          'en:broths',
          'en:poultry-broth',
          'en:chicken-broths',
          'en:vegetable-broths',
          'en:dehydrated-broths',
          'en:bouillon-cubes',
          'en:liquid-broths',
        ],
      }),
      leaf('soup-mixes', 'Dry soup mixes', { off: ['en:dehydrated-soups', 'en:soup-mixes'] }),
    ]),
    node(
      'baking',
      'Baking',
      { off: ['~en:pastry-helpers', '~en:cooking-helpers', 'en:baking-ingredients'] },
      [
        leaf('flour', 'Flour', {
          off: [
            'en:flours',
            'en:wheat-flours',
            'en:cereal-flours',
            'en:whole-wheat-flours',
            'en:bread-flours',
            'en:rice-flours',
            'en:oat-flours',
            'en:spelt-flours',
            'en:chickpea-flours',
            'en:legume-flours',
            'en:starches',
          ],
          statcan: ['Wheat flour'],
        }),
        leaf('sugar', 'Sugar', {
          off: [
            'en:sugars',
            'en:white-sugars',
            'en:granulated-sugars',
            'en:brown-sugars',
            'en:cane-sugars',
            'en:powdered-sugars',
          ],
          statcan: ['White sugar'],
        }),
        leaf('sugar-substitutes', 'Sweeteners & sugar substitutes', {
          off: ['en:sugar-substitutes', 'en:sucralose', 'en:xylitol'],
        }),
        leaf('baking-mixes', 'Cake, cookie & bread mixes', {
          off: [
            'en:baking-mixes',
            'en:cake-mixes',
            'en:Frosting',
            '~en:dessert-mixes',
            'en:sprinkles',
          ],
        }),
        leaf('chocolate-chips-cocoa', 'Chocolate chips & cocoa', {
          off: [
            'en:chocolate-chips',
            'en:cocoa-powders',
            '~en:cocoa-and-chocolate-powders',
            'en:cacao-nibs',
          ],
        }),
        leaf('baking-ingredients', 'Baking powder, yeast & extracts', {
          off: [
            'en:baking-powders',
            'en:baking-powder',
            'en:flavors',
            'en:food-additives',
            'en:thickeners',
            'en:agar-agar',
          ],
        }),
        leaf('dough-crusts', 'Pie crusts & dough', {
          off: ['en:pie-dough', 'en:pie-shell', 'en:phyllo-dough'],
        }),
        leaf('breadcrumbs-coatings', 'Breadcrumbs, croutons & coatings', {
          off: ['en:bread-crumbs', 'en:panko', 'en:croutons'],
        }),
      ],
    ),
    node('oils-vinegars', 'Oils & vinegars', { off: ['~en:vegetable-fats', 'en:vegetable-oils'] }, [
      leaf('olive-oil', 'Olive oil', {
        off: [
          'en:olive-oils',
          'en:extra-virgin-olive-oils',
          'en:virgin-olive-oils',
          'en:olive-pomace-oils',
          '~en:olive-tree-products',
        ],
        statcan: ['Olive oil'],
      }),
      leaf('canola-oil', 'Canola oil', {
        off: ['en:canola-oils', 'en:rapeseed-oils'],
        statcan: ['Canola oil'],
      }),
      leaf('vegetable-oil', 'Vegetable & sunflower oil', {
        off: [
          'en:sunflower-oils',
          'en:corn-oils',
          'en:cereal-oils',
          'en:peanut-oils',
          'en:safflower-oils',
        ],
        statcan: ['Vegetable oil'],
      }),
      leaf('specialty-oils', 'Avocado, coconut & specialty oils', {
        off: [
          'en:avocado-oils',
          'en:coconut-oils',
          'en:sesame-oils',
          'en:fruit-and-fruit-seed-oils',
          'en:nut-oils',
          'en:walnut-oils',
          'en:pumpkin-seed-oils',
        ],
      }),
      leaf('cooking-fats', 'Shortening, lard & cooking sprays', {
        off: ['en:lards', '~en:animal-fats'],
      }),
      leaf('vinegar', 'Vinegar', {
        off: [
          'en:vinegars',
          'en:balsamic-vinegars',
          'en:balsamic-vinegars-of-modena',
          'en:cider-vinegars',
          'en:white-vinegars',
          'en:wine-vinegars',
          'en:red-wine-vinegars',
          'en:rice-vinegars',
        ],
      }),
    ]),
    node(
      'spices-seasonings',
      'Spices & seasonings',
      { off: ['en:herbs-and-spices', '~en:culinary-plants'] },
      [
        leaf('spices', 'Spices', {
          off: [
            'en:spices',
            'en:turmeric',
            'en:cinnamon',
            'en:cumin',
            'en:paprika',
            'en:black-peppers',
            'en:peppercorns',
            'en:ground-black-peppers',
            'en:chili-powders',
            'en:curry-powders',
            'en:nutmeg',
            'en:cloves',
            'en:cayenne-peppers',
            'en:garlic-powders',
            'en:onion-powders',
            'en:cardamom',
            'en:spice-blends',
          ],
        }),
        leaf('dried-herbs', 'Dried herbs', {
          off: [
            'en:oregano',
            'en:basil',
            'en:thyme',
            'en:rosemary',
            'en:parsley',
            'en:dill',
            'en:herbes-de-provence',
            'en:mint',
          ],
        }),
        leaf('salt', 'Salt', {
          off: ['en:salts', 'en:sea-salts', 'en:table-salts', 'en:flavoured-salts'],
        }),
        leaf('seasoning-mixes', 'Seasoning mixes & rubs', {
          off: ['en:dehydrated-sauces'],
        }),
      ],
    ),
    node('world-foods', 'World foods', { off: [] }, [
      leaf('asian-ingredients', 'Asian ingredients', {
        off: [
          'en:rice-paper',
          'en:seaweeds-and-their-products',
          'en:dried-seaweeds',
          'en:misos',
          'en:curry-pastes',
          'en:oyster-sauces',
          'en:hoisin-sauces',
          'en:fried-onions',
        ],
      }),
      leaf('coconut-milk', 'Coconut milk & cream', {
        off: ['en:coconut-milks-and-creams', 'en:coconut-milks'],
      }),
      leaf('latin-ingredients', 'Taco shells & Latin American', { off: [] }),
    ]),
  ]),

  node('condiments', 'Condiments & sauces', { off: ['~en:sauces', '~en:condiments'] }, [
    node('pasta-sauces', 'Pasta sauces', { off: ['en:pasta-sauces'], statcan: ['Pasta sauce'] }, [
      leaf('tomato-pasta-sauce', 'Tomato pasta sauce', {
        off: [
          'en:tomato-sauces',
          'en:tomato-sauces-with-basil',
          'en:arrabbiata-sauces',
          'en:bolognese-sauces',
          'en:meat-based-pasta-sauces',
          'en:meat-based-sauces',
        ],
      }),
      leaf('pesto', 'Pesto', {
        off: ['en:pestos', 'en:green-pestos', 'en:red-pestos', 'en:basil-pestos'],
      }),
      leaf('cream-sauces', 'Alfredo & cream sauces', {
        off: [
          'en:alfredo-sauces',
          'en:cheese-sauces',
          'en:cream-sauces',
          'en:carbonara-sauces',
          'en:white-sauces',
        ],
      }),
      leaf('pizza-sauce', 'Pizza sauce', { off: ['en:pizza-sauces'] }),
    ]),
    node('table-condiments', 'Ketchup, mustard & mayo', { off: [] }, [
      leaf('ketchup', 'Ketchup', {
        off: ['en:ketchup', 'en:tomato-ketchup'],
        statcan: ['Ketchup'],
      }),
      leaf('mustard', 'Mustard', {
        off: [
          'en:mustards',
          'en:dijon-mustards',
          'en:yellow-mustards',
          'en:honey-mustards',
          'en:old-style-mustards',
        ],
      }),
      leaf('mayonnaise', 'Mayonnaise & sandwich spreads', {
        off: ['en:mayonnaises', 'en:aiolis', 'en:light-mayonnaises'],
        statcan: ['Mayonnaise'],
      }),
      leaf('relish', 'Relish', { off: ['en:relish', 'en:chutneys'] }),
    ]),
    node('cooking-sauces', 'Cooking & table sauces', { off: [] }, [
      leaf('bbq-sauce', 'Barbecue sauce', { off: ['en:barbecue-sauces'] }),
      leaf('hot-sauce', 'Hot sauce', { off: ['en:hot-sauces', 'en:sriracha-sauces', 'en:sambal'] }),
      leaf('soy-asian-sauces', 'Soy & Asian sauces', {
        off: [
          'en:soy-sauces',
          'en:teriyaki-sauces',
          'en:sweet-and-sour-sauces',
          'en:satay-sauces',
          'en:peanut-sauces',
          'en:gochujang',
        ],
      }),
      leaf('meal-sauces', 'Curry & simmer sauces', {
        off: [
          'en:meal-sauces',
          'fr:sauces-poutine',
          'fr:Sauces poutine',
          'en:Indian Cooking Sauce',
          'en:curry-sauces',
          'en:butter-chicken-sauces',
          'en:indian-sauces',
          'en:cooking-sauces',
          'en:marinades',
          'en:worcestershire-sauces',
        ],
      }),
      leaf('salsa', 'Salsa', {
        off: ['en:salsa', 'en:Salsa', 'en:salsa-verde'],
        statcan: ['Salsa'],
      }),
    ]),
    node(
      'dressings',
      'Salad dressings',
      { off: ['en:salad-dressings'], statcan: ['Salad dressing'] },
      [
        leaf('creamy-dressing', 'Creamy dressings', { off: [] }),
        leaf('vinaigrettes', 'Vinaigrettes', { off: ['en:vinaigrettes'] }),
      ],
    ),
    node(
      'pickles-olives',
      'Pickles & olives',
      {
        off: [
          '~en:pickles',
          '~en:plant-based-pickles',
          'en:pickled-vegetables',
          'en:fermented-vegetables',
        ],
      },
      [
        leaf('pickles', 'Pickles', {
          off: ['en:pickled-cucumbers', 'en:gherkins', 'en:pickled-gherkins', 'en:dill-pickles'],
        }),
        leaf('olives', 'Olives', {
          off: [
            'en:olives',
            'en:green-olives',
            'en:black-olives',
            'en:stuffed-olives',
            'en:kalamata-olives',
            'en:pitted-olives',
          ],
        }),
        leaf('sauerkraut-kimchi', 'Sauerkraut, kimchi & other pickled vegetables', {
          off: [
            'en:sauerkrauts',
            'en:kimchi',
            'en:pickled-onions',
            'en:pickled-beets',
            'en:pickled-peppers',
          ],
        }),
      ],
    ),
  ]),

  node('breakfast', 'Breakfast & spreads', { off: ['~en:breakfasts'] }, [
    node('cereal', 'Cereal', { off: ['en:breakfast-cereals'], statcan: ['Cereal'] }, [
      leaf('cold-cereal', 'Cold cereal', {
        off: [
          'en:extruded-cereals',
          '~en:flakes',
          '~en:cereal-flakes',
          'en:corn-flakes',
          'en:extruded-flakes',
          'en:puffed-cereals',
          'en:puffed-grains',
          'en:chocolate-cereals',
          'fr:Céréales au chocolat pour petit-déjeuner',
          'en:cereals-with-fruits',
          'en:filled-cereals',
          'en:puffed-rice',
        ],
      }),
      leaf('granola-muesli', 'Granola & muesli', {
        off: ['en:mueslis', 'en:mueslis-with-fruits', 'en:mueslis-with-nuts'],
      }),
      leaf('oatmeal', 'Oats & hot cereal', {
        off: [
          'en:rolled-oats',
          'en:oat',
          'en:rolled-flakes',
          'en:overnight-oats',
          'en:cereal-brans',
        ],
      }),
    ]),
    node('pancakes-waffles', 'Pancakes & waffles', { off: [] }, [
      leaf('pancake-mixes', 'Pancake & waffle mixes', { off: ['en:pancake-mixes'] }),
      leaf('frozen-waffles', 'Frozen waffles & pancakes', {
        off: [
          'en:waffles',
          'en:crepes-and-galettes',
          'en:crepes-and-pancakes',
          'en:plain-buckwheat-crepes',
          'en:pancakes',
          'en:crepes',
        ],
      }),
    ]),
    node(
      'spreads',
      'Spreads, honey & syrups',
      {
        off: ['~en:spreads', '~en:sweet-spreads', '~en:plant-based-spreads', 'fr:pates-a-tartiner'],
      },
      [
        leaf('peanut-butter', 'Peanut butter', {
          off: ['en:peanut-butters', 'en:crunchy-peanut-butters'],
          statcan: ['Peanut butter'],
        }),
        leaf('nut-seed-butters', 'Almond & other nut and seed butters', {
          off: [
            '~en:nut-butters',
            'en:almond-butters',
            'en:cashew-butters',
            '~en:hazelnut-butters',
            'en:sunflower-seed-butters',
            'en:tahini',
            'en:cereal-butters',
            '~en:legume-butters',
            '~en:oilseed-purees',
            'en:speculoos-spreads',
          ],
        }),
        leaf('jam', 'Jam & fruit spreads', {
          off: [
            'en:jams',
            'en:berry-jams',
            'en:strawberry-jams',
            'en:raspberry-jams',
            'en:apricot-jams',
            'en:fruit-jams',
            'en:fruit-spread',
            'en:fruit-preserves',
            'en:marmalades',
            'en:fruit-spreads',
            'en:blueberry-jams',
            'en:cherry-jams',
            'en:peach-jams',
            'en:lemon-curds',
          ],
        }),
        leaf('honey', 'Honey', {
          off: [
            'en:honeys',
            '~en:bee-products',
            'en:liquid-honeys',
            'en:clover-honeys',
            'en:manuka-honeys',
            'en:organic-honeys',
          ],
        }),
        leaf('maple-syrup', 'Maple syrup & maple products', {
          off: [
            'en:maple-syrups',
            'fr:beurre-d-erable',
            "fr:Beurre d'érable",
            'en:amber-maple-syrups',
            'en:dark-maple-syrups',
            'en:maple-butters',
            'en:maple-sugars',
          ],
        }),
        leaf('other-syrups', 'Pancake, agave & other syrups', {
          off: [
            '~en:syrups',
            '~en:simple-syrups',
            'en:agave-syrups',
            'en:corn-syrups',
            'en:molasses',
            'en:date-syrups',
            'en:rice-syrups',
            'en:dessert-sauces',
          ],
        }),
        leaf('chocolate-spreads', 'Chocolate & hazelnut spreads', {
          off: ['en:chocolate-spreads', 'en:hazelnut-spreads', 'en:cocoa-and-hazelnuts-spreads'],
        }),
      ],
    ),
  ]),

  node(
    'snacks',
    'Snacks',
    { off: ['~en:snacks', '~en:salty-snacks', '~en:salted-snacks', '~en:appetizers'] },
    [
      node(
        'chips',
        'Chips & salty snacks',
        {
          off: [
            'en:chips-and-fries',
            'en:crisps',
            'fr:croustilles',
            'en:Chips',
            'en:chips',
            '~en:salty-snacks-made-from-potato',
          ],
        },
        [
          leaf('potato-chips', 'Potato chips', {
            off: [
              'en:potato-crisps',
              'en:flavoured-potato-crisps',
              'en:ketchup-crisps',
              'en:ketchup-chips',
              'en:salt-and-vinegar-crisps',
              'en:potato-crisps-in-sunflower-oil',
              'en:stacked-extruded-potato-crisps',
              'en:wavy-potato-crisps',
            ],
          }),
          leaf('tortilla-chips', 'Tortilla & corn chips', {
            off: ['en:corn-chips', 'en:corn-snacks', 'en:Corn snacks'],
          }),
          leaf('other-chips', 'Veggie, pita & other chips', {
            off: [
              'en:vegetable-chips',
              'en:pita-chips',
              'en:Pita chips',
              'en:kale-chips',
              'en:plantain-chips',
              'en:lentil-chips',
              'en:prawn-crackers',
            ],
          }),
          leaf('popcorn', 'Popcorn', { off: ['en:popcorn', 'en:salted-popcorn'] }),
          leaf('pretzels', 'Pretzels', { off: ['en:pretzel'] }),
          leaf('puffs', 'Cheese puffs & extruded snacks', {
            off: ['en:puffed-snacks', 'en:corn-puffs', 'en:puffed-salty-snacks'],
          }),
        ],
      ),
      node(
        'crackers',
        'Crackers & rice cakes',
        {
          off: [
            '~en:biscuits-and-crackers',
            'en:crackers-appetizers',
            'en:Crackers',
            'fr:craquelin',
            'fr:Craquelins',
            'en:Craquelins',
            'en:crackers',
            'fr:craquelins',
          ],
          statcan: ['Crackers and crisp breads'],
        },
        [
          leaf('crackers', 'Crackers', {
            off: [
              'en:salted-crackers',
              'en:wheat-crackers',
              'en:rice-crackers',
              'en:crispbreads',
              'en:breadsticks',
              'en:rusks',
              'en:dry-biscuits',
            ],
          }),
          leaf('rice-cakes', 'Rice & corn cakes', {
            off: [
              'en:puffed-cereal-cakes',
              'en:puffed-rice-cakes',
              'en:rice-cakes',
              'en:puffed-corn-cakes',
            ],
          }),
        ],
      ),
      node(
        'cookies',
        'Cookies & sweet biscuits',
        { off: ['en:biscuits', '~en:biscuits-and-cakes'], statcan: ['Cookies and sweet biscuits'] },
        [
          leaf('chocolate-chip', 'Chocolate chip & drop cookies', {
            off: [
              'en:chocolate-chip-cookies',
              'en:drop-cookies',
              'en:chocolate-biscuits',
              'en:oatmeal-cookies',
              'en:macarons',
              'en:coconut-macaroons',
            ],
          }),
          leaf('sandwich-cookies', 'Sandwich & filled cookies', { off: ['en:filled-biscuits'] }),
          leaf('wafers', 'Wafers', { off: ['en:wafers', 'en:stuffed-wafers'] }),
          leaf('shortbread-tea', 'Shortbread & tea biscuits', {
            off: ['en:shortbread-cookies', 'en:speculoos', 'en:biscotti', 'en:petit-beurre'],
          }),
        ],
      ),
      node('bars', 'Snack bars', { off: ['en:bars', 'en:snack-bar'] }, [
        leaf('granola-bars', 'Granola & cereal bars', {
          off: ['en:cereal-bars', 'en:bars-covered-with-chocolate'],
        }),
        leaf('protein-bars', 'Protein bars', {
          off: ['en:protein-bars', 'en:protein-energy-bars'],
        }),
        leaf('nut-fruit-bars', 'Nut, fruit & energy bars', {
          off: ['en:nut-bars', 'en:energy-bars', 'en:energy-bites', 'en:seed-bars'],
        }),
      ]),
      node(
        'nuts-seeds-dried-fruit',
        'Nuts, seeds & dried fruit',
        {
          off: [
            'en:nuts',
            '~en:nuts-and-their-products',
            '~en:seeds',
            'en:shelled-nuts',
            'en:roasted-nuts',
            'en:salted-nuts',
          ],
        },
        [
          loose('almonds', 'Almonds', {
            off: [
              'en:almonds',
              'en:roasted-almonds',
              'en:salted-almonds',
              'en:raw-almonds',
              'en:whole-almonds',
              'en:almond-flakes',
            ],
            statcan: ['Almonds'],
          }),
          loose('peanuts', 'Peanuts', {
            off: ['en:peanuts', 'en:roasted-peanuts', 'en:salted-peanuts'],
            statcan: ['Peanuts'],
          }),
          loose('other-nuts', 'Cashews, pistachios & other nuts', {
            off: [
              'en:cashew-nuts',
              'en:pistachios',
              'en:salted-pistachios',
              'en:walnuts',
              'en:hazelnuts',
              'en:macadamia-nuts',
              'en:brazil-nuts',
              'en:pine-nuts',
              'en:mixed-nuts',
              'en:french-nuts',
              'en:pecan-nuts',
              'en:roasted-cashews',
              '~en:coconuts-and-their-products',
            ],
          }),
          loose('seeds', 'Sunflower, pumpkin, chia & other seeds', {
            off: [
              'en:sunflower-seeds',
              '~en:sunflower-seeds-and-their-products',
              'en:pumpkin-seeds',
              '~en:pumpkin-seeds-and-their-products',
              '~en:cucurbitacea-seeds',
              'en:chia',
              'en:flax-seeds',
              'en:brown-flax-seeds',
              'en:ground-flax-seeds',
              'en:hemp-seeds',
              'en:Hemp hearts',
              'en:shelled-hemp-seeds',
              'en:sesame',
              'en:shelled-sunflower-seeds',
            ],
            statcan: ['Sunflower seeds'],
          }),
          loose('dried-fruit', 'Dried fruit', {
            off: [
              'en:dried-fruits',
              'en:raisins',
              'en:dates',
              '~en:dates-and-their-products',
              'en:pitted-dates',
              'en:medjool-dates',
              'en:dried-apricots',
              'en:dried-prunes',
              'en:dried-cranberries',
              'en:dried-figs',
              'en:dried-mangoes',
              'en:dried-bananas',
              'en:dried-apples',
              'en:candied-fruits',
            ],
          }),
          loose('trail-mix', 'Trail mix', { off: ['en:trail-mixes', 'en:trail-mix'] }),
        ],
      ),
      node('meat-snacks', 'Jerky & meat snacks', { off: ['en:dried-meats'] }, [
        leaf('jerky', 'Jerky & meat sticks', { off: ['en:beef-jerkies'] }),
      ]),
      node(
        'fruit-snacks',
        'Fruit snacks & applesauce',
        { off: ['~en:compotes', 'en:fruit-snacks'] },
        [
          leaf('applesauce', 'Applesauce & fruit purée cups', {
            off: ['en:apple-compotes', 'en:fruits-puree-without-sugar-added', 'en:applesauces'],
          }),
          leaf('fruit-gummies', 'Fruit snacks & fruit leather', {
            off: ['en:fruit-confectioneries', 'en:fruit-snack'],
          }),
        ],
      ),
    ],
  ),

  node(
    'candy-chocolate',
    'Candy & chocolate',
    { off: ['~en:confectioneries', '~en:cocoa-and-its-products'] },
    [
      node(
        'chocolate',
        'Chocolate',
        {
          off: [
            'en:chocolates',
            'fr:tablette-chocolat',
            '~en:chocolate-candies',
            'en:chocolate-bars',
            'en:chocolates-with-almonds',
            'en:chocolates-with-hazelnuts',
            'en:filled-chocolates',
            'en:salted-chocolates',
          ],
        },
        [
          leaf('milk-chocolate', 'Milk chocolate bars', {
            off: [
              'en:milk-chocolates',
              'en:milk-chocolate-bar',
              'en:milk-chocolate-bars',
              'en:milk-chocolates-with-hazelnuts',
              'en:milk-chocolates-with-almonds',
              'en:milk-chocolate-with-caramel',
            ],
          }),
          leaf('dark-chocolate', 'Dark chocolate bars', {
            off: [
              'en:dark-chocolates',
              'en:dark-chocolate-bar',
              'en:dark-chocolate-bars',
              'en:dark-chocolates-with-almonds',
              'en:dark-chocolates-with-orange',
              'en:dark-chocolates-with-hazelnuts',
            ],
          }),
          leaf('white-chocolate', 'White chocolate', {
            off: ['en:white-chocolates', 'en:white-chocolate-bars'],
          }),
          leaf('candy-bars', 'Candy bars', {
            off: ['en:candy-chocolate-bars', 'en:caramel-chocolate-bars'],
          }),
          leaf('chocolate-bites', 'Chocolate candies & bites', {
            off: [
              'en:bonbons',
              'en:truffles',
              'en:chocolate-truffles',
              'en:chocolate-covered-nuts',
              'en:chocolate-covered-nuts-and-fruits',
              'en:chocolate-covered-fruits',
              'en:chocolate-covered-almonds',
              'en:chocolate-covered-peanuts',
              'en:chocolate-covered-raisins',
              'en:peanut-butter-cups',
              'en:assorted-chocolates',
              'en:nut-confectioneries',
            ],
          }),
          leaf('seasonal-chocolate', 'Seasonal chocolate', {
            off: ['en:chocolate-eggs', 'en:easter-eggs', 'en:advent-calendars'],
          }),
        ],
      ),
      node('candy', 'Candy', { off: ['en:candies'] }, [
        leaf('gummies', 'Gummies & chewy candy', {
          off: [
            'en:gummi-candies',
            'en:gummy-candies',
            'en:gummy-bears',
            'en:gummies',
            'en:liquorice',
            'en:jelly-beans',
            'en:fruit-jellies',
            'en:caramels',
            'en:fudge',
            'en:nougats',
          ],
        }),
        leaf('hard-candy-mints', 'Hard candy & mints', {
          off: ['en:hard-candies', 'en:lollipops', 'en:cough-drops', 'en:candy-canes'],
        }),
        leaf('marshmallows', 'Marshmallows', { off: ['en:marshmallows'] }),
      ]),
      node('gum', 'Gum', { off: ['en:chewing-gums'] }, [
        leaf('chewing-gum', 'Chewing gum', {
          off: ['en:chewing-gum', 'en:sugar-free-chewing-gum'],
        }),
      ]),
    ],
  ),

  node('frozen', 'Frozen', { off: ['~en:frozen-foods'] }, [
    node(
      'vegetables',
      'Frozen vegetables',
      { off: ['en:frozen-vegetables', '~en:frozen-plant-based-foods'] },
      [
        leaf('broccoli', 'Frozen broccoli & cauliflower', {
          off: ['en:frozen-cauliflowers', 'en:frozen-brussels-sprouts'],
          statcan: ['Frozen broccoli'],
        }),
        leaf('corn', 'Frozen corn', { off: ['en:frozen-corn'], statcan: ['Frozen corn'] }),
        leaf('peas', 'Frozen peas', {
          off: ['en:frozen-green-peas', 'en:green-peas'],
          statcan: ['Frozen peas'],
        }),
        leaf('green-beans', 'Frozen green beans', {
          off: ['en:frozen-green-beans', 'en:green-beans'],
          statcan: ['Frozen green beans'],
        }),
        leaf('mixed-vegetables', 'Frozen mixed vegetables', {
          off: ['en:frozen-mixed-vegetables', 'en:mixed-vegetables'],
          statcan: ['Frozen mixed vegetables'],
        }),
        leaf('spinach', 'Frozen spinach & greens', {
          off: ['en:frozen-spinachs'],
          statcan: ['Frozen spinach'],
        }),
        leaf('other-vegetables', 'Other frozen vegetables', {
          off: ['en:frozen-edamame', 'en:frozen-carrots'],
        }),
      ],
    ),
    node('fruit', 'Frozen fruit', { off: ['en:frozen-fruits'] }, [
      leaf('strawberries', 'Frozen strawberries', {
        off: ['en:frozen-strawberries'],
        statcan: ['Frozen strawberries'],
      }),
      leaf('berries', 'Frozen blueberries & mixed berries', {
        off: [
          'en:frozen-berries',
          'en:frozen-blueberries',
          'en:frozen-raspberries',
          'en:frozen-cranberries',
        ],
      }),
      leaf('other-fruit', 'Mango, pineapple & other frozen fruit', {
        off: ['en:frozen-pineapples', 'en:frozen-peaches', 'en:frozen-tropical-fruits'],
      }),
    ]),
    node('potatoes', 'Frozen potatoes', { off: ['~en:potatoes-and-their-products'] }, [
      leaf('fries', 'French fries', {
        off: [
          'en:frozen-fried-potatoes',
          'en:frozen-potato-fries',
          'en:potato-fries',
          'en:french-fries',
          'en:fries',
          'en:potato-wedges',
        ],
        statcan: ['Frozen french fried potatoes'],
      }),
      leaf('other-potatoes', 'Hash browns & other potato', {
        off: [
          'en:hash-browns',
          'en:mashed-potatoes',
          'en:instant-mashed-potatoes',
          'en:frozen-potatoes',
        ],
      }),
    ]),
    node(
      'desserts',
      'Ice cream & frozen desserts',
      { off: ['en:frozen-desserts', 'en:ice-creams-and-sorbets'] },
      [
        leaf('ice-cream', 'Ice cream', { off: ['en:ice-creams', 'en:ice-cream-tubs'] }),
        leaf('novelties', 'Ice cream bars, cones & sandwiches', {
          off: [
            'en:ice-cream-sandwiches',
            'en:ice-bar',
            'en:ice-cream-bars',
            '~en:ice-cream-cones',
            'en:ice-pops',
            'en:frozen-treats',
          ],
        }),
        leaf('sorbet-frozen-yogurt', 'Sorbet & frozen yogurt', {
          off: ['en:sorbets', 'en:frozen-yogurts'],
        }),
        leaf('plant-based-frozen', 'Plant-based frozen desserts', {
          off: [
            'en:plant-based-ice-creams',
            'en:non-dairy-frozen-desserts',
            '~en:non-dairy-desserts',
          ],
        }),
      ],
    ),
  ]),

  node(
    'prepared-meals',
    'Prepared meals',
    {
      off: [
        '~en:meals',
        'en:frozen-ready-made-meals',
        '~en:meal-kits',
        '~fr:repas-surgele',
        'en:microwave-meals',
        'en:combination-meals',
        'en:canned-meals',
      ],
    },
    [
      node(
        'pizza',
        'Pizza',
        { off: ['en:pizzas', '~en:pizzas-pies-and-quiches'], statcan: ['Frozen pizza'] },
        [
          leaf('frozen-pizza', 'Frozen pizza', {
            off: [
              'en:frozen-pizzas',
              'en:frozen-pizzas-and-pies',
              'en:pepperoni-pizzas',
              'en:cheese-pizzas',
              'en:vegetarian-pizzas',
              'en:margherita-pizzas',
            ],
          }),
          leaf('pizza-snacks', 'Pizza snacks & pockets', { off: ['en:pizza-pockets'] }),
        ],
      ),
      node('pasta-dishes', 'Pasta dishes', { off: ['en:pasta-dishes'] }, [
        leaf('lasagna', 'Lasagna', {
          off: [
            'en:prepared-lasagne',
            'en:meat-lasagnas',
            'en:bolognese-lasagne',
            'en:vegetable-lasagnas',
          ],
        }),
        leaf('other-pasta-dishes', 'Other pasta dishes', { off: ['en:cannelloni'] }),
      ]),
      node('entrees', 'Entrées & bowls', { off: [] }, [
        leaf('meat-entrees', 'Meat & poultry entrées', {
          off: [
            'en:meals-with-meat',
            'en:salisbury-steak',
            'en:poultry-meals',
            'en:meals-with-chicken',
            'en:meals-with-beef',
            'en:meals-with-pork',
            'en:beef-dishes',
            '~en:meat-preparations',
            'en:meatballs',
            'en:chili-con-carne',
            'en:stews',
            'en:butter-chicken',
            'en:frozen-meals-with-meat',
          ],
        }),
        leaf('fish-entrees', 'Fish & seafood entrées', { off: ['en:meals-with-fish'] }),
        leaf('vegetarian-entrees', 'Vegetarian entrées & bowls', {
          off: [
            'en:vegetarian-meals',
            'en:Dal makhani',
            'en:vegan-meals',
            '~en:prepared-vegetables',
            'en:falafels',
            'en:tofu-dishes',
          ],
        }),
        leaf('rice-dishes', 'Rice dishes', { off: ['en:rice-dishes', 'en:risottos'] }),
      ]),
      node('hand-held', 'Burritos, pies & hand-held', { off: [] }, [
        leaf('burritos-wraps', 'Burritos & wraps', { off: ['en:burritos'] }),
        leaf('savoury-pies', 'Pot pies, quiches & meat pies', {
          off: [
            'en:quiches',
            'en:lorraine-quiche',
            'en:meat-pies',
            'en:chicken-pot-pies',
            'en:sausage-rolls',
          ],
        }),
        leaf('appetizers', 'Samosas, dumplings & spring rolls', {
          off: [
            'en:samosas',
            'en:frozen-perogies',
            'xx:dumplings',
            'en:dumplings',
            'en:spring-rolls',
            'en:pierogi',
            'en:perogies',
            'en:mozzarella-sticks',
            '~en:breaded-products',
            'en:arancini',
            'en:pakoras',
            'en:bhajis',
          ],
        }),
      ]),
    ],
  ),

  node(
    'beverages',
    'Beverages',
    {
      off: [
        '~en:beverages',
        '~en:beverages-and-beverages-preparations',
        '~en:non-alcoholic-beverages',
      ],
    },
    [
      node('water', 'Water', { off: ['en:waters'] }, [
        leaf('still-water', 'Spring & still water', {
          off: ['en:spring-waters', 'en:natural-mineral-waters', 'en:distilled-waters'],
        }),
        leaf('sparkling-water', 'Sparkling & mineral water', {
          off: [
            'en:carbonated-waters',
            'en:mineral-waters',
            'en:flavored-sparkling-waters',
            'en:club-sodas',
            'en:carbonated-mineral-waters',
          ],
        }),
        leaf('flavoured-water', 'Flavoured & enhanced water', {
          off: ['en:flavored-waters', 'en:vitamin-waters', 'en:coconut-waters'],
        }),
      ]),
      node(
        'soft-drinks',
        'Soft drinks',
        {
          off: [
            'en:sodas',
            'en:soft-drinks',
            'en:carbonated-drinks',
            'en:diet-sodas',
            '~en:sweetened-beverages',
            '~en:artificially-sweetened-beverages',
            '~en:diet-beverages',
          ],
        },
        [
          leaf('cola', 'Cola', { off: ['en:colas', 'en:diet-cola-soft-drink'] }),
          leaf('other-soft-drinks', 'Ginger ale, lemon-lime & other sodas', {
            off: ['en:fruit-sodas', 'en:fruit-soft-drinks', 'en:root-beers'],
          }),
        ],
      ),
      node(
        'juice',
        'Juice',
        {
          off: [
            'en:juices-and-nectars',
            '~en:fruit-based-beverages',
            'en:fruit-juices',
            'fr:jus',
            'fr:Jus',
          ],
        },
        [
          leaf('orange-juice', 'Orange juice', {
            off: [
              'en:orange-juices',
              'en:squeezed-orange-juices',
              'en:orange-juices-from-concentrate',
              'en:orange-juices-with-pulp',
              'en:orange-juices-without-pulp',
            ],
            statcan: ['Orange juice'],
          }),
          leaf('apple-juice', 'Apple juice', {
            off: [
              'en:apple-juices',
              'en:apple-juices-from-concentrate',
              'en:squeezed-apple-juices',
            ],
            statcan: ['Apple juice'],
          }),
          leaf('other-juice', 'Grape, cranberry & other juice', {
            off: [
              'en:fruit-juices-from-concentrate',
              'en:squeezed-fruit-juices',
              'en:grape-juices',
              'en:cranberry-juices',
              'en:pineapple-juices',
              'en:grapefruit-juices',
              'en:lime-juices',
              'en:pomegranate-juices',
              'en:multifruit-juices',
              'en:fruit-nectars',
              'en:juice-drinks',
              'en:aloe-vera-drinks',
              'en:pear-juices',
            ],
          }),
          leaf('vegetable-juice', 'Vegetable & tomato juice', {
            off: [
              'en:vegetable-juices',
              'en:tomato-juices',
              'en:vegetable-based-beverages',
              'en:carrot-juices',
            ],
          }),
          leaf('lemonade-iced', 'Lemonade & fruit drinks', {
            off: ['en:lemonade', 'en:lemonades'],
          }),
          leaf('smoothies', 'Smoothies', { off: ['en:smoothies', 'en:fruit-smoothies'] }),
        ],
      ),
      node('coffee', 'Coffee', { off: ['en:coffees'] }, [
        leaf('ground-coffee', 'Ground coffee', {
          off: ['en:ground-coffees', 'en:arabica-coffees'],
          statcan: ['Roasted or ground coffee'],
        }),
        leaf('whole-bean', 'Whole bean coffee', {
          off: ['en:coffee-beans', 'en:roasted-coffee-beans'],
        }),
        leaf('pods', 'Coffee pods & capsules', { off: ['en:coffee-capsules', 'en:capsules'] }),
        leaf('instant-coffee', 'Instant coffee', { off: ['en:instant-coffees'] }),
        leaf('ready-to-drink-coffee', 'Cold brew & ready-to-drink coffee', {
          off: ['en:coffee-drinks', 'en:iced-coffees'],
        }),
      ]),
      node(
        'tea',
        'Tea',
        { off: ['en:teas', '~en:hot-beverages', 'en:tea-leaves', 'en:tea-bags'], statcan: ['Tea'] },
        [
          leaf('black-green-tea', 'Black & green tea', {
            off: [
              'en:black-teas',
              'en:green-teas',
              'en:chai-teas',
              'en:white-teas',
              'en:decaffeinated-teas',
            ],
          }),
          leaf('herbal-tea', 'Herbal tea', {
            off: ['en:herbal-teas', 'en:rooibos', 'en:mint-teas', 'en:fruit-teas'],
          }),
          leaf('iced-tea', 'Iced tea', { off: ['en:iced-teas', 'en:tea-based-beverages'] }),
          leaf('kombucha', 'Kombucha', {
            off: ['en:kombuchas', 'en:fermented-teas', '~en:fermented-drinks', 'en:kvass'],
          }),
        ],
      ),
      node('energy-sports', 'Energy & sports drinks', { off: [] }, [
        leaf('energy-drinks', 'Energy drinks', {
          off: [
            'en:energy-drinks',
            'en:energy-drink-without-sugar-and-with-artificial-sweeteners',
            'en:energy-drink-with-sugar',
          ],
        }),
        leaf('sports-drinks', 'Sports drinks & electrolytes', {
          off: [
            'en:dietary-drink-for-sport',
            'en:electrolyte-drink',
            'en:Sports drink',
            'en:sports-drinks',
            'en:electrolyte-powders',
          ],
        }),
      ]),
      node(
        'drink-mixes',
        'Hot chocolate & drink mixes',
        { off: ['~en:beverage-preparations', '~en:instant-beverages', '~en:dehydrated-beverages'] },
        [
          leaf('hot-chocolate', 'Hot chocolate', {
            off: ['en:instant-chocolate-powders', 'en:chocolate-powders'],
          }),
          leaf('drink-mixes', 'Drink mixes & concentrates', { off: ['~en:flavoured-syrups'] }),
        ],
      ),
      node('alcohol', 'Beer, wine & spirits', { off: ['en:alcoholic-beverages'] }, [
        leaf('beer', 'Beer', {
          off: [
            'en:beers',
            'en:ales',
            'en:pale-ales',
            'en:lagers',
            'ca:cervesa-ipa',
            'en:stouts',
            'en:wheat-beers',
            'en:amber-beers',
            'en:craft-beers',
            'en:light-beers',
            'en:red-ales',
            'en:belgian-beers',
          ],
        }),
        leaf('wine', 'Wine', {
          off: [
            'en:wines',
            'en:red-wines',
            'en:white-wines',
            'en:rose-wines',
            'en:sparkling-wines',
            'en:champagnes',
            'en:fortified-wines',
            'en:sangria',
          ],
        }),
        leaf('cider-coolers', 'Cider, seltzers & coolers', {
          off: ['en:ciders', 'en:hard-seltzer', 'en:hard-seltzers'],
        }),
        leaf('spirits', 'Spirits & liqueurs', {
          off: [
            'en:distilled-beverages',
            'en:hard-liquors',
            'en:eaux-de-vie',
            'en:vodka',
            'en:gins',
            'en:rums',
            'en:tequilas',
            'en:liqueurs',
          ],
        }),
        leaf('non-alcoholic', 'Non-alcoholic beer & wine', {
          off: ['en:non-alcoholic-beers', 'en:non-alcoholic-wines'],
        }),
      ]),
    ],
  ),

  node('baby', 'Baby', { off: [] }, [
    node('food', 'Baby food', { off: ['en:baby-foods'], statcan: ['Baby food'] }, [
      leaf('purees', 'Purées & pouches', { off: [] }),
      leaf('cereal-snacks', 'Baby cereal & snacks', {
        off: ['en:cereals-for-babies', 'en:yogurt-melts'],
      }),
    ]),
    node('formula', 'Infant formula', { off: ['en:baby-milks'], statcan: ['Infant formula'] }, [
      leaf('infant-formula', 'Infant formula', { off: ['en:infant-formulas'] }),
      leaf('toddler-milk', 'Toddler drinks', { off: [] }),
    ]),
  ]),

  node('health', 'Supplements & nutrition', { off: ['en:dietary-supplements'] }, [
    node(
      'sports-nutrition',
      'Protein & sports nutrition',
      { off: ['en:bodybuilding-supplements'] },
      [
        leaf('protein-powder', 'Protein powder', {
          off: ['en:protein-powders', 'en:protein-supplement', 'fr:proteine', 'en:whey-isolates'],
        }),
        leaf('protein-shakes', 'Protein shakes & meal replacements', {
          off: ['en:protein-shakes', 'en:meal-replacements'],
        }),
        leaf('pre-workout', 'Pre-workout, amino acids & creatine', {
          off: ['en:amino-acids', 'en:bcaa', 'en:creatine', 'en:glutamine', 'en:l-carnitine'],
        }),
      ],
    ),
    node('vitamins', 'Vitamins & supplements', { off: ['en:nutritional-supplement'] }, [
      leaf('vitamins-minerals', 'Vitamins & minerals', {
        off: [
          'en:vitamin-supplements',
          'en:multivitamin',
          'en:vitamins',
          'en:multivitamins',
          'en:vitamin-b',
          'en:mineral-supplements',
          'en:iron-supplements',
        ],
      }),
      leaf('other-supplements', 'Omega-3, probiotics & other supplements', {
        off: ['en:fish-oils', 'en:herbal-supplements', 'en:spirulina', 'en:maca', 'en:supplements'],
      }),
    ]),
  ]),

  node('household', 'Household', { off: ['~en:household-supplies', '~en:home-garden'] }, [
    node('laundry', 'Laundry', { off: ['en:laundry-supplies'] }, [
      leaf('detergent', 'Laundry detergent', {
        off: ['en:laundry-detergent'],
        statcan: ['Laundry detergent'],
      }),
      leaf('fabric-care', 'Fabric softener & stain removers', { off: [] }),
    ]),
    node(
      'cleaning',
      'Cleaning',
      { off: ['en:household-cleaning-supplies', 'en:household-cleaning-products', 'en:cleansers'] },
      [
        leaf('dish', 'Dish soap & dishwasher detergent', {
          off: ['en:dishwasher-tablets', 'en:Dishwasher Detergent'],
        }),
        leaf('cleaners', 'Surface & bathroom cleaners', {
          off: ['en:all-purpose-cleaners', 'en:Disinfecting Wipes', 'en:glass-cleaners'],
        }),
      ],
    ),
    node('paper-wraps', 'Paper, wraps & bags', { off: [] }, [
      leaf('paper', 'Toilet paper, paper towels & tissues', { off: ['en:paper-towels'] }),
      leaf('wraps-bags', 'Foil, wraps & bags', { off: [] }),
    ]),
  ]),

  node(
    'personal-care',
    'Personal care',
    {
      off: [
        '~en:non-food-products',
        '~en:open-beauty-facts',
        '~en:Cosmetic products',
        '~en:Skincare',
        'en:hygiene',
      ],
    },
    [
      node('oral', 'Oral care', { off: [] }, [
        leaf('toothpaste', 'Toothpaste', { off: ['en:toothpaste'], statcan: ['Toothpaste'] }),
        leaf('other-oral', 'Toothbrushes, floss & mouthwash', { off: [] }),
      ]),
      node('hair', 'Hair care', { off: ['en:hair-care'] }, [
        leaf('shampoo', 'Shampoo', { off: ['en:shampoos'], statcan: ['Shampoo'] }),
        leaf('conditioner-styling', 'Conditioner & styling', {
          off: ['en:hair-conditioners', 'en:hair-masks'],
        }),
      ]),
      node('body', 'Body & skin', { off: [] }, [
        leaf('deodorant', 'Deodorant', { off: ['en:deodorants'], statcan: ['Deodorant'] }),
        leaf('soap-body-wash', 'Soap & body wash', {
          off: ['en:soaps', 'en:bar-soaps', 'en:liquid-soaps'],
        }),
        leaf('skin-care', 'Lotion, sunscreen & skin care', {
          off: [
            'en:lip-balms',
            'en:hand-creams',
            'en:body-creams',
            'en:sunscreen',
            'en:suncare',
            'en:in-sun-protections',
            'en:facial-creams',
            'en:face',
          ],
        }),
      ]),
    ],
  ),
];

/** One stored category, flattened from the tree. */
export interface TaxonomyRow {
  slug: string;
  name: string;
  level: number;
  parentSlug: string | null;
  sortOrder: number;
  soldLoose: boolean;
  isLeaf: boolean;
}

/** One stored mapping: a source key → a category slug. */
export interface TaxonomyMapping {
  key: string;
  slug: string;
  confidence: number;
}

/** The tree as rows, parents before children, in tree order (`sortOrder` counts among siblings). */
export function flattenTaxonomy(tree: readonly NodeSpec[] = TAXONOMY): TaxonomyRow[] {
  const out: TaxonomyRow[] = [];
  const walk = (nodes: readonly NodeSpec[], parent: string | null, level: number) => {
    nodes.forEach((n, i) => {
      const slug = parent ? `${parent}/${n.key}` : n.key;
      out.push({
        slug,
        name: n.name,
        level,
        parentSlug: parent,
        sortOrder: (i + 1) * 10,
        soldLoose: n.loose === true,
        isLeaf: !n.children || n.children.length === 0,
      });
      if (n.children) walk(n.children, slug, level + 1);
    });
  };
  walk(tree, null, 0);
  return out;
}

function mappingsOf(
  tree: readonly NodeSpec[],
  pick: (n: NodeSpec) => readonly string[] | undefined,
) {
  const out: TaxonomyMapping[] = [];
  const walk = (nodes: readonly NodeSpec[], parent: string | null) => {
    for (const n of nodes) {
      const slug = parent ? `${parent}/${n.key}` : n.key;
      for (const raw of pick(n) ?? []) {
        const weak = raw.startsWith('~');
        out.push({
          key: weak ? raw.slice(1) : raw,
          slug,
          confidence: weak ? WEAK_CONFIDENCE : STRONG_CONFIDENCE,
        });
      }
      if (n.children) walk(n.children, slug);
    }
  };
  walk(tree, null);
  return out;
}

/** OFF `categories_tags` → category, one row per tag. */
export const offTagMappings = (tree: readonly NodeSpec[] = TAXONOMY) =>
  mappingsOf(tree, (n) => n.off);
/** StatCan product label → category, one row per label. */
export const statcanMappings = (tree: readonly NodeSpec[] = TAXONOMY) =>
  mappingsOf(tree, (n) => n.statcan).map((m) => ({ ...m, confidence: 1 }));
