// Open Prices dump rows → the extract kept in raw → store and price records (SOURCES.md S5, D-060).
// The extract holds only the fields we parse: never the contributor (`owner`) or their comment
// (D-012). Mapping is pure, so a stored extract re-parses to the same records.
import { type RecordInputOf, cleanText, slugify } from '@sarvis/core';

import { offGtin } from '../off/map.ts';

export const OP_KEY = 'open-prices';
export const OP_JOB = 'open-prices-import';
export const OP_VERSION = '1.0.1';
export const OP_SITE = 'https://prices.openfoodfacts.org/';

/** The location fields kept in the extract. */
export interface OpLocation {
  id: number;
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
  osm_name: string | null;
  osm_brand: string | null;
  osm_display_name: string | null;
  osm_address_city: string | null;
  osm_address_postcode: string | null;
  osm_lat: string | null;
  osm_lon: string | null;
}

/** The price fields kept in the extract. */
export interface OpPrice {
  id: number;
  location_id: number;
  /** The store's OSM key, from the kept location, so a price extract parses on its own. */
  osm_type: OpLocation['osm_type'];
  osm_id: number;
  product_code: string;
  price: string;
  price_is_discounted: boolean;
  price_without_discount: string | null;
  discount_type: string | null;
  price_per: string | null;
  currency: string;
  date: string;
}

/** One extract line: a location or a price. */
export type ExtractLine = { location: OpLocation } | { price: OpPrice };

export interface LocationCounts {
  scanned: number;
  kept: number;
  dropped: { malformed: number; not_osm: number; not_canada: number; no_name: number };
}

export interface PriceCounts {
  scanned: number;
  kept: number;
  dropped: {
    malformed: number;
    not_cad: number;
    /** A price for a category (loose produce), with no product code. */
    no_product_code: number;
    /** Marked by Open Prices as a duplicate of another price. */
    duplicate: number;
    /** Online, or at a location that isn't a kept Canadian store. */
    no_canadian_store: number;
  };
}

export const emptyLocationCounts = (): LocationCounts => ({
  scanned: 0,
  kept: 0,
  dropped: { malformed: 0, not_osm: 0, not_canada: 0, no_name: 0 },
});

export const emptyPriceCounts = (): PriceCounts => ({
  scanned: 0,
  kept: 0,
  dropped: { malformed: 0, not_cad: 0, no_product_code: 0, duplicate: 0, no_canadian_store: 0 },
});

type Json = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

function parseLine(line: string): Json | null {
  if (line.trim() === '') return null;
  try {
    const v: unknown = JSON.parse(line);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
  } catch {
    return null;
  }
}

const OSM_TYPES = new Set(['node', 'way', 'relation']);

/** A Canadian OSM location with a name, cut to the extract fields; null (and counted) otherwise. */
export function keepLocation(line: string, counts: LocationCounts): OpLocation | null {
  if (line.trim() === '') return null;
  counts.scanned++;
  const v = parseLine(line);
  if (!v || typeof v.id !== 'number') {
    counts.dropped.malformed++;
    return null;
  }
  const osmType = String(v.osm_type ?? '').toLowerCase();
  if (v.type !== 'OSM' || !OSM_TYPES.has(osmType) || typeof v.osm_id !== 'number') {
    counts.dropped.not_osm++;
    return null;
  }
  if (v.osm_address_country_code !== 'CA') {
    counts.dropped.not_canada++;
    return null;
  }
  if (!str(v.osm_name) && !str(v.osm_brand)) {
    counts.dropped.no_name++;
    return null;
  }
  counts.kept++;
  return {
    id: v.id,
    osm_type: osmType as OpLocation['osm_type'],
    osm_id: v.osm_id,
    osm_name: str(v.osm_name),
    osm_brand: str(v.osm_brand),
    osm_display_name: str(v.osm_display_name),
    osm_address_city: str(v.osm_address_city),
    osm_address_postcode: str(v.osm_address_postcode),
    osm_lat: v.osm_lat == null ? null : String(v.osm_lat),
    osm_lon: v.osm_lon == null ? null : String(v.osm_lon),
  };
}

/**
 * A CAD product price at one of `stores` (kept locations by id), cut to the extract fields; null (and
 * counted) otherwise. Rows that aren't CAD are counted without a full parse: they're 99.8% of the dump.
 */
export function keepPrice(
  line: string,
  stores: ReadonlyMap<number, OpLocation>,
  counts: PriceCounts,
): OpPrice | null {
  if (line.trim() === '') return null;
  counts.scanned++;
  if (!line.includes('"CAD"')) {
    counts.dropped.not_cad++;
    return null;
  }
  const v = parseLine(line);
  if (!v || typeof v.id !== 'number' || typeof v.date !== 'string') {
    counts.dropped.malformed++;
    return null;
  }
  if (v.currency !== 'CAD') {
    counts.dropped.not_cad++;
    return null;
  }
  const code = str(v.product_code);
  if (!code) {
    counts.dropped.no_product_code++;
    return null;
  }
  if (v.duplicate_of != null) {
    counts.dropped.duplicate++;
    return null;
  }
  const store = typeof v.location_id === 'number' ? stores.get(v.location_id) : undefined;
  if (!store) {
    counts.dropped.no_canadian_store++;
    return null;
  }
  counts.kept++;
  return {
    id: v.id,
    location_id: store.id,
    osm_type: store.osm_type,
    osm_id: store.osm_id,
    product_code: code,
    price: String(v.price),
    price_is_discounted: v.price_is_discounted === true,
    price_without_discount:
      v.price_without_discount == null ? null : String(v.price_without_discount),
    discount_type: str(v.discount_type),
    price_per: str(v.price_per),
    currency: v.currency,
    date: v.date,
  };
}

export const toExtract = (lines: ExtractLine[]): string =>
  lines.map((l) => JSON.stringify(l)).join('\n') + (lines.length > 0 ? '\n' : '');

export function parseExtract(body: string): ExtractLine[] {
  return body
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as ExtractLine);
}

// Canadian postal codes name the province by their first letter (X is split between NT and NU).
const POSTAL_PROVINCE: Record<string, string> = {
  A: 'NL',
  B: 'NS',
  C: 'PE',
  E: 'NB',
  G: 'QC',
  H: 'QC',
  J: 'QC',
  K: 'ON',
  L: 'ON',
  M: 'ON',
  N: 'ON',
  P: 'ON',
  R: 'MB',
  S: 'SK',
  T: 'AB',
  V: 'BC',
  Y: 'YT',
};

const PROVINCE_NAMES: [RegExp, string][] = [
  [/^newfoundland/i, 'NL'],
  [/^nova scotia|^nouvelle-[ée]cosse/i, 'NS'],
  [/^prince edward|^[îi]le-du-prince/i, 'PE'],
  [/^new brunswick|^nouveau-brunswick/i, 'NB'],
  [/^qu[ée]bec$/i, 'QC'],
  [/^ontario$/i, 'ON'],
  [/^manitoba$/i, 'MB'],
  [/^saskatchewan$/i, 'SK'],
  [/^alberta$/i, 'AB'],
  [/^british columbia|^colombie-britannique/i, 'BC'],
  [/^yukon/i, 'YT'],
  [/^northwest territories|^territoires du nord-ouest/i, 'NT'],
  [/^nunavut$/i, 'NU'],
];

/** The province code: from the postal code, else a province named in the display name. */
export function provinceOf(postcode: string | null, displayName: string | null): string | null {
  const first = postcode?.trim().charAt(0).toUpperCase() ?? '';
  if (POSTAL_PROVINCE[first]) return POSTAL_PROVINCE[first];
  for (const part of (displayName ?? '').split(',').map((p) => p.trim())) {
    for (const [re, code] of PROVINCE_NAMES) if (re.test(part)) return code;
  }
  return null;
}

const OSM_INITIAL = { node: 'n', way: 'w', relation: 'r' } as const;

/** `food-basics-windsor-w23375623`: readable, and unique because it ends in the OSM id. */
export function storeSlugOf(loc: OpLocation, name: string): string {
  const suffix = `${OSM_INITIAL[loc.osm_type]}${loc.osm_id}`;
  const base = slugify(`${name} ${loc.osm_address_city ?? ''}`)
    .slice(0, 64 - suffix.length - 1)
    .replace(/-+$/, '');
  return base ? `${base}-${suffix}` : suffix;
}

// A house number as Nominatim puts it before the road: `8683`, `12A`, `100-2`, `3/4`.
const HOUSE_NUMBER = /^\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?$/;
// A segment that names a road: a street-type word (English or French), or a `-way` name.
const STREET_WORD =
  /(?<!\p{L})(street|st|avenue|ave|road|rd|way|boulevard|blvd|drive|dr|highway|hwy|lane|crescent|court|place|parkway|trail|line|sideroad|concession|circle|terrace|gate|square|row|close|grove|plaza|esplanade|rue|chemin|route|allée|montée|rang|côte|boul|promenade|carré|voie|autoroute)(?!\p{L})|way$/iu;

/**
 * The street part of the OSM display name: `8683 Tenth Avenue`, or the road alone when there's
 * no house number. The segments after it (neighbourhoods, city, regions, province, postal code,
 * country) are dropped: the city, province and postal code have their own columns (P3.10a).
 * Null when the display name has no road, e.g. only a neighbourhood after the place name.
 */
export function addressOf(loc: OpLocation, name: string): string | null {
  const parts = (loc.osm_display_name ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts[0] === name) parts.shift();
  const [first, second] = parts;
  if (!first) return null;
  const street =
    HOUSE_NUMBER.test(first) && second
      ? `${first} ${second}`
      : STREET_WORD.test(first)
        ? first
        : null;
  return street ? street.slice(0, 300) : null;
}

const num = (v: string | null): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const prov = (url: string | null, fetchedAt: string) => ({
  source_key: OP_KEY,
  source_url: url,
  fetched_at: fetchedAt,
  method: 'import' as const,
  method_version: `${OP_KEY}@${OP_VERSION}`,
});

export function toStoreRecord(loc: OpLocation, fetchedAt: string): RecordInputOf<'store'> {
  const name = cleanText(loc.osm_name ?? loc.osm_brand) as string;
  const lat = num(loc.osm_lat);
  const lon = num(loc.osm_lon);
  const hasPoint = lat !== null && lon !== null;
  return {
    // Unknown banner: the P4 matcher links stores to banners (D-036).
    banner_slug: null,
    slug: storeSlugOf(loc, name),
    name,
    address: addressOf(loc, name),
    city: cleanText(loc.osm_address_city),
    province: provinceOf(loc.osm_address_postcode, loc.osm_display_name),
    postal_code: cleanText(loc.osm_address_postcode),
    lat: hasPoint ? lat : null,
    lon: hasPoint ? lon : null,
    osm_type: loc.osm_type,
    osm_id: loc.osm_id,
    status: 'active',
    ...prov(new URL(`locations/${loc.id}`, OP_SITE).href, fetchedAt),
  };
}

const PRICE_PER: Record<string, 'unit' | 'kg' | 'lb'> = { UNIT: 'unit', KILOGRAM: 'kg' };

export function toPriceRecord(p: OpPrice, fetchedAt: string): RecordInputOf<'price_observation'> {
  const gtin = offGtin(p.product_code.trim());
  return {
    external_id: String(p.id),
    store: { osm_type: p.osm_type, osm_id: p.osm_id },
    // Keyed like OFF products, so a price finds the product the OFF import stored.
    product: gtin ? { gtin } : null,
    observed_on: p.date,
    price: Number(p.price),
    currency: 'CAD',
    price_kind:
      p.discount_type === 'LOYALTY_PROGRAM' ? 'member' : p.price_is_discounted ? 'sale' : 'regular',
    is_discounted: p.price_is_discounted,
    price_without_discount: num(p.price_without_discount),
    price_per: p.price_per ? (PRICE_PER[p.price_per] ?? null) : null,
    // Rebuilt from sources.url_template (`…/prices/{external_id}`) + external_id (P3.10a).
    ...prov(null, fetchedAt),
  };
}
