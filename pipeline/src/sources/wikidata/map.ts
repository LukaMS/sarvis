// Wikidata ownership (SOURCES.md S17, PLAN P3.12, D-065): OFF brand strings → matched items →
// brand, company and ownership-edge records. Pure functions over stored envelopes, so a run can be
// re-parsed from Storage.
//
// A stored response is an envelope: the step that asked (which labels, or which items with which
// roles, and which children's statements to read) plus the SPARQL JSON. The step's roles come from
// earlier responses, so the envelope carries them; parse never needs live state.
import { type RecordInputOf, cleanText, slugify } from '@sarvis/core';

import { NAME_LANGS, type SparqlRow, dateOf, qidOf, rankOf, sparqlRows } from './sparql.ts';

export const WD_KEY = 'wikidata';
export const WD_JOB = 'wikidata-ownership';
export const WD_VERSION = '1.3.0';
export const WD_METHOD_VERSION = `${WD_KEY}@${WD_VERSION}`;
/** Labels per match query and items per entities query (PLAN P3.12: ≤ 50). */
export const MAX_LABELS = 50;
export const MAX_ITEMS = 50;
/** Classes per classes query. */
export const MAX_CLASSES = 200;
/** Owner hops walked above a matched item. */
export const MAX_HOPS = 5;

export const entityUrl = (qid: string) => `https://www.wikidata.org/wiki/${qid}`;

export interface BrandString {
  brand: string;
  products: number;
}

/** Placeholder values OFF users type into `brands`; never sent to Wikidata. */
const PLACEHOLDER =
  /^(null|none|n\/?a|unknown|inconnu|inconnue|sans marque|no brand|aucune|generic|générique|-+|\.+|\?+)$/i;

/** Brand strings worth a query: not a placeholder, has a letter, fits a label. */
export function usableBrand(brand: string): boolean {
  const b = brand.trim();
  return b.length > 0 && b.length <= 200 && /\p{L}/u.test(b) && !PLACEHOLDER.test(b);
}

/**
 * The spellings tried for one brand string: as typed, with curly apostrophes straightened, and
 * title-cased when a word starts lower-case ("Club house" → "Club House"). Labels are matched
 * exactly, so these are the cheap variants that rescue common typing differences.
 */
export function labelVariants(brand: string): string[] {
  const base = brand.trim().replace(/\s+/g, ' ');
  const straight = base.replace(/[‘’ʼ]/g, "'");
  const out = [base, straight];
  if (/(^|\s)\p{Ll}/u.test(straight)) {
    out.push(
      straight.replace(/(^|\s)(\p{Ll})/gu, (_m, sp: string, c: string) => sp + c.toUpperCase()),
    );
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------------------------
// Matching

export interface Candidate {
  qid: string;
  countries: string[];
  brand: boolean;
  business: boolean;
  /** In an EXCLUDED_CLASSES class: never picked, but still counts against the `single` tier. */
  excluded: boolean;
  /** Has a TRADE_INDUSTRIES industry (P452). */
  trade: boolean;
  /** In a GROCERY_BRAND_CLASSES class (P31/P279*): food, drink, private label … brand. */
  grocery: boolean;
  /** Has a RETAIL_INDUSTRIES industry (P452): retail, retail chain, big-box store, e-commerce. */
  retail: boolean;
  /** In a GROCERY_STORE_CLASSES class (P31/P279*): supermarket, grocery or convenience chain … */
  store: boolean;
}

export type MatchTier = 'single' | 'CA' | 'brand-class' | 'US';

export interface MatchDecision {
  brand: string;
  status: 'matched' | 'ambiguous' | 'unmatched';
  candidates: number;
  qid?: string;
  /** `company`: a business-class item, which becomes a company and its own brand. */
  role?: 'brand' | 'company';
  tier?: MatchTier;
}

/**
 * No country, or Canada or the US among them. A country without an ISO code (Q55 Netherlands)
 * counts as a country that isn't North American.
 */
const northAmerican = (c: Candidate) =>
  c.countries.length === 0 || c.countries.includes('CA') || c.countries.includes('US');
/**
 * Grocery evidence: a grocery brand class, a grocery trade, or bare retail on a grocery store
 * chain. Brand-class alone isn't enough, since Wikidata files gas station chains, department
 * stores and shoes under brand (P3.12b), and nor is bare retail, which clothing and electronics
 * retailers have too (P3.12c).
 */
const grocer = (c: Candidate) => c.grocery || c.trade || (c.retail && c.store);
/** A country alone isn't evidence: the item must also show grocery evidence. */
const tradesHere = (c: Candidate, country: string) => c.countries.includes(country) && grocer(c);

/**
 * The item for one brand string, or none (D-065, D-066). Exact label matches are often several
 * items ("Metro" has 19), so the pick is by tiers, and a tier only decides when exactly one
 * candidate is in it: the only candidate (excluded classes count here, so a French commune keeps
 * a French chain from winning by default); else the only Canadian one; else the only North
 * American brand-class one; else the only US one. Every tier after `single` needs grocery
 * evidence (see `grocer`), so a brand the brand-class tier rejects
 * can't come back through the US tier. Excluded-class items are never picked. Anything else is
 * ambiguous and skipped (the P4 resolver can try later).
 */
export function pickCandidate(candidates: readonly Candidate[]): {
  pick: Candidate | null;
  tier?: MatchTier;
} {
  const eligible = candidates.filter((c) => !c.excluded);
  if (eligible.length === 0) return { pick: null };
  if (candidates.length === 1) return { pick: eligible[0] as Candidate, tier: 'single' };
  const tiers: [MatchTier, (c: Candidate) => boolean][] = [
    ['CA', (c) => tradesHere(c, 'CA')],
    ['brand-class', (c) => c.brand && northAmerican(c) && grocer(c)],
    ['US', (c) => tradesHere(c, 'US')],
  ];
  for (const [tier, test] of tiers) {
    const hits = eligible.filter(test);
    if (hits.length === 1) return { pick: hits[0] as Candidate, tier };
    if (hits.length > 1) return { pick: null };
  }
  return { pick: null };
}

/**
 * Brand strings of ≤ 2 letters ("PC", "D") match labels only: as aliases they're initialisms of
 * too many things (D-066).
 */
export const isShortBrand = (brand: string) => (brand.match(/\p{L}/gu) ?? []).length <= 2;

/**
 * Whether a P31 class is excluded, a grocery brand class or a grocery store class, and whether a
 * P452 industry is a grocery trade or bare retail (D-066).
 */
export interface ClassFlags {
  excluded: boolean;
  trade: boolean;
  grocery: boolean;
  retail: boolean;
  store: boolean;
}
const FLAGS = ['excluded', 'trade', 'grocery', 'retail', 'store'] as const;
/** All flags false: a class the classes query hasn't flagged. */
export const noFlags = (): ClassFlags => ({
  excluded: false,
  trade: false,
  grocery: false,
  retail: false,
  store: false,
});
export type ClassTable = Record<string, ClassFlags>;

/** The P31 classes and P452 industries of a match result's candidates, sorted. */
export function candidateClasses(result: unknown): string[] {
  const out = new Set<string>();
  for (const row of sparqlRows(result)) {
    for (const t of [row.p31, row.ind]) {
      const q = qidOf(t);
      if (q) out.add(q);
    }
  }
  return [...out].sort((a, b) => qidNumber(a) - qidNumber(b));
}

/** Flags for these QIDs from a classes-query result (one row per class and flag that holds). */
export function classFlagsOf(result: unknown, qids: readonly string[]): ClassTable {
  const out: ClassTable = Object.fromEntries(qids.map((q) => [q, noFlags()]));
  for (const row of sparqlRows(result)) {
    const f = out[qidOf(row.c) ?? ''];
    const flag = row.flag?.value;
    const known = FLAGS.find((k) => k === flag);
    if (f && known) f[known] = true;
  }
  return out;
}

/**
 * Candidates per brand string from a match result, then one decision per brand string. `classes`
 * holds the flags of the candidates' classes and industries; one that's missing counts as neither.
 */
export function decideMatches(
  brands: readonly string[],
  result: unknown,
  classes: ClassTable = {},
): MatchDecision[] {
  const byLabel = new Map<string, string[]>();
  for (const b of brands) {
    for (const v of labelVariants(b)) byLabel.set(v, [...(byLabel.get(v) ?? []), b]);
  }
  const found = new Map<string, Map<string, Candidate>>();
  for (const row of sparqlRows(result)) {
    const qid = qidOf(row.item);
    const label = row.label?.value;
    if (!qid || !label) continue;
    const byAlias = row.how?.value === 'alias';
    const p31 = qidOf(row.p31);
    const ind = qidOf(row.ind);
    for (const b of byLabel.get(label) ?? []) {
      if (byAlias && isShortBrand(b)) continue;
      const per = found.get(b) ?? new Map<string, Candidate>();
      found.set(b, per);
      const c = per.get(qid) ?? {
        qid,
        countries: [],
        brand: row.brand?.value === 'true',
        business: row.business?.value === 'true',
        excluded: false,
        trade: false,
        grocery: false,
        retail: false,
        store: false,
      };
      const cc = row.cc?.value;
      if (cc && !c.countries.includes(cc)) c.countries.push(cc);
      if (p31 && classes[p31]?.excluded) c.excluded = true;
      if (p31 && classes[p31]?.grocery) c.grocery = true;
      if (p31 && classes[p31]?.store) c.store = true;
      if (ind && classes[ind]?.retail) c.retail = true;
      if (ind && classes[ind]?.trade) c.trade = true;
      per.set(qid, c);
    }
  }
  return brands.map((brand): MatchDecision => {
    const candidates = [...(found.get(brand)?.values() ?? [])].sort(
      (a, b) => qidNumber(a.qid) - qidNumber(b.qid),
    );
    // Only excluded-class items (a town, a school): nothing named this is a brand or business.
    if (candidates.every((c) => c.excluded)) {
      return { brand, status: 'unmatched', candidates: candidates.length };
    }
    const { pick, tier } = pickCandidate(candidates);
    if (!pick) return { brand, status: 'ambiguous', candidates: candidates.length };
    return {
      brand,
      status: 'matched',
      candidates: candidates.length,
      qid: pick.qid,
      role: pick.business ? 'company' : 'brand',
      tier,
    };
  });
}

const qidNumber = (qid: string) => Number(qid.slice(1));

// ---------------------------------------------------------------------------------------------
// Steps and envelopes

/** An item in an entities step, with the records it should produce. */
export interface ItemSpec {
  qid: string;
  /** Write a brand record. */
  brand: boolean;
  /** Write a company record. */
  company: boolean;
  /** A business-class match: also its own brand, linked by an `owner` edge to itself. */
  self: boolean;
  /** Walk its owners (its statements become the next hop). */
  expand: boolean;
}

/** A child whose statements pointing at this step's items become edges. */
export interface ChildSpec {
  qid: string;
  as: 'brand' | 'company';
}

export type WdStep =
  | { kind: 'match'; index: number }
  | { kind: 'entities'; hop: number; items: ItemSpec[]; children: ChildSpec[] };

export type Envelope =
  | {
      kind: 'match';
      brands: string[];
      query: string;
      result: unknown;
      /** Classes queries for the classes this run hadn't seen yet (none once they're all known). */
      classQueries: string[];
      classResults: unknown[];
      /** Flags for every class and industry this batch's decisions used (looked up or cached). */
      classes: ClassTable;
    }
  | {
      kind: 'entities';
      hop: number;
      items: ItemSpec[];
      children: ChildSpec[];
      query: string;
      result: unknown;
    };

// ---------------------------------------------------------------------------------------------
// Entity facts

export interface Statement {
  prop: 'P127' | 'P749';
  /** The owner for an item's own statement; the child for an inbound one. */
  other: string;
  rank: 'preferred' | 'normal';
  start: string | null;
  end: string | null;
  /** P1107 proportion as a percentage. */
  sharePct: number | null;
}

export interface Facts {
  labels: Map<string, string>;
  aliases: Set<string>;
  p31: Set<string>;
  countries: Set<string>;
  websites: Set<string>;
  enwiki: string | null;
  ciks: Set<string>;
  openCorporates: Set<string>;
  dissolved: boolean;
  owners: Statement[];
  inbound: Statement[];
}

const emptyFacts = (): Facts => ({
  labels: new Map(),
  aliases: new Set(),
  p31: new Set(),
  countries: new Set(),
  websites: new Set(),
  enwiki: null,
  ciks: new Set(),
  openCorporates: new Set(),
  dissolved: false,
  owners: [],
  inbound: [],
});

/** P1107 is a proportion (0.25); a few editors enter a percentage (25). */
export function sharePctOf(value: string | undefined): number | null {
  const n = Number(value);
  if (value === undefined || !Number.isFinite(n) || n <= 0) return null;
  const pct = n <= 1 ? n * 100 : n;
  return pct > 100 ? null : Math.round(pct * 100) / 100;
}

function statementOf(row: SparqlRow, prop: 'P127' | 'P749', other: string): Statement | null {
  const rank = rankOf(row.rank);
  if (!rank) return null;
  return {
    prop,
    other,
    rank,
    start: dateOf(row.start),
    end: dateOf(row.end),
    sharePct: sharePctOf(row.share?.value),
  };
}

/** Folds a statement's rows (one per qualifier value) into one: earliest start, latest end. */
function foldStatement(into: Map<string, Statement>, id: string, s: Statement): void {
  const prev = into.get(id);
  if (!prev) {
    into.set(id, s);
    return;
  }
  if (s.start && (!prev.start || s.start < prev.start)) prev.start = s.start;
  if (s.end && (!prev.end || s.end > prev.end)) prev.end = s.end;
  prev.sharePct ??= s.sharePct;
}

export function factsOf(result: unknown): Map<string, Facts> {
  const facts = new Map<string, Facts>();
  const owners = new Map<string, Map<string, Statement>>();
  const inbound = new Map<string, Map<string, Statement>>();
  for (const row of sparqlRows(result)) {
    const qid = qidOf(row.item);
    const p = row.p?.value;
    const v = row.v;
    if (!qid || !p || !v) continue;
    const f = facts.get(qid) ?? emptyFacts();
    facts.set(qid, f);
    switch (p) {
      case 'label': {
        const lang = v['xml:lang'];
        if (lang && !f.labels.has(lang)) f.labels.set(lang, v.value);
        break;
      }
      case 'alias':
        f.aliases.add(v.value);
        break;
      case 'P31': {
        const c = qidOf(v);
        if (c) f.p31.add(c);
        break;
      }
      case 'country':
        if (/^[A-Z]{2}$/.test(v.value)) f.countries.add(v.value);
        break;
      case 'website':
        f.websites.add(v.value);
        break;
      case 'enwiki':
        f.enwiki ??= v.value;
        break;
      case 'P5531':
        f.ciks.add(v.value);
        break;
      case 'P1320':
        f.openCorporates.add(v.value);
        break;
      case 'P576':
        f.dissolved = true;
        break;
      case 'P127':
      case 'P749':
      case 'inP127':
      case 'inP749': {
        const other = qidOf(v);
        const id = row.st?.value;
        const inward = p.startsWith('in');
        const prop = (inward ? p.slice(2) : p) as 'P127' | 'P749';
        const s = other && id ? statementOf(row, prop, other) : null;
        if (!s || !id) break;
        const bucket = inward ? inbound : owners;
        const per = bucket.get(qid) ?? new Map<string, Statement>();
        bucket.set(qid, per);
        foldStatement(per, id, s);
        break;
      }
    }
  }
  const byStatement = (a: Statement, b: Statement) =>
    a.other.localeCompare(b.other) ||
    a.prop.localeCompare(b.prop) ||
    (a.start ?? '').localeCompare(b.start ?? '');
  for (const [qid, f] of facts) {
    f.owners = [...(owners.get(qid)?.values() ?? [])].sort(byStatement);
    f.inbound = [...(inbound.get(qid)?.values() ?? [])].sort(byStatement);
  }
  return facts;
}

/** The item's name: its label in the first NAME_LANGS language that has one. */
export function nameOf(f: Facts): string | null {
  for (const lang of NAME_LANGS) {
    const v = cleanText(f.labels.get(lang));
    if (v) return v.slice(0, 200);
  }
  return null;
}

/** A slug from the name, or from the QID when the name has no Latin letters or digits. */
export const slugOf = (name: string, qid: string) => slugify(name) || qid.toLowerCase();

function aliasesOf(f: Facts, name: string): string[] {
  const seen = new Set([name.toLowerCase()]);
  const out: string[] = [];
  for (const a of [...f.aliases].sort()) {
    const v = cleanText(a);
    if (!v || v.length > 200 || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out.slice(0, 20);
}

/** One value or none: a company listed in two countries gets no country rather than a guess. */
const only = (values: Set<string>) => (values.size === 1 ? [...values][0] : null);

/** The shortest http(s) website, so `https://x.com/` beats `https://x.com/en/home`. */
function websiteOf(f: Facts): string | null {
  const ok = [...f.websites].filter((w) => /^https?:\/\/[^\s]+$/.test(w));
  ok.sort((a, b) => a.length - b.length || a.localeCompare(b));
  return ok[0] ?? null;
}

/** P31 classes that set `companies.kind`: human, cooperative, nonprofit, government bodies. */
const KIND_BY_CLASS: [string, 'individual' | 'cooperative' | 'nonprofit' | 'government'][] = [
  ['Q5', 'individual'],
  ['Q4539', 'cooperative'],
  ['Q163740', 'nonprofit'],
  ['Q327333', 'government'],
  ['Q2659904', 'government'],
];

function kindOf(f: Facts): 'company' | 'individual' | 'cooperative' | 'nonprofit' | 'government' {
  for (const [cls, kind] of KIND_BY_CLASS) if (f.p31.has(cls)) return kind;
  return 'company';
}

/** Company → parent relation from the statement's share (DATA_MODEL §3.2 relations). */
export function companyRelation(s: Statement): 'subsidiary' | 'majority_stake' | 'minority_stake' {
  if (s.sharePct === null || s.sharePct >= 100) return 'subsidiary';
  return s.sharePct > 50 ? 'majority_stake' : 'minority_stake';
}

/** Whether the walk goes on above this statement: a current, controlling owner. */
export function walksUp(s: Statement, childAs: 'brand' | 'company'): boolean {
  if (s.end) return false;
  return childAs === 'brand' || companyRelation(s) !== 'minority_stake';
}

// ---------------------------------------------------------------------------------------------
// Records

type Prov = {
  source_key: string;
  fetched_at: string;
  method: 'api';
  method_version: string;
};

export interface EntityRecords {
  companies: RecordInputOf<'company'>[];
  brands: RecordInputOf<'brand'>[];
  brandEdges: RecordInputOf<'brand_ownership'>[];
  companyEdges: RecordInputOf<'company_ownership'>[];
  /** Items with no label in any NAME_LANGS language: not written. */
  unnamed: string[];
}

export function recordsOf(
  env: Extract<Envelope, { kind: 'entities' }>,
  fetchedAt: string,
): EntityRecords {
  const facts = factsOf(env.result);
  const prov: Prov = {
    source_key: WD_KEY,
    fetched_at: fetchedAt,
    method: 'api',
    method_version: WD_METHOD_VERSION,
  };
  const out: EntityRecords = {
    companies: [],
    brands: [],
    brandEdges: [],
    companyEdges: [],
    unnamed: [],
  };
  const childAs = new Map(env.children.map((c) => [c.qid, c.as]));
  const brandEdgeKeys = new Set<string>();
  const companyEdgeKeys = new Set<string>();

  for (const item of env.items) {
    const f = facts.get(item.qid);
    const name = f ? nameOf(f) : null;
    if (!f || !name) {
      out.unnamed.push(item.qid);
      continue;
    }
    const common = {
      slug: slugOf(name, item.qid),
      name,
      aliases: aliasesOf(f, name),
      wikidata_qid: item.qid,
      website: websiteOf(f),
      status: f.dissolved ? ('defunct' as const) : ('active' as const),
      source_url: entityUrl(item.qid),
      ...prov,
    };
    if (item.company) {
      const cik = only(f.ciks);
      const oc = only(f.openCorporates);
      out.companies.push({
        ...common,
        kind: kindOf(f),
        country: only(f.countries),
        wikipedia_title: cleanText(f.enwiki),
        sec_cik: cik && /^\d{1,10}$/.test(cik) ? cik.padStart(10, '0') : null,
        opencorporates_id: oc,
      });
    }
    if (item.brand) out.brands.push(common);
    if (item.self) {
      brandEdgeKeys.add(`${item.qid}>${item.qid}@`);
      out.brandEdges.push({
        brand_qid: item.qid,
        company_qid: item.qid,
        relation: 'owner',
        source_url: entityUrl(item.qid),
        ...prov,
      });
    }

    // Statements of this step's children that name this item as owner or parent. Preferred
    // statements first, so a duplicate (same endpoints, relation and start) keeps the preferred one.
    const inbound = [...f.inbound].sort(
      (a, b) => Number(b.rank === 'preferred') - Number(a.rank === 'preferred'),
    );
    for (const s of inbound) {
      const as = childAs.get(s.other);
      if (!as) continue;
      const dates = { valid_from: s.start, valid_to: s.end };
      const url = `${entityUrl(s.other)}#${s.prop}`;
      if (as === 'brand') {
        const key = `${s.other}>${item.qid}@${s.start ?? ''}`;
        if (brandEdgeKeys.has(key)) continue;
        brandEdgeKeys.add(key);
        out.brandEdges.push({
          brand_qid: s.other,
          company_qid: item.qid,
          relation: 'owner',
          ...dates,
          source_url: url,
          ...prov,
        });
      } else {
        if (s.other === item.qid) continue;
        const relation = companyRelation(s);
        const key = `${item.qid}>${s.other}:${relation}@${s.start ?? ''}`;
        if (companyEdgeKeys.has(key)) continue;
        companyEdgeKeys.add(key);
        out.companyEdges.push({
          parent_company_qid: item.qid,
          child_company_qid: s.other,
          relation,
          share_pct: s.sharePct,
          ...dates,
          source_url: url,
          ...prov,
        });
      }
    }
  }
  return out;
}

/**
 * The next hop from an entities response: each expanding item's owners, as company items, with
 * the item as a child whose statements they'll read. `expanded` holds the items already walked
 * this run; it's updated here, so an owner reached twice (or a cycle) is walked once.
 */
export function nextHop(
  env: Extract<Envelope, { kind: 'entities' }>,
  expanded: Set<string>,
  maxItems = MAX_ITEMS,
): WdStep[] {
  const hop = env.hop + 1;
  if (hop > MAX_HOPS) return [];
  const facts = factsOf(env.result);
  const owners = new Map<string, { expand: boolean; children: Map<string, ChildSpec> }>();
  for (const item of env.items) {
    if (!item.expand) continue;
    const as = item.company ? 'company' : 'brand';
    for (const s of facts.get(item.qid)?.owners ?? []) {
      if (s.other === item.qid) continue;
      const o = owners.get(s.other) ?? { expand: false, children: new Map() };
      o.expand ||= walksUp(s, as) && hop < MAX_HOPS;
      o.children.set(item.qid, { qid: item.qid, as });
      owners.set(s.other, o);
    }
  }
  const items: ItemSpec[] = [];
  const childrenOf = new Map<string, ChildSpec[]>();
  for (const [qid, o] of [...owners].sort(([a], [b]) => qidNumber(a) - qidNumber(b))) {
    const expand = o.expand && !expanded.has(qid);
    if (expand) expanded.add(qid);
    items.push({ qid, brand: false, company: true, self: false, expand });
    childrenOf.set(qid, [...o.children.values()]);
  }
  const steps: WdStep[] = [];
  for (let i = 0; i < items.length; i += maxItems) {
    const chunk = items.slice(i, i + maxItems);
    const children = new Map<string, ChildSpec>();
    for (const it of chunk) for (const c of childrenOf.get(it.qid) ?? []) children.set(c.qid, c);
    steps.push({ kind: 'entities', hop, items: chunk, children: [...children.values()] });
  }
  return steps;
}

/** Hop-0 entity steps for this match batch's new hits. */
export function hitSteps(
  hits: readonly MatchDecision[],
  expanded: Set<string>,
  maxItems = MAX_ITEMS,
): WdStep[] {
  const items: ItemSpec[] = [];
  for (const h of hits) {
    if (!h.qid) continue;
    const company = h.role === 'company';
    const expand = !expanded.has(h.qid);
    if (expand) expanded.add(h.qid);
    items.push({ qid: h.qid, brand: true, company, self: company, expand });
  }
  const steps: WdStep[] = [];
  for (let i = 0; i < items.length; i += maxItems) {
    steps.push({ kind: 'entities', hop: 0, items: items.slice(i, i + maxItems), children: [] });
  }
  return steps;
}

export function parseEnvelope(body: string): Envelope {
  const env = JSON.parse(body) as Envelope;
  if (env?.kind !== 'match' && env?.kind !== 'entities') {
    throw new Error('Not a Wikidata envelope.');
  }
  return env;
}
