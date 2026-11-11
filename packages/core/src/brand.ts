// Brand keys (P4.11, D-096): one stable key per brand across spelling, case and accents, for the
// brand resolver. Pure: no database. Translated names ("Sans nom" for "No Name") are aliases
// (P4.12), not keys, so they never share a key here.

/** Apostrophe-like marks, removed without a break: "President's" = "Presidents". */
const APOSTROPHES = /['‘’ʼ`´]/g;
/** Trademark and copyright signs. Removed before NFKD, which would turn ™ into "TM". */
const MARKS = /[™®©℠]/g;

/**
 * Legal-form words dropped from the end of a brand string ("ACE Bakery Limited" = "ACE Bakery").
 * Several words are matched joined, so "S.A." and "S.A.R.L." count. "Company" isn't here (as in
 * corp-canada, D-075), and neither is "Brand": "Kettle Brand" isn't "Kettle".
 */
const LEGAL_SUFFIXES: ReadonlySet<string> = new Set(
  (
    'inc incorporated incorporee ltd limited ltee limitee llc corp corporation co plc ulc lp llp ' +
    'gmbh sa sas sarl srl spa ag bv nv'
  ).split(' '),
);

/**
 * Brand strings that name no brand, by key. A product whose only brand string is one of these
 * has no brand. Each entry has a test in brand.test.ts.
 */
export const BRAND_STOPLIST: ReadonlySet<string> = new Set([
  'null',
  'none',
  'na',
  'unknown',
  'inconnu',
  'inconnue',
  'generic',
  'generique',
  'homemade',
  'faitmaison',
  'produitmaison',
  'maison',
  'nobrand',
  'sansmarque',
  'aucunemarque',
  'brand',
  'marque',
  'xxxx',
]);

function words(text: string): string[] {
  return text
    .replace(MARKS, ' ')
    .replace(APOSTROPHES, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * The key of one brand string, before the stoplist: accents, case, apostrophes, trademark signs
 * and punctuation folded, `&` read as "and", a leading "the" and trailing legal forms dropped, and
 * the words joined with no space, so "Farm Boy" = "Farmboy" and "Co-op" = "Coop". "" when nothing
 * is left.
 */
export function brandKeyRaw(text: string): string {
  const w = words(text);
  if (w.length > 1 && w[0] === 'the') w.shift();
  let dropped = false;
  for (;;) {
    let n = 0;
    for (let k = 1; k <= 3 && k < w.length; k++) {
      if (LEGAL_SUFFIXES.has(w.slice(-k).join(''))) n = k;
    }
    if (n === 0) break;
    w.splice(w.length - n, n);
    dropped = true;
  }
  // "Smith & Co." leaves a dangling "and".
  if (dropped && w.length > 1 && w[w.length - 1] === 'and') w.pop();
  return w.join('');
}

/** The key of one brand string; null when it names no brand (empty or in BRAND_STOPLIST). */
export function brandKey(text: string): string | null {
  const key = brandKeyRaw(text);
  return key === '' || BRAND_STOPLIST.has(key) ? null : key;
}

/** True when a brand string names no brand. */
export const isNonBrand = (text: string): boolean => brandKey(text) === null;

/** The parts of OFF's comma-separated `brands` field (`products.brand_text`), trimmed, in order. */
export function splitBrandText(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(',')
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** The distinct keys of a `brand_text`, in order, without the parts that name no brand. */
export function brandKeys(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of splitBrandText(text)) {
    const key = brandKey(part);
    if (key !== null && !out.includes(key)) out.push(key);
  }
  return out;
}

/** A brand string and the number of products that carry it (a row of off_brand_strings()). */
export interface BrandCount {
  brand: string;
  products: number;
}

export interface BrandCluster {
  key: string;
  /** The most common spelling, the display name of a new brand row. */
  name: string;
  products: number;
  /** Every spelling, most products first. */
  variants: BrandCount[];
}

/** A spelling as counted for the display name: curly apostrophes straightened, spaces collapsed. */
const spelling = (text: string): string => text.replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim();

const byCount = (a: BrandCount, b: BrandCount): number =>
  b.products - a.products || (a.brand < b.brand ? -1 : a.brand > b.brand ? 1 : 0);

/**
 * Groups brand strings by key: each cluster's variants, total products, and its most common
 * spelling as the name (ties: the first in code-point order). Strings that name no brand are left
 * out. Clusters come most products first, then by key.
 */
export function clusterBrands(rows: Iterable<BrandCount>): BrandCluster[] {
  const byKey = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const key = brandKey(row.brand);
    if (key === null || row.products <= 0) continue;
    const s = spelling(row.brand);
    let m = byKey.get(key);
    if (!m) byKey.set(key, (m = new Map()));
    m.set(s, (m.get(s) ?? 0) + row.products);
  }
  const out: BrandCluster[] = [];
  for (const [key, m] of byKey) {
    const variants = [...m].map(([brand, products]) => ({ brand, products })).sort(byCount);
    out.push({
      key,
      name: (variants[0] as BrandCount).brand,
      products: variants.reduce((n, v) => n + v.products, 0),
      variants,
    });
  }
  return out.sort((a, b) => b.products - a.products || (a.key < b.key ? -1 : 1));
}

export interface BrandPick {
  /** The part as written in `brand_text`. */
  text: string;
  key: string;
  /** Whether it was picked because it resolves to a known brand with an owner. */
  owned: boolean;
}

/**
 * Which part names a product when `brand_text` lists several: the first part that resolves to a
 * known brand with an owner (`isOwned(key)`), else the first part that names a brand. Null when no
 * part names a brand. Used by P4.13 to link products.
 */
export function pickBrandPart(
  text: string | null | undefined,
  isOwned: (key: string) => boolean,
): BrandPick | null {
  let first: BrandPick | null = null;
  for (const part of splitBrandText(text)) {
    const key = brandKey(part);
    if (key === null) continue;
    if (isOwned(key)) return { text: part, key, owned: true };
    first ??= { text: part, key, owned: false };
  }
  return first;
}
