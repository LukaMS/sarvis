// The stored side of the bad-code duplicate rule (D-081) for delta runs (P4.30, D-086). A full run
// sees every kept row of the export, so it can drop a bad-check-digit row whose name and first
// brand another row has. A delta sees only the changed products, so it asks the catalog instead:
// which active products of the source carry the names of the held rows. The RPC
// `active_products_named` compares names through `normalize_match_text` (no accents, case or extra
// spaces, P4.31); the caller confirms each match, first brand included, with duplicateKey.
import { type ServiceClient, getServiceClient } from '../../db/client.ts';
import { DatabaseError } from '../../errors.ts';
import { type OffRow, duplicateKey } from './csv.ts';

export interface StoredProduct {
  external_id: string;
  name: string;
  brand_text: string | null;
}

/** Active products of `sourceId` whose normalized name matches that of one of `names`. */
export type FindStoredProducts = (sourceId: string, names: string[]) => Promise<StoredProduct[]>;

/** Names per RPC call. The body is POSTed, so this only bounds one statement's work. */
export const NAMES_PER_CALL = 100;
/** Rows per page: PostgREST caps a response at 1,000 rows. */
const PAGE = 1000;

/** The part of the service client the lookup uses, so tests can pass a fake. */
export type StoredProductsClient = Pick<ServiceClient, 'rpc'>;

export function supabaseStoredProducts(db?: StoredProductsClient): FindStoredProducts {
  return async (sourceId, names) => {
    const client = db ?? getServiceClient();
    const out: StoredProduct[] = [];
    const unique = [...new Set(names)];
    for (let i = 0; i < unique.length; i += NAMES_PER_CALL) {
      const batch = unique.slice(i, i + NAMES_PER_CALL);
      // The function orders by external_id, so pages are stable.
      for (let page = 0; ; page++) {
        const { data, error } = await client
          .rpc('active_products_named', { source_id: sourceId, names: batch })
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
