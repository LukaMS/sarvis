// Synthetic Open Food Facts-shaped products for the fixture source (PLAN P2.17). Brands and products
// are made up, and the codes sit in an unassigned 0629999 range so they never collide with real
// GTINs. Three records are invalid on purpose, one for each rule the e2e test expects:
//   - a code with a wrong check digit (gtin_check_digit);
//   - a blank product name (required_field);
//   - the same code twice on one page (duplicate).

/** The OFF product fields the fixture uses (a subset of the v2 API's product object). */
export interface OffProduct {
  code: string;
  product_name?: string;
  brands?: string;
  quantity?: string;
  product_quantity?: number | string;
  product_quantity_unit?: string;
  labels_tags?: string[];
  last_modified_t?: number;
}

/** A 13-digit code: `0629999` + a 5-digit number + the GS1 mod-10 check digit. */
export function fixtureCode(n: number): string {
  const body = `0629999${String(n).padStart(5, '0')}`;
  const sum = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return body + String((10 - (sum % 10)) % 10);
}

/** The same code with its check digit off by one. */
function badCheckDigit(code: string): string {
  const last = Number(code.slice(-1));
  return code.slice(0, -1) + String((last + 1) % 10);
}

const MODIFIED = 1_790_000_000; // 2026-09-21

type Row = [n: number, name: string, brands: string, quantity: string, qty: number, unit: string];

const ROWS: Row[] = [
  [1, 'Rolled Oats', 'Fixture Farms', '1 kg', 1000, 'g'],
  [2, 'Steel Cut Oats', 'Fixture Farms', '900 g', 900, 'g'],
  [3, 'Maple Granola', 'Fixture Farms', '750 g', 750, 'g'],
  [4, 'Whole Milk 3.25%', 'Test Valley Dairy', '2 L', 2000, 'ml'],
  [5, 'Skim Milk', 'Test Valley Dairy', '4 L', 4000, 'ml'],
  [6, 'Plain Greek Yogurt', 'Test Valley Dairy', '650 g', 650, 'g'],
  [7, 'Aged Cheddar', 'Test Valley Dairy, Fixture Farms', '400 g', 400, 'g'],
  [8, 'Crushed Tomatoes', 'Northwind Pantry', '796 mL', 796, 'ml'],
  [9, 'Chickpeas', 'Northwind Pantry', '540 mL', 540, 'ml'],
  [10, 'Black Beans', 'Northwind Pantry', '540 mL', 540, 'ml'],
  [11, 'Penne Rigate', 'Northwind Pantry', '900 g', 900, 'g'],
  [12, 'Extra Virgin Olive Oil', 'Northwind Pantry', '1 L', 1000, 'ml'],
  [13, 'Peanut Butter Smooth', 'Sample & Sons', '1 kg', 1000, 'g'],
  [14, 'Strawberry Jam', 'Sample & Sons', '500 mL', 500, 'ml'],
  [15, 'Liquid Honey', 'Sample & Sons', '750 g', 750, 'g'],
  [16, 'Ground Coffee Medium Roast', 'Sample & Sons', '930 g', 930, 'g'],
  [17, 'Green Tea', 'Sample & Sons', '20 bags', 0, ''],
];

function product([n, name, brands, quantity, qty, unit]: Row): OffProduct {
  return {
    code: fixtureCode(n),
    product_name: name,
    brands,
    quantity,
    // OFF only fills these when it could read a mass or volume.
    ...(unit !== '' && { product_quantity: qty, product_quantity_unit: unit }),
    labels_tags: n % 4 === 1 ? ['en:organic', 'en:no-gmos'] : [],
    last_modified_t: MODIFIED + n * 3600,
  };
}

/** All 20 records in serving order: 17 valid, then the 3 invalid ones placed across the pages. */
export function fixtureProducts(): OffProduct[] {
  const valid = ROWS.map(product);
  const [first, second, third] = valid;
  if (!first || !second || !third) throw new Error('fixture rows missing');
  const wrongCheck = product([18, 'Wild Rice', 'Fixture Farms', '450 g', 450, 'g']);
  wrongCheck.code = badCheckDigit(wrongCheck.code);
  const blankName = product([19, '   ', 'Northwind Pantry', '398 mL', 398, 'ml']);
  const duplicate: OffProduct = { ...second, product_name: 'Steel Cut Oats (repeat)' };
  // With 5 per page: page 1 holds the duplicate (next to its original), pages 3 and 4 the others.
  return [
    first,
    second,
    third,
    duplicate,
    ...valid.slice(3, 10),
    wrongCheck,
    ...valid.slice(10, 14),
    blankName,
    ...valid.slice(14),
  ];
}

/** Records the fixture serves that pass validation. */
export const FIXTURE_VALID_COUNT = ROWS.length;
/** The invalid records, by the rule each should fail. */
export const FIXTURE_INVALID_RULES = ['duplicate', 'gtin_check_digit', 'required_field'] as const;
