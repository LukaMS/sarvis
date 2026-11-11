// Size and unit parser (P4.5, D-087). Turns a source's size text ("12 x 355 mL", "907 g (2 lb)",
// "12 eggs, Net: 630 g") into a total in a base unit (g, ml or ct) and a pack count, and computes
// unit prices. It never guesses: a string it can't read with confidence is `unparsed`, and one
// that reads two ways (mass and volume, sizes that disagree, "1 400 g") is `ambiguous`.
//
// How it reads a string:
//   1. normalize (case, decimal commas, ×, ℮, currency amounts);
//   2. scan it into atoms: measures (number + unit), counts (number + piece noun), doses (mg, IU),
//      loose numbers, words and separators;
//   3. join multiplications ("4 x 100 g", "130g x 4", "4 pots de 100 g", "2 x 6 x 355 mL");
//   4. tag measures that aren't the package size: drained weights, per-item sizes ("1.3 g each",
//      "24g/bar"), servings ("per slice 19 g");
//   5. pick the size: metric beats imperial, a stated total beats a multiplication, and every
//      other measure of the same kind must agree with it (2% metric, 6% imperial).

import type { UnitParser } from './validation/batch.ts';

export type NetUnit = 'g' | 'ml' | 'ct';
export type UnitParseStatus = 'ok' | 'unparsed' | 'ambiguous';

export const GRAMS_PER_LB = 453.59237;
export const GRAMS_PER_OZ = 28.349523125;
export const ML_PER_FL_OZ = 29.5735295625;

/** Why a string isn't `ok`. Run events and reports group by it. */
export type SizeReason =
  | 'empty'
  | 'per_weight'
  | 'serving_only'
  | 'no_size'
  | 'bare_number'
  | 'zero'
  | 'dose_only'
  | 'drained_only'
  | 'each_without_count'
  | 'mass_and_volume'
  | 'sizes_disagree'
  | 'counts_disagree'
  | 'non_metric_only'
  | 'space_joined_numbers'
  | 'unknown_count'
  | 'range'
  | 'thousands_separator'
  | 'out_of_range';

export interface SizeParse {
  unit_parse_status: UnitParseStatus;
  /** Total in `net_unit`, rounded to 3 decimals (the column is numeric(12,3)). */
  net_quantity: number | null;
  net_unit: NetUnit | null;
  /** Number of items in a multipack (≥ 2), else null. */
  pack_count: number | null;
  reason: SizeReason | null;
}

// ---------------------------------------------------------------------------------------------
// Units

type Dim = 'mass' | 'volume';

interface UnitDef {
  /** `oz` takes the kind of the other measures in the string ("355 mL; 12 oz"), else mass. */
  dim: Dim | 'oz';
  /** Base units (g or ml) per unit. */
  factor: number;
  metric: boolean;
  /** US/imperial/dry measures: they can confirm a size but never set one on their own. */
  secondary?: true;
}

const L = '(?![\\p{L}])';

/** Checked in order, so longer spellings come first. */
const UNITS: [RegExp, UnitDef][] = (
  [
    [
      'fl\\.?\\s*oz\\.?|floz|oz\\.?\\s*(?:fl|liq)\\.?|onces?\\s+liquides?',
      { dim: 'volume', factor: ML_PER_FL_OZ, metric: false },
    ],
    [
      '(?:us\\s+)?dry\\s+pints?|chopines?\\s+s[eè]ches?',
      { dim: 'volume', factor: 550.610471, metric: false, secondary: true },
    ],
    ['(?:us\\s+)?pints?|pt', { dim: 'volume', factor: 473.176473, metric: false, secondary: true }],
    ['qts?|quarts?', { dim: 'volume', factor: 946.352946, metric: false, secondary: true }],
    [
      '(?:us\\s*)?gal(?:lons?)?',
      { dim: 'volume', factor: 3785.411784, metric: false, secondary: true },
    ],
    ['kgs?|kilos?|kilogrammes?|kilograms?', { dim: 'mass', factor: 1000, metric: true }],
    ['lbs?|pounds?|livres?', { dim: 'mass', factor: GRAMS_PER_LB, metric: false }],
    ['oz|ounces?|onces?', { dim: 'oz', factor: 0, metric: false }],
    ['millilitres?|milliliters?|mls?|мл|مل', { dim: 'volume', factor: 1, metric: true }],
    ['cl', { dim: 'volume', factor: 10, metric: true }],
    ['dl', { dim: 'volume', factor: 100, metric: true }],
    ['litres?|liters?|litros?|ltrs?|lit|lt|l', { dim: 'volume', factor: 1000, metric: true }],
    [
      'grammes?|grams?|grames?|gms?|grs?|g|гр|г|جرام|غرام',
      { dim: 'mass', factor: 1, metric: true },
    ],
  ] as [string, UnitDef][]
).map(([src, def]) => [new RegExp(`(?:${src})${L}`, 'uy'), def]);

/** Doses describe a tablet or a serving, never the package. */
const DOSE = new RegExp(`(?:mg|mcg|μg|ug|iu|ui)${L}`, 'uy');

/** Piece nouns: "12 pcs", "6 Tortillas", "20 Black Tea Bags". */
const COUNT_NOUNS = [
  'pcs?',
  'pce',
  'pieces?',
  'pièces?',
  'morceaux',
  'ea',
  'units?',
  'unités?',
  'unites?',
  'u',
  'unds?',
  'qty',
  'count',
  'cts?',
  'pks?',
  'packs?',
  'paquets?',
  'pkgs?',
  'packages?',
  'packets?',
  'sachets?',
  'sacs?',
  'bags?',
  'teabags?',
  'pods?',
  'capsules?',
  'caps',
  'gélules?',
  'tablets?',
  'tabs',
  'tablettes?',
  'comprimés?',
  'comprimes?',
  'caplets?',
  'softgels?',
  'gels',
  'gummies',
  'chewables',
  'lozenges',
  'wipes',
  'eggs?',
  'œufs?',
  'oeufs?',
  'bars?',
  'barres?',
  'buns?',
  'tortillas?',
  'slices?',
  'tranches?',
  'rolls?',
  'rounds?',
  'pouch(?:es)?',
  'cookies?',
  'biscuits?',
  'biscottes?',
  'muffins?',
  'bagels?',
  'cakes?',
  'cubes?',
  'sticks?',
  'patties',
  'flatbreads?',
  'naans?',
  'pitas?',
  'wraps?',
  'waffles?',
  'crusts?',
  'galettes?',
  'madeleines?',
  'baguettines?',
  'yaourts?',
  'yogurts?',
  'saucisses?',
  'sausages?',
  'crackers?',
  'loaves',
  'cans?',
  'bottles?',
  'bouteilles?',
  'jars?',
  'pots?',
  'tubes?',
  'boxes',
  'boîtes?',
  'boites?',
  'bunch(?:es)?',
  'bulbs?',
  'heads?',
  'sheets?',
  'squares?',
  'feuilles?',
  'cartons?',
  'envelopes?',
  'pains?',
  'samosas?',
  'empanadas?',
  'croissants?',
  'portions?', // only after "x"/"de" joins; see SERVING below for the bare case
  'servings?',
  's',
  '本',
  '個',
];
const COUNT_NOUN = new RegExp(`(?:${COUNT_NOUNS.join('|')})${L}`, 'uy');
/** Nouns that count servings, not items: never a pack count on their own. */
const SERVING_NOUN = /^(?:portions?|servings?)$/u;

/** "CTN24", "PACK6", "pack of 6", "emballage de 4", "box of 20 tea bags", "caisse de 6". */
const PREFIX_COUNT =
  /(?:ctn|pack|pk)\s*(\d+)(?!\d)|(?:emballage|pack|box|bo[iî]te|caisse|case|carton)\s+(?:de|of)\s+(\d+)(?![\d.])/uy;
/** "4 per pack", "24 (per package)", "6 par boîte": the number is the pack's count. */
const PER_PACK =
  /\s*\(?\s*(?:per|par)\s+(?:pack(?:age)?|container|box|bo[iî]te|bag|case|carton)(?![\p{L}])/uy;

const NUMBER = /\d+\s+\d{1,2}\/\d{1,2}(?!\d)|\d{1,2}\/\d{1,2}(?!\d)|\d+(?:\.\d+)?|\.\d+/y;
const PLAIN_NUMBER = /\d+(?:\.\d+)?|\.\d+/y;
const WORD = /\p{L}+/uy;
/** One word between a number and its piece noun ("12 Lg Eggs", "16 Wrapped Tea Bags"). */
const ADJECTIVE = /(?!(?:x|de|of|and|et|net|per|par|pour|for)(?![\p{L}]))\p{L}+\.?\s+/uy;
const MAX_ADJECTIVES = 2;

// ---------------------------------------------------------------------------------------------
// Atoms

interface Base {
  start: number;
  end: number;
}
interface NumAtom extends Base {
  kind: 'num';
  n: number;
  integer: boolean;
}
interface MeasureAtom extends Base {
  kind: 'measure';
  /** The number as written, before unit conversion (for the range check). */
  n: number;
  def: UnitDef;
  /** Total in base units (oz resolved later). */
  amount: number;
  /** Items multiplied in ("4 x 100 g" → 4); 1 for a plain measure. */
  items: number;
  /** Per-item amount in base units, for products. */
  perItem: number;
  drained?: boolean;
  each?: boolean;
  serving?: boolean;
  net?: boolean;
}
interface CountAtom extends Base {
  kind: 'count';
  n: number;
  /** A serving noun ("30 servings"): not a pack count. */
  serving?: boolean;
  /** Items multiplied in ("2 x 8 buns" → 2). */
  items: number;
}
interface DoseAtom extends Base {
  kind: 'dose';
}
interface WordAtom extends Base {
  kind: 'word';
  text: string;
}
interface SepAtom extends Base {
  kind: 'sep';
  text: string;
}
type Atom = NumAtom | MeasureAtom | CountAtom | DoseAtom | WordAtom | SepAtom;

function stickyAt(re: RegExp, s: string, i: number): RegExpExecArray | null {
  re.lastIndex = i;
  return re.exec(s);
}

/** Lower case, NFKC, decimal commas to points, multiplication signs to "x", no ℮ or prices. */
export function normalizeSizeText(text: string): { s: string; thousands: boolean } {
  let s = text.normalize('NFKC').toLowerCase();
  s = s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/[⁄∕]/g, '/')
    .replace(/[×*✕]/g, ' x ')
    .replace(/℮/g, ' ')
    .replace(/['’]s(?![\p{L}])/gu, 's')
    // "x (12 x 45 g)": the brackets only group a multiplication.
    .replace(/x\s*\(/g, 'x ');
  // Prices aren't sizes: "600 g, $0.50/100g", "454 g/1.63€", "$4.99".
  s = s.replace(/[$€£]\s*\d+(?:[.,]\d+)?\s*\/\s*\d*(?:\.\d+)?\s*\p{L}+/gu, ' ');
  s = s.replace(/[$€£]\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*[€£]/g, ' ');
  // "0,140 kg" can only be a decimal.
  s = s.replace(/(?<![\d.])0,(\d{3})(?!\d)/g, '0.$1');
  let thousands = false;
  s = s.replace(/(\d),(\d{3})(?!\d)/g, (_m, a: string, b: string) => {
    thousands = true;
    return `${a}${b}`;
  });
  // "1,75 litre" → 1.75, but not "1,1.18L" (a count, then a size).
  s = s.replace(/(\d),(\d{1,2})(?![\d.])/g, '$1.$2');
  return { s, thousands };
}

function parseNumber(raw: string): { n: number; integer: boolean } | null {
  const mixed = /^(\d+)\s+(\d{1,2})\/(\d{1,2})$/.exec(raw);
  const frac = mixed ? null : /^(\d{1,2})\/(\d{1,2})$/.exec(raw);
  if (mixed || frac) {
    const [whole, num, den] = mixed
      ? [Number(mixed[1]), Number(mixed[2]), Number(mixed[3])]
      : [0, Number(frac![1]), Number(frac![2])];
    if (![2, 3, 4, 8, 16].includes(den) || num >= den || num === 0) return null;
    return { n: whole + num / den, integer: false };
  }
  const n = Number(raw);
  return Number.isFinite(n) ? { n, integer: Number.isInteger(n) } : null;
}

function scan(s: string): Atom[] {
  const atoms: Atom[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i] as string;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const prevIsLetter = i > 0 && /\p{L}/u.test(s[i - 1] as string);

    if (!prevIsLetter) {
      const pre = stickyAt(PREFIX_COUNT, s, i);
      if (pre) {
        const digits = (pre[1] ?? pre[2]) as string;
        const numEnd = i + pre[0].length;
        // "pack of 6 x 355 mL" or "pack 6 g" is a measure, not a pack count.
        const afterUnit = UNITS.some(([re]) => stickyAt(re, s, skipToUnit(s, numEnd)));
        if (!afterUnit && !/^\s*x(?![\p{L}])/u.test(s.slice(numEnd))) {
          atoms.push({ kind: 'count', n: Number(digits), items: 1, start: i, end: numEnd });
          i = numEnd;
          continue;
        }
      }
    }

    // Digits glued to a word ("ff7u", "l00") are part of it, except after the "x" of "12x355ml".
    if (prevIsLetter && /\d/.test(ch) && s[i - 1] !== 'x') {
      const glued = stickyAt(/[\p{L}\d]+/uy, s, i) as RegExpExecArray;
      atoms.push({ kind: 'word', text: glued[0], start: i, end: i + glued[0].length });
      i += glued[0].length;
      continue;
    }

    if (/[\d.]/.test(ch) && !(ch === '.' && !/\d/.test(s[i + 1] ?? ''))) {
      let m = stickyAt(NUMBER, s, i);
      let parsed = m ? parseNumber(m[0]) : null;
      if (m && !parsed) {
        m = stickyAt(PLAIN_NUMBER, s, i);
        parsed = m ? parseNumber(m[0]) : null;
      }
      if (m && parsed) {
        const numEnd = i + m[0].length;
        const atom = readAfterNumber(s, i, numEnd, parsed.n, parsed.integer);
        atoms.push(atom);
        i = atom.end;
        continue;
      }
    }

    const w = stickyAt(WORD, s, i);
    if (w) {
      atoms.push({ kind: 'word', text: w[0], start: i, end: i + w[0].length });
      i += w[0].length;
      continue;
    }
    atoms.push({ kind: 'sep', text: ch, start: i, end: i + 1 });
    i++;
  }
  return atoms;
}

/** Position of a unit after a number: past spaces and a lone "." ("340. g", "900.g"). */
function skipToUnit(s: string, i: number): number {
  let j = i;
  while (j < s.length && /\s/.test(s[j] as string)) j++;
  if (s[j] === '.' && !/\d/.test(s[j + 1] ?? '')) {
    j++;
    while (j < s.length && /\s/.test(s[j] as string)) j++;
  }
  return j;
}

function readAfterNumber(
  s: string,
  start: number,
  numEnd: number,
  n: number,
  integer: boolean,
): Atom {
  const j = skipToUnit(s, numEnd);
  if (!/^\d/.test(s.slice(j))) {
    for (const [re, def] of UNITS) {
      const u = stickyAt(re, s, j);
      if (u) {
        const amount = def.dim === 'oz' ? n : n * def.factor;
        return {
          kind: 'measure',
          n,
          def,
          amount,
          items: 1,
          perItem: amount,
          start,
          end: j + u[0].length,
        };
      }
    }
    const d = stickyAt(DOSE, s, j);
    if (d) return { kind: 'dose', start, end: j + d[0].length };
  }
  if (integer) {
    let k = numEnd;
    while (k < s.length && /\s/.test(s[k] as string)) k++;
    let noun: RegExpExecArray | null = null;
    for (let w = 0, pos = k; w <= MAX_ADJECTIVES && !noun; w++) {
      noun = stickyAt(COUNT_NOUN, s, pos);
      const adj = noun ? null : stickyAt(ADJECTIVE, s, pos);
      if (!noun && !adj) break;
      if (adj) pos += adj[0].length;
    }
    if (noun) {
      const at = noun.index;
      return {
        kind: 'count',
        n,
        items: 1,
        serving: SERVING_NOUN.test(noun[0]),
        start,
        end: at + noun[0].length,
      };
    }
    const per = stickyAt(PER_PACK, s, numEnd);
    if (per) return { kind: 'count', n, items: 1, start, end: numEnd + per[0].length };
  }
  return { kind: 'num', n, integer, start, end: numEnd };
}

// ---------------------------------------------------------------------------------------------
// Multiplications

const LB = UNITS.find(([, d]) => d.factor === GRAMS_PER_LB)?.[1] as UnitDef;
const QT = UNITS.find(([, d]) => d.factor === 946.352946)?.[1] as UnitDef;

/** "1 lb 6 oz" and "1 qt 1.8 fl oz" are one measure. */
function mergeCompounds(s: string, atoms: Atom[]): Atom[] {
  const out: Atom[] = [];
  for (let k = 0; k < atoms.length; k++) {
    const a = atoms[k] as Atom;
    // "1 lb. 14 oz.": skip the abbreviation's point.
    const dot = atoms[k + 1]?.kind === 'sep' && (atoms[k + 1] as SepAtom).text === '.' ? 1 : 0;
    const b = atoms[k + 1 + dot];
    if (
      a.kind === 'measure' &&
      b?.kind === 'measure' &&
      /^[\s.]*$/.test(s.slice(a.end, b.start)) &&
      ((a.def === LB && b.def.dim === 'oz') ||
        (a.def === QT && b.def.dim === 'volume' && b.def.factor === ML_PER_FL_OZ))
    ) {
      const amount = a.amount + (a.def === LB ? b.n * GRAMS_PER_OZ : b.amount);
      out.push({ ...a, amount, perItem: amount, n: amount / a.def.factor, end: b.end });
      k += 1 + dot;
      continue;
    }
    out.push(a);
  }
  return out;
}

const isWord = (a: Atom | undefined, ...texts: string[]): boolean =>
  a?.kind === 'word' && texts.includes(a.text);
const isX = (a: Atom | undefined): boolean => isWord(a, 'x');

interface Flags {
  range?: boolean;
  unknownCount?: boolean;
}

/** In "N x M pieces", M at or above this is a size with its unit missing. */
const MAX_ITEMS_PER_PACK = 100;

/** Joins "4 x 100 g", "2 x 6 x 355 mL", "12 bags x 2g", "130g x 4", "4 pots de 100 g", "10-68g". */
function joinProducts(atoms: Atom[], flags: Flags): Atom[] {
  const out: Atom[] = [];
  for (let k = 0; k < atoms.length; k++) {
    const a = atoms[k] as Atom;

    // Left factor: an integer, or a count ("12 bags"), optionally followed by up to two words.
    // A serving count joins too: "10 portions de 25 g" is 250 g.
    if ((a.kind === 'num' && a.integer && a.n > 0) || a.kind === 'count') {
      let items = a.n;
      let j = k + 1;
      let words = 0;
      while (atoms[j]?.kind === 'word' && !isWord(atoms[j], 'x', 'de', 'of') && words < 2) {
        j++;
        words++;
      }
      const joiner = atoms[j];
      const joinedByDash =
        a.kind === 'num' && words === 0 && joiner?.kind === 'sep' && joiner.text === '-';
      if (
        isX(joiner) ||
        (isWord(joiner, 'de', 'of') && a.kind === 'count') ||
        isWord(joiner, 'de') ||
        joinedByDash
      ) {
        const ofJoin = isWord(joiner, 'de', 'of');
        let r = j + 1;
        // Chains: "2 x 6 x 355 mL".
        while (
          !ofJoin &&
          !joinedByDash &&
          atoms[r]?.kind === 'num' &&
          (atoms[r] as NumAtom).integer &&
          isX(atoms[r + 1])
        ) {
          items *= (atoms[r] as NumAtom).n;
          r += 2;
        }
        const right = atoms[r];
        if (right?.kind === 'measure' && right.items === 1) {
          if (joinedByDash && !(right.n >= 5 * a.n || right.n <= a.n)) {
            flags.range = true;
          } else {
            out.push({
              ...right,
              items: items * right.items,
              amount: right.amount * items,
              perItem: right.amount,
              start: a.start,
            });
            k = r;
            continue;
          }
        } else if (right?.kind === 'count' && !ofJoin) {
          if (joinedByDash) {
            // "38-46 pieces": a range of counts says nothing reliable.
            k = r;
            continue;
          }
          if (right.n >= MAX_ITEMS_PER_PACK) {
            // "12 x 355 Cans": a size with its unit missing, not 4,260 cans.
            flags.unknownCount = true;
            k = r;
            continue;
          }
          if (!right.serving) {
            out.push({ kind: 'count', n: items * right.n, items, start: a.start, end: right.end });
            k = r;
            continue;
          }
        } else if (right?.kind === 'dose' && !ofJoin && !joinedByDash) {
          // "60 x 500 mg": 60 tablets.
          out.push({ kind: 'count', n: items, items: 1, start: a.start, end: right.end });
          k = r;
          continue;
        }
      }
    }

    // Right factor: "130g x 4", "60 g x 6 packs", "40ml x 7本".
    if (a.kind === 'measure' && a.items === 1 && isX(atoms[k + 1])) {
      const right = atoms[k + 2];
      const n =
        right?.kind === 'num' && right.integer
          ? right.n
          : right?.kind === 'count' && !right.serving
            ? right.n
            : null;
      if (n != null && n > 0) {
        out.push({
          ...a,
          items: n,
          amount: a.amount * n,
          perItem: a.amount,
          end: (right as Atom).end,
        });
        k += 2;
        continue;
      }
    }

    // "qty x 75g", "? x 14g": a per-item size with no count.
    if (a.kind === 'measure' && isX(out[out.length - 1])) {
      out.push({ ...a, each: true });
      continue;
    }
    out.push(a);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Tags

const DRAINED_AFTER =
  /^[\s.(]*(?:poids\s*)?(?:net\s*)?(?:drained|égoutté|egoutte|égoutte|egoutté|dw)(?![\p{L}])/u;
const DRAINED_BEFORE = /(?:drained|égoutté|egoutte)\s*(?:wt\.?|weight)?\s*:?\s*$/u;
const EACH_AFTER =
  /^[\s.)]*\(?\s*(?:each|ea(?![\p{L}])|chacune?|per\s|par\s)|^\s*\/\s*(?!net|poids|total)\p{L}/u;
const SERVING_BEFORE =
  /(?:^|[^\p{L}])(?:per|scoop|serving|portion|tasse|tbsp|tsp)s?(?![\p{L}])[^,;/()]*$/u;
const SERVING_AFTER = /^\s*\(\s*(?:portion|serving|per serving)s?\s*\)/u;
const NET_BEFORE = /(?:^|[^\p{L}])(?:net|total)(?![\p{L}])[^\d]*$/u;
const NET_AFTER = /^[\s.]*(?:net|total)(?![\p{L}])/u;

const isNumeric = (a: Atom): boolean =>
  a.kind === 'num' || a.kind === 'measure' || a.kind === 'count' || a.kind === 'dose';

function tagMeasures(s: string, atoms: Atom[]): void {
  atoms.forEach((a, k) => {
    if (a.kind !== 'measure') return;
    let prevEnd = 0;
    for (let p = k - 1; p >= 0; p--) {
      if (isNumeric(atoms[p] as Atom)) {
        prevEnd = (atoms[p] as Atom).end;
        break;
      }
    }
    let nextStart = s.length;
    for (let q = k + 1; q < atoms.length; q++) {
      if (isNumeric(atoms[q] as Atom)) {
        nextStart = (atoms[q] as Atom).start;
        break;
      }
    }
    const before = s.slice(prevEnd, a.start);
    const after = s.slice(a.end, nextStart);
    if (DRAINED_AFTER.test(after) || DRAINED_BEFORE.test(before)) a.drained = true;
    if (SERVING_BEFORE.test(before) || SERVING_AFTER.test(after)) a.serving = true;
    // On a multiplication, "each" describes the item, which the product already accounts for.
    if (EACH_AFTER.test(after) && a.items === 1) a.each = true;
    if (NET_BEFORE.test(before) || NET_AFTER.test(after)) a.net = true;
  });
}

// ---------------------------------------------------------------------------------------------
// Loose numbers in front of a measure

const LINK_GAP = /[,/:;]|(?:^|[^\p{L}])(?:and|et|pour|for|net|&)(?![\p{L}])/u;
const SERVING_GAP = /(?:^|[^\p{L}])(?:servings?|portions?|scoops?|per)(?![\p{L}])/u;

interface LooseResult {
  counts: CountAtom[];
  spaceJoined: boolean;
  unknownCount: boolean;
}

/**
 * A bare integer right before a measure: "12, 450 g" and "1 and 400g" give a pack count,
 * "1 400 g" could be 1,400 g or 1 x 400 g, and "24 mcx 60g" could be 24 x 60 g.
 */
function readLooseNumbers(s: string, atoms: Atom[]): LooseResult {
  const res: LooseResult = { counts: [], spaceJoined: false, unknownCount: false };
  atoms.forEach((a, k) => {
    if (a.kind !== 'num' || !a.integer || a.n < 1) return;
    let q = k + 1;
    while (q < atoms.length && !isNumeric(atoms[q] as Atom)) q++;
    const next = atoms[q];
    if (next?.kind !== 'measure') return;
    const gap = s.slice(a.end, next.start);
    if (/^\s*$/.test(gap)) {
      res.spaceJoined = true;
    } else if (SERVING_GAP.test(gap)) {
      // "12 servings / 230g": not a pack count.
    } else if (LINK_GAP.test(gap) || /\(/.test(gap)) {
      if (a.n <= 100)
        res.counts.push({ kind: 'count', n: a.n, items: 1, start: a.start, end: a.end });
    } else if (/^[\s.\p{L}]+$/u.test(gap) && a.n > 1) {
      res.unknownCount = true;
    }
  });
  return res;
}

// ---------------------------------------------------------------------------------------------
// The decision

const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const agrees = (a: number, b: number, tol: number): boolean =>
  Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b));

function result(
  status: UnitParseStatus,
  reason: SizeReason | null,
  net?: { quantity: number; unit: NetUnit; pack: number | null },
): SizeParse {
  if (status !== 'ok' || !net) {
    return {
      unit_parse_status: status,
      net_quantity: null,
      net_unit: null,
      pack_count: null,
      reason,
    };
  }
  const quantity = round3(net.quantity);
  if (!(quantity > 0)) return result('unparsed', 'zero');
  if (quantity > 999_999_999) return result('unparsed', 'out_of_range');
  const pack = net.pack != null && net.pack >= 2 && net.pack <= 32_767 ? net.pack : null;
  return {
    unit_parse_status: 'ok',
    net_quantity: quantity,
    net_unit: net.unit,
    pack_count: pack,
    reason: null,
  };
}

const PER_WEIGHT =
  /[$€]\s*~?\s*(?:\/|per(?![\p{L}])|par(?![\p{L}]))|(?:^|[^\p{L}])var(?:ies|iable)(?![\p{L}])/u;

const PER_WEIGHT_PRICE = /\/\s*(?:kg|kilo|lbs?|100\s*g)(?![\p{L}])/iu;

/** Parse a size string. Never throws. */
export function parseSize(text: string | null | undefined): SizeParse {
  const raw = (text ?? '').trim();
  if (raw === '') return result('unparsed', 'empty');
  if (PER_WEIGHT.test(raw.toLowerCase())) return result('unparsed', 'per_weight');
  const { s, thousands } = normalizeSizeText(raw);
  if (/^\s*per(?![\p{L}])/u.test(s)) return result('unparsed', 'serving_only');

  const flags: Flags = {};
  const atoms = joinProducts(mergeCompounds(s, scan(s)), flags);
  tagMeasures(s, atoms);
  const loose = readLooseNumbers(s, atoms);

  const measures = atoms.filter((a): a is MeasureAtom => a.kind === 'measure' && a.amount > 0);
  const counts = [
    ...atoms.filter((a): a is CountAtom => a.kind === 'count' && !a.serving && a.n > 0),
    ...loose.counts,
  ];

  if (loose.spaceJoined) return result('ambiguous', 'space_joined_numbers');
  if (loose.unknownCount || flags.unknownCount) return result('ambiguous', 'unknown_count');
  if (flags.range) return result('ambiguous', 'range');

  // Resolve oz to the kind of the other measures.
  const dims = new Set(
    measures.filter((m) => !m.drained && m.def.dim !== 'oz').map((m) => m.def.dim),
  );
  const ozDim: Dim = dims.has('volume') && !dims.has('mass') ? 'volume' : 'mass';
  const dimOf = (m: MeasureAtom): Dim => (m.def.dim === 'oz' ? ozDim : m.def.dim);
  for (const m of measures) {
    if (m.def.dim === 'oz') {
      const f = ozDim === 'volume' ? ML_PER_FL_OZ : GRAMS_PER_OZ;
      m.perItem = m.n * f;
      m.amount = m.perItem * m.items;
    }
  }

  const each = measures.filter((m) => m.each && !m.drained && !m.serving);
  const perItemValues = [
    ...each.map((m) => m.amount),
    ...measures.filter((m) => m.items > 1).map((m) => m.perItem),
  ];
  const productTotals = measures.filter((m) => m.items > 1).map((m) => m.amount);
  const candidates = measures.filter(
    (m) =>
      !m.drained &&
      !m.serving &&
      !m.each &&
      // "5 x 80g (2.82 oz)": the ounces restate the item, not the pack.
      !(
        m.items === 1 &&
        perItemValues.some((v) => agrees(v, m.amount, m.def.metric ? 0.02 : 0.06)) &&
        !productTotals.some((v) => agrees(v, m.amount, 0.02))
      ),
  );

  const distinctCounts = [...new Set(counts.map((c) => c.n))];
  const packFromCounts = distinctCounts.length === 1 ? (distinctCounts[0] as number) : null;

  if (candidates.length === 0) {
    if (each.length > 0 && packFromCounts != null) {
      const first = each[0] as MeasureAtom;
      if (!each.every((m) => dimOf(m) === dimOf(first) && agrees(m.amount, first.amount, 0.06))) {
        return result('ambiguous', 'sizes_disagree');
      }
      const per = each.find((m) => m.def.metric) ?? first;
      return result('ok', null, {
        quantity: per.amount * packFromCounts,
        unit: dimOf(per) === 'mass' ? 'g' : 'ml',
        pack: packFromCounts,
      });
    }
    if (counts.length > 0) {
      if (packFromCounts == null) return result('ambiguous', 'counts_disagree');
      const product = counts.find((c) => c.items > 1);
      return result('ok', null, {
        quantity: packFromCounts,
        unit: 'ct',
        pack: product?.items ?? null,
      });
    }
    if (each.length > 0) return result('unparsed', 'each_without_count');
    if (measures.some((m) => m.drained)) return result('unparsed', 'drained_only');
    if (measures.length > 0) return result('unparsed', 'serving_only');
    if (atoms.some((a) => a.kind === 'measure')) return result('unparsed', 'zero');
    // "$4.99/lb", "/kg": a price by weight and nothing else.
    if (PER_WEIGHT_PRICE.test(raw)) return result('unparsed', 'per_weight');
    if (atoms.some((a) => a.kind === 'num')) return result('unparsed', 'bare_number');
    // "300 mg": a dose is never read as the package weight.
    if (atoms.some((a) => a.kind === 'dose')) return result('unparsed', 'dose_only');
    return result('unparsed', 'no_size');
  }

  const candDims = new Set(candidates.map(dimOf));
  if (candDims.size > 1) return result('ambiguous', 'mass_and_volume');
  const dim = [...candDims][0] as Dim;

  const primary = candidates.filter((m) => !m.def.secondary);
  if (primary.length === 0) return result('ambiguous', 'non_metric_only');
  const metric = primary.filter((m) => m.def.metric);
  const pool = metric.length > 0 ? metric : primary;
  const chosen =
    pool.find((m) => m.net && m.items === 1) ??
    pool.find((m) => m.items === 1) ??
    pool.find((m) => m.net) ??
    (pool[0] as MeasureAtom);

  for (const m of candidates) {
    const tol = m.def.metric && chosen.def.metric ? 0.02 : 0.06;
    if (!agrees(m.amount, chosen.amount, tol)) return result('ambiguous', 'sizes_disagree');
  }
  if (thousands) return result('ambiguous', 'thousands_separator');

  const product = chosen.items > 1 ? chosen : candidates.find((m) => m.items > 1);
  const pack = product?.items ?? packFromCounts;
  return result('ok', null, { quantity: chosen.amount, unit: dim === 'mass' ? 'g' : 'ml', pack });
}

/** The `UnitParser` hook for `validateBatch`: the four product fields, nothing else. */
export const sizeUnitParser: UnitParser = (quantityText) => {
  const { unit_parse_status, net_quantity, net_unit, pack_count } = parseSize(quantityText);
  return { unit_parse_status, net_quantity, net_unit, pack_count };
};

// ---------------------------------------------------------------------------------------------
// Unit prices

export interface UnitPrice {
  /** Price per gram, millilitre or item, rounded to 5 decimals (numeric(12,5)). */
  unit_price: number;
  unit_basis: NetUnit;
}

export interface UnitPriceBasis {
  /** How the price was quoted: per item (the default), per kg or per lb. */
  price_per?: 'unit' | 'kg' | 'lb' | null;
  /** The product's parsed size; needed for a per-item price. */
  size?: Pick<SizeParse, 'unit_parse_status' | 'net_quantity' | 'net_unit'> | null;
}

/**
 * Price per base unit, computed from the price and our own parsed size (a source's unit price
 * isn't trusted). Null when the price isn't positive, the size isn't `ok`, or the result
 * rounds to 0.
 */
export function unitPrice(price: number, basis: UnitPriceBasis = {}): UnitPrice | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  let value: number;
  let unit: NetUnit;
  if (basis.price_per === 'kg' || basis.price_per === 'lb') {
    value = price / (basis.price_per === 'kg' ? 1000 : GRAMS_PER_LB);
    unit = 'g';
  } else {
    const size = basis.size;
    if (!size || size.unit_parse_status !== 'ok' || size.net_unit == null) return null;
    const qty = size.net_quantity;
    if (qty == null || !(qty > 0)) return null;
    value = price / qty;
    unit = size.net_unit;
  }
  const rounded = Math.round(value * 1e5) / 1e5;
  return rounded > 0 ? { unit_price: rounded, unit_basis: unit } : null;
}
