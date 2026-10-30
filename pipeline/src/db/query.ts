// Chunked reads and writes for the writers (from legacy catalogue-repository.ts): `.in()` reads in
// chunks of 300, paged past PostgREST's row cap, and inserts in chunks of 500. The typed client
// can't take a table name chosen at run time, so these helpers see a loosely typed table; the
// writers build their payloads with the generated TablesInsert types.
import type { Database } from '@sarvis/core';

import { DatabaseError } from '../errors.ts';
import type { ServiceClient } from './client.ts';

export const READ_CHUNK = 300;
export const WRITE_CHUNK = 500;
/** PostgREST's default max-rows. A read that fills a page asks for the next one. */
export const PAGE_SIZE = 1000;
/** Parallel single-row updates. Updates are rare once a source has been imported. */
export const UPDATE_CONCURRENCY = 8;

export type TableName = keyof Database['public']['Tables'];
export type AnyRow = Record<string, unknown>;

interface PgError {
  message: string;
  code?: string;
}
type Result = { data: AnyRow[] | null; error: PgError | null };

export interface LooseQuery extends PromiseLike<Result> {
  select(columns: string): LooseQuery;
  eq(column: string, value: unknown): LooseQuery;
  in(column: string, values: readonly unknown[]): LooseQuery;
  is(column: string, value: null): LooseQuery;
  order(column: string, options?: { ascending?: boolean }): LooseQuery;
  range(from: number, to: number): LooseQuery;
}
interface LooseTable {
  select(columns: string): LooseQuery;
  insert(rows: AnyRow[]): LooseQuery;
  update(patch: AnyRow): LooseQuery;
  upsert(rows: AnyRow[], options: { onConflict: string; ignoreDuplicates?: boolean }): LooseQuery;
}

export function from(db: ServiceClient, table: TableName): LooseTable {
  return db.from(table) as unknown as LooseTable;
}

export function* chunked<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

export function fail(what: string, error: PgError): never {
  throw new DatabaseError(`${what} failed: ${error.message}`, error);
}

/**
 * An error caused by one row's data: an integrity violation (class 23: unique, foreign key, check,
 * not null) or a data exception (class 22: a NUL in text, a value out of range).
 */
export function isRowError(error: PgError): boolean {
  return typeof error.code === 'string' && /^2[23]/.test(error.code);
}

/**
 * Every row of `table` whose `column` is in `values`, read in chunks and pages. `filter` narrows
 * each query (e.g. to one source). Rows come back in id order.
 */
export async function selectIn(
  db: ServiceClient,
  table: TableName,
  columns: string,
  column: string,
  values: readonly unknown[],
  filter: (q: LooseQuery) => LooseQuery = (q) => q,
): Promise<AnyRow[]> {
  const unique = [...new Set(values.filter((v) => v !== null && v !== undefined))];
  const out: AnyRow[] = [];
  for (const chunk of chunked(unique, READ_CHUNK)) {
    for (let page = 0; ; page++) {
      const { data, error } = await filter(from(db, table).select(columns).in(column, chunk))
        .order('id')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) fail(`Reading ${table}`, error);
      const rows = data ?? [];
      out.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }
  }
  return out;
}

/** A row that couldn't be written, with the database's reason. */
export interface RowError<T> {
  row: T;
  message: string;
}

/**
 * Inserts in chunks and returns the inserted rows (`returning` columns) in input order. When a
 * row's data breaks a chunk (isRowError), its rows are retried one by one so one bad row doesn't sink 499
 * good ones; those failures come back in `errors`. Any other error throws.
 */
export async function insertChunked<T extends AnyRow>(
  db: ServiceClient,
  table: TableName,
  rows: readonly T[],
  returning: string,
): Promise<{ inserted: { row: T; stored: AnyRow }[]; errors: RowError<T>[] }> {
  const inserted: { row: T; stored: AnyRow }[] = [];
  const errors: RowError<T>[] = [];
  for (const chunk of chunked(rows, WRITE_CHUNK)) {
    const { data, error } = await from(db, table).insert(chunk).select(returning);
    if (!error) {
      (data ?? []).forEach((stored, i) => inserted.push({ row: chunk[i] as T, stored }));
      continue;
    }
    if (!isRowError(error)) fail(`Inserting into ${table}`, error);
    for (const row of chunk) {
      const one = await from(db, table).insert([row]).select(returning);
      if (one.error) {
        if (!isRowError(one.error)) fail(`Inserting into ${table}`, one.error);
        errors.push({ row, message: one.error.message });
      } else if (one.data?.[0]) inserted.push({ row, stored: one.data[0] });
    }
  }
  return { inserted, errors };
}

/** Single-row updates by id, a few at a time. Row errors (isRowError) come back in `errors`. */
export async function updateById<T extends { id: string | number; patch: AnyRow }>(
  db: ServiceClient,
  table: TableName,
  updates: readonly T[],
): Promise<RowError<T>[]> {
  const errors: RowError<T>[] = [];
  for (const group of chunked(updates, UPDATE_CONCURRENCY)) {
    const results = await Promise.all(
      group.map((u) => from(db, table).update(u.patch).eq('id', u.id)),
    );
    results.forEach(({ error }, i) => {
      if (!error) return;
      if (!isRowError(error)) fail(`Updating ${table}`, error);
      errors.push({ row: group[i] as T, message: error.message });
    });
  }
  return errors;
}

/** Sets the same patch on many rows (e.g. a seen-at bump), chunked by id. */
export async function updateMany(
  db: ServiceClient,
  table: TableName,
  ids: readonly (string | number)[],
  patch: AnyRow,
): Promise<void> {
  for (const chunk of chunked(ids, READ_CHUNK)) {
    const { error } = await from(db, table).update(patch).in('id', chunk);
    if (error) fail(`Updating ${table}`, error);
  }
}
