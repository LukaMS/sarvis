// The stored side of the bad-code duplicate rule (D-081) for delta runs (P4.30, D-086). A full run
// sees every kept row of the export, so it can drop a bad-check-digit row whose name and first
// brand another row has. A delta sees only the changed products, so it asks the catalog instead:
// which active products of the source carry the names of the held rows. The query is a
// case-insensitive pre-filter on the name; the caller confirms each match with duplicateKey.
import { type ServiceClient, getServiceClient } from '../../db/client.ts';
import { DatabaseError } from '../../errors.ts';
import { type OffRow, duplicateKey } from './csv.ts';

export interface StoredProduct {
  external_id: string;
  name: string;
  brand_text: string | null;
}

/** Active products of `sourceId` whose name matches one of `names`, ignoring case. */
export type FindStoredProducts = (sourceId: string, names: string[]) => Promise<StoredProduct[]>;

/** Names per request: keeps the URL short (names are at most a few hundred characters). */
const NAMES_PER_QUERY = 40;
const PAGE = 1000;

/**
 * A name as an exact `ilike` pattern, quoted as a Postgres array element: LIKE's `\ % _` are
 * escaped first, then the element's `\ "`. PostgREST reads `*` as `%`, which only widens the
 * pre-filter.
 */
export function ilikeElement(name: string): string {
  const pattern = name.replace(/[\\%_]/g, '\\$&');
  return `"${pattern.replace(/[\\"]/g, '\\$&')}"`;
}

export function supabaseStoredProducts(db?: ServiceClient): FindStoredProducts {
  return async (sourceId, names) => {
    const client = db ?? getServiceClient();
    const out: StoredProduct[] = [];
    const unique = [...new Set(names)];
    for (let i = 0; i < unique.length; i += NAMES_PER_QUERY) {
      const patterns = unique.slice(i, i + NAMES_PER_QUERY).map(ilikeElement);
      for (let page = 0; ; page++) {
        const { data, error } = await client
          .from('products')
          .select('external_id, name, brand_text')
          .eq('source_id', sourceId)
          .eq('status', 'active')
          .ilikeAnyOf('name', patterns)
          .order('external_id')
          .range(page * PAGE, (page + 1) * PAGE - 1);
        if (error) {
          throw new DatabaseError(`Reading stored OFF products failed: ${error.message}`, error);
        }
        out.push(...data);
        if (data.length < PAGE) break;
      }
    }
    return out;
  };
}

/**
 * The stored products a held bad-code row may duplicate, by duplicate key, with their codes.
 * Products whose code this run has already read are left out: the row the run read stands for
 * them now (a delta can rename a product, and a full run would see the new name).
 */
export async function storedDuplicateKeys(
  held: readonly OffRow[],
  sourceId: string,
  readCodes: ReadonlySet<string>,
  find: FindStoredProducts,
): Promise<Map<string, Set<string>>> {
  const byKey = new Map<string, Set<string>>();
  const names = held.map((r) => r.product_name.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (names.length === 0) return byKey;
  for (const p of await find(sourceId, names)) {
    if (readCodes.has(p.external_id)) continue;
    const key = duplicateKey({ product_name: p.name, brands: p.brand_text ?? '' });
    let codes = byKey.get(key);
    if (!codes) byKey.set(key, (codes = new Set()));
    codes.add(p.external_id);
  }
  return byKey;
}
