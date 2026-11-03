// SPARQL for the Wikidata ownership source (SOURCES.md S17, PLAN P3.12, D-065, D-066): the queries
// and a reader for the SPARQL 1.1 JSON results format. Three queries:
//
// - match: which brand- or business-class items have one of these labels or aliases (en, fr, mul),
//   whether by label or alias, their countries, P31 classes and P452 industries;
// - classes: which of those classes are excluded, a grocery brand class or a grocery store
//   class, and which industries are a grocery trade or bare retail;
// - entities: the facts for a set of items (labels, aliases, P31, country, website, enwiki title,
//   SEC CIK, OpenCorporates id, P576), their own owner statements (P127 / P749, with rank, P580,
//   P582 and P1107), and the statements of the given children that point at them.
//
// Deprecated statements are left out in the query. Every value is a plain row (`?p` says which
// fact it is), so one query covers all facets without a cross product.

export const WD_ENDPOINT = 'https://query.wikidata.org/sparql';
export const WD_ENTITY = 'http://www.wikidata.org/entity/';

/** brand, trademark. */
export const BRAND_CLASSES = ['Q431289', 'Q167270'] as const;
/** business, enterprise, company. */
export const BUSINESS_CLASSES = ['Q4830453', 'Q6881511', 'Q783794'] as const;
/**
 * P31/P279* classes that are never a grocery brand or its owner, though Wikidata files many of
 * them under business (D-066): places (US towns, French communes), schools, publishers, media,
 * record labels, airlines, government agencies, movie theaters, law firms, cigarette brands.
 */
export const EXCLUDED_CLASSES = [
  'Q486972', // human settlement
  'Q56061', // administrative territorial entity
  'Q2385804', // educational institution
  'Q2085381', // publisher
  'Q11033', // mass media
  'Q1331793', // media company
  'Q1002697', // periodical
  'Q18127', // record label
  'Q210167', // video game developer
  'Q46970', // airline
  'Q327333', // government agency
  'Q41253', // movie theater
  'Q613142', // law firm
  'Q19509097', // cigarette brand
] as const;
/**
 * P452/P279* industries that count as grocery trade on their own (D-066). Bare retail isn't one
 * of them: see RETAIL_INDUSTRIES (P3.12c).
 */
export const TRADE_INDUSTRIES = [
  'Q540912', // food industry
  'Q627371', // food processing
  'Q4899370', // beverage industry
  'Q1187656', // fast-moving consumer goods
  'Q220695', // wholesale
  'Q11451', // agriculture
  'Q2095', // food
  'Q40050', // drink
  'Q180846', // supermarket
  'Q1295201', // grocery store
  'Q7361709', // convenience store
  'Q81799', // fast food
  // Seen on grocery companies in the P3.12a sample but not under the roots above.
  'Q637776', // dairy
  'Q1445627', // ice cream manufacturer
  'Q1054321', // coffee production
  'Q107601756', // food and tobacco industry
  'Q396622', // agribusiness
] as const;
/**
 * P452/P279* industries that say a company sells things but not what: clothing (Prana) and
 * electronics (Best Buy) retailers have only these. They count as grocery evidence only on an
 * item in a GROCERY_STORE_CLASSES class (D-066, P3.12c).
 */
export const RETAIL_INDUSTRIES = [
  'Q126793', // retail
  'Q507619', // retail chain
  'Q16766413', // big-box store
  'Q484847', // e-commerce
] as const;
/** P31/P279* store-chain classes that sell groceries (D-066, P3.12c). */
export const GROCERY_STORE_CLASSES = [
  'Q18043413', // supermarket chain
  'Q132777643', // grocery store chain
  'Q98555051', // food store chain
  'Q76213979', // convenience store chain
  'Q105615608', // hypermarket chain
] as const;
/**
 * P31/P279* brand classes that are grocery brands (D-066, P3.12b). Being brand-class alone isn't
 * evidence: Wikidata files gas station chains, department stores, cigarettes and shoes under
 * brand. A brand-class candidate needs one of these or a TRADE_INDUSTRIES industry.
 */
export const GROCERY_BRAND_CLASSES = [
  'Q16323605', // food brand (drink, coffee, ice cream, chocolate brand …)
  'Q80359036', // alcohol brand (beer, wine, whisky brand)
  'Q105975861', // tea brand
  'Q722080', // private label
  'Q3749157', // store brand
  'Q1378329', // generic brand
  'Q136305047', // pet food brand
] as const;
/** The `cc` value for a country with no ISO alpha-2 code (P297), e.g. Q55 Netherlands. */
export const NO_CODE = '??';
/** Label languages for matching OFF brand strings, and for aliases. */
export const MATCH_LANGS = ['en', 'fr', 'mul'] as const;
/** Name languages, most preferred first; owners are often only labelled in their own language. */
export const NAME_LANGS = ['en', 'mul', 'fr', 'de', 'es', 'it', 'nl', 'pt', 'sv', 'ja', 'zh'];

/** A SPARQL string literal. */
export function literal(value: string, lang?: string): string {
  const body = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  return lang ? `"${body}"@${lang}` : `"${body}"`;
}

const wd = (qid: string) => {
  if (!/^Q[1-9][0-9]*$/.test(qid)) throw new Error(`Not a QID: ${qid}`);
  return `wd:${qid}`;
};
const langList = (langs: readonly string[]) => langs.map((l) => `"${l}"`).join(', ');

export function matchQuery(labels: readonly string[]): string {
  const values = labels.flatMap((l) => MATCH_LANGS.map((lang) => literal(l, lang))).join(' ');
  return `SELECT ?label ?item ?how ?cc ?brand ?business ?p31 ?ind WHERE {
  VALUES ?label { ${values} }
  { ?item rdfs:label ?label . BIND("label" AS ?how) } UNION { ?item skos:altLabel ?label . BIND("alias" AS ?how) }
  BIND(EXISTS { VALUES ?bc { ${BRAND_CLASSES.map(wd).join(' ')} } ?item wdt:P31/wdt:P279* ?bc } AS ?brand)
  BIND(EXISTS { VALUES ?oc { ${BUSINESS_CLASSES.map(wd).join(' ')} } ?item wdt:P31/wdt:P279* ?oc } AS ?business)
  FILTER(?brand || ?business)
  OPTIONAL { ?item wdt:P17 ?country . OPTIONAL { ?country wdt:P297 ?code } BIND(COALESCE(?code, "${NO_CODE}") AS ?cc) }
  OPTIONAL { ?item wdt:P31 ?p31 }
  OPTIONAL { ?item wdt:P452 ?ind }
}`;
}

/**
 * For P31 classes and P452 industries: is it (a subclass of) an excluded class, a grocery brand
 * class, a grocery store class, a grocery trade, or bare retail. Asked once per class per run, so the subclass walks that would
 * slow every match query (US towns alone are thousands of classes deep) run only on new classes.
 */
export function classQuery(qids: readonly string[]): string {
  // Both ends of the path are bound in one group, so each check is a short upward walk. (A walk
  // with one end free, as in a UNION branch or EXISTS, expands the root's whole subclass tree.)
  const roots = [
    ...EXCLUDED_CLASSES.map((q) => `(${wd(q)} "excluded")`),
    ...TRADE_INDUSTRIES.map((q) => `(${wd(q)} "trade")`),
    ...GROCERY_BRAND_CLASSES.map((q) => `(${wd(q)} "grocery")`),
    ...RETAIL_INDUSTRIES.map((q) => `(${wd(q)} "retail")`),
    ...GROCERY_STORE_CLASSES.map((q) => `(${wd(q)} "store")`),
  ].join(' ');
  return `SELECT DISTINCT ?c ?flag WHERE {
  VALUES ?c { ${qids.map(wd).join(' ')} }
  VALUES (?root ?flag) { ${roots} }
  ?c wdt:P279* ?root .
}`;
}

const statementTail = `?st wikibase:rank ?rank .
    FILTER(?rank != wikibase:DeprecatedRank)
    OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end } OPTIONAL { ?st pq:P1107 ?share }`;

export function entitiesQuery(items: readonly string[], children: readonly string[]): string {
  const owners = ['P127', 'P749']
    .map(
      (p) => `{
    ?item p:${p} ?st . ?st ps:${p} ?v . FILTER(isIRI(?v)) BIND("${p}" AS ?p)
    ${statementTail}
  }`,
    )
    .join(' UNION ');
  const inbound =
    children.length === 0
      ? ''
      : ' UNION ' +
        ['P127', 'P749']
          .map(
            (p) => `{
    VALUES ?v { ${children.map(wd).join(' ')} }
    ?v p:${p} ?st . ?st ps:${p} ?item . BIND("in${p}" AS ?p)
    ${statementTail}
  }`,
          )
          .join(' UNION ');
  return `SELECT ?item ?p ?v ?st ?rank ?start ?end ?share WHERE {
  VALUES ?item { ${items.map(wd).join(' ')} }
  { ?item rdfs:label ?v . FILTER(LANG(?v) IN (${langList(NAME_LANGS)})) BIND("label" AS ?p) }
  UNION { ?item skos:altLabel ?v . FILTER(LANG(?v) IN (${langList(MATCH_LANGS)})) BIND("alias" AS ?p) }
  UNION { ?item wdt:P31 ?v . BIND("P31" AS ?p) }
  UNION { ?item wdt:P17/wdt:P297 ?v . BIND("country" AS ?p) }
  UNION { ?item wdt:P856 ?v . BIND("website" AS ?p) }
  UNION { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?v . BIND("enwiki" AS ?p) }
  UNION { ?item wdt:P5531 ?v . BIND("P5531" AS ?p) }
  UNION { ?item wdt:P1320 ?v . BIND("P1320" AS ?p) }
  UNION { ?item wdt:P576 ?v . BIND("P576" AS ?p) }
  UNION ${owners}${inbound}
}`;
}

/** One SPARQL JSON binding value. */
export interface SparqlTerm {
  type: 'uri' | 'literal' | 'bnode';
  value: string;
  'xml:lang'?: string;
  datatype?: string;
}
export type SparqlRow = Record<string, SparqlTerm | undefined>;

/** The rows of a SPARQL JSON result. Throws on anything else (an HTML error page, a timeout). */
export function sparqlRows(body: unknown): SparqlRow[] {
  const rows = (body as { results?: { bindings?: unknown } } | null)?.results?.bindings;
  if (!Array.isArray(rows)) throw new Error('Not a SPARQL JSON result.');
  return rows as SparqlRow[];
}

/** `http://www.wikidata.org/entity/Q42` → `Q42`; null for anything else. */
export function qidOf(term: SparqlTerm | undefined): string | null {
  if (term?.type !== 'uri' || !term.value.startsWith(WD_ENTITY)) return null;
  const id = term.value.slice(WD_ENTITY.length);
  return /^Q[1-9][0-9]*$/.test(id) ? id : null;
}

/** `wikibase:PreferredRank` → `preferred`. */
export function rankOf(term: SparqlTerm | undefined): 'preferred' | 'normal' | null {
  const v = term?.value ?? '';
  if (v.endsWith('#PreferredRank')) return 'preferred';
  if (v.endsWith('#NormalRank')) return 'normal';
  return null;
}

/** A Wikidata time literal as an ISO date (`+2009-12-01T00:00:00Z` → `2009-12-01`). */
export function dateOf(term: SparqlTerm | undefined): string | null {
  if (term?.type !== 'literal') return null;
  const m = /^\+?(\d{4})-(\d{2})-(\d{2})T/.exec(term.value);
  if (!m) return null;
  // Year- or month-precision values come as -00 or -01; 00 isn't a date.
  const month = m[2] === '00' ? '01' : m[2];
  const day = m[3] === '00' ? '01' : m[3];
  const iso = `${m[1]}-${month}-${day}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}
