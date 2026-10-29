// Price observations (DATA_MODEL §3.4): append on change. A reading that equals the one in effect
// on its date, for the same source, store, product (or listing) and price kind, only moves that
// row's last_confirmed_on; any other reading is a new row. A reading with a source id that was
// already stored is compared with that row instead.
import type { TablesInsert } from '@sarvis/core';

import { type PriceFields, priceFieldsChanged, roundTo, sameValue } from '../change.ts';
import type { ServiceClient } from '../client.ts';
import { emptyWriteResult } from '../keyed.ts';
import {
  type AnyRow,
  type LooseQuery,
  insertChunked,
  selectIn,
  updateById,
  updateMany,
} from '../query.ts';
import {
  type DomainWriter,
  keyOf,
  loadSources,
  provOf,
  resolverFor,
  unknownRef,
} from './common.ts';

type PricePayload = TablesInsert<'price_observations'> & PriceFields & { observed_on: string };

const PRICE_COLUMNS =
  'id, external_id, store_id, product_id, listing_id, observed_on, last_confirmed_on, price, currency, ' +
  'price_kind, is_discounted, price_without_discount, price_per, unit_price, unit_basis, source_id';

/** The series a reading belongs to. The product wins over the listing once it is known. */
export function seriesKey(r: AnyRow): string {
  const subject = r.product_id ? `p:${r.product_id as string}` : `l:${r.listing_id as string}`;
  return `${r.source_id as string}|${r.store_id as string}|${subject}|${r.price_kind as string}`;
}

/** The last date a row stands for: confirmed, else observed. */
const confirmedOf = (r: AnyRow) =>
  (r.last_confirmed_on as string | null) ?? (r.observed_on as string);

/** Columns compared when a reading's source id is already stored. */
const COMPARED = ['store_id', 'product_id', 'listing_id', 'observed_on', 'price_kind'] as const;

export function priceObservationWriter(db: ServiceClient): DomainWriter<'price_observation'> {
  return {
    async upsert(records, ctx) {
      const refs = resolverFor(db, ctx);
      await loadSources(refs, records);
      await refs.loadStores(records.map((r) => r.store));
      await refs.loadProducts(records.map((r) => r.product));
      await refs.loadListings(records.map((r) => r.listing));
      const result = emptyWriteResult();

      const payloads = records.flatMap((r): PricePayload[] => {
        const key = keyOf('price_observation', r);
        const prov = provOf(r, refs, ctx);
        const storeId = refs.store(r.store);
        const productId = refs.product(r.product) ?? null;
        const listingId = refs.listing(r.listing) ?? null;
        if (!prov || !storeId || (!productId && !listingId)) {
          const what = !prov ? `source ${r.source_key}` : !storeId ? 'store' : 'product or listing';
          result.rejected.push(unknownRef(key, what));
          return [];
        }
        return [
          {
            external_id: r.external_id ?? null,
            store_id: storeId,
            product_id: productId,
            listing_id: listingId,
            observed_on: r.observed_on,
            last_confirmed_on: r.last_confirmed_on ?? null,
            price: roundTo(r.price, 2) as number,
            currency: r.currency,
            price_kind: r.price_kind,
            is_discounted: r.is_discounted,
            price_without_discount: roundTo(r.price_without_discount, 2),
            price_per: r.price_per ?? null,
            unit_price: roundTo(r.unit_price, 5),
            unit_basis: r.unit_basis ?? null,
            ...prov,
          },
        ];
      });
      if (payloads.length === 0) return result;

      const sourceIds = [...new Set(payloads.map((p) => p.source_id))];
      const bySource = (q: LooseQuery) => q.in('source_id', sourceIds);
      const known = await selectIn(
        db,
        'price_observations',
        PRICE_COLUMNS,
        'external_id',
        payloads.map((p) => p.external_id),
        bySource,
      );
      const byExternal = new Map(
        known.map((r) => [`${r.source_id as string}:${r.external_id as string}`, r]),
      );
      const history = await selectIn(
        db,
        'price_observations',
        PRICE_COLUMNS,
        'store_id',
        payloads.map((p) => p.store_id),
        bySource,
      );
      const series = new Map<string, AnyRow[]>();
      for (const row of history) {
        const list = series.get(seriesKey(row)) ?? [];
        list.push(row);
        series.set(seriesKey(row), list);
      }

      const inserts: PricePayload[] = [];
      const updates: { id: number; patch: AnyRow; key: string }[] = [];
      const confirms = new Map<AnyRow, string>(); // stored row → new last_confirmed_on

      const ordered = [...payloads].sort((a, b) => a.observed_on.localeCompare(b.observed_on));
      for (const p of ordered) {
        const stored = p.external_id
          ? byExternal.get(`${p.source_id}:${p.external_id}`)
          : undefined;
        if (stored) {
          const differs =
            priceFieldsChanged(stored as unknown as PriceFields, p) ||
            COMPARED.some((c) => !sameValue(stored[c], p[c]));
          if (!differs) result.unchanged++;
          else updates.push({ id: stored.id as number, patch: { ...p }, key: p.external_id ?? '' });
          continue;
        }

        const list = series.get(seriesKey(p)) ?? [];
        series.set(seriesKey(p), list);
        // The reading in effect on this date: the latest observed on or before it.
        const before = list.filter((r) => (r.observed_on as string) <= p.observed_on);
        const day = before.reduce<string | null>(
          (max, r) =>
            max === null || (r.observed_on as string) > max ? (r.observed_on as string) : max,
          null,
        );
        const same = before.find(
          (r) => r.observed_on === day && !priceFieldsChanged(r as unknown as PriceFields, p),
        );
        if (same) {
          result.unchanged++;
          const confirmed = p.last_confirmed_on ?? p.observed_on;
          if (confirmed > confirmedOf(same)) {
            same.last_confirmed_on = confirmed;
            // A row inserted by this batch carries the date itself; a stored one is bumped.
            if (!inserts.includes(same as PricePayload)) confirms.set(same, confirmed);
          }
          continue;
        }
        inserts.push(p);
        list.push(p);
      }

      const inserted = await insertChunked(db, 'price_observations', inserts, 'id');
      result.inserted += inserted.inserted.length;
      for (const e of inserted.errors)
        result.rejected.push({ key: e.row.external_id ?? e.row.observed_on, message: e.message });

      const failed = await updateById(db, 'price_observations', updates);
      result.updated += updates.length - failed.length;
      for (const e of failed) result.rejected.push({ key: e.row.key, message: e.message });

      const byDate = new Map<string, number[]>();
      for (const [row, date] of confirms)
        byDate.set(date, [...(byDate.get(date) ?? []), row.id as number]);
      for (const [date, ids] of byDate)
        await updateMany(db, 'price_observations', ids, { last_confirmed_on: date });

      return result;
    },
  };
}
