// SPARQL for the Wikidata ownership source (SOURCES.md S17, PLAN P3.12, D-065): the queries and a
// reader for the SPARQL 1.1 JSON results format. Two queries:
//
// - match: which brand- or business-class items have one of these labels or aliases (en, fr, mul);
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
  return `SELECT ?label ?item ?cc ?brand ?business WHERE {
  VALUES ?label { ${values} }
  ?item rdfs:label|skos:altLabel ?label .
  BIND(EXISTS { VALUES ?bc { ${BRAND_CLASSES.map(wd).join(' ')} } ?item wdt:P31/wdt:P279* ?bc } AS ?brand)
  BIND(EXISTS { VALUES ?oc { ${BUSINESS_CLASSES.map(wd).join(' ')} } ?item wdt:P31/wdt:P279* ?oc } AS ?business)
  FILTER(?brand || ?business)
  OPTIONAL { ?item wdt:P17/wdt:P297 ?cc }
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
