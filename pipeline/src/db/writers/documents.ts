// Documents (DATA_MODEL §3.6): cited or linked pages, keyed on `url_normalized`. Full text is
// never stored. A Wikipedia page's summary and revision id update in place when the page changes;
// an unchanged page isn't written.
import type { TablesInsert } from '@sarvis/core';

import type { ServiceClient } from '../client.ts';
import type { KeyedSpec } from '../keyed.ts';
import { selectIn } from '../query.ts';
import { type DomainWriter, loadSources, resolverFor, writeRecords } from './common.ts';

type DocumentPayload = TablesInsert<'documents'>;

const DOCUMENT_COLUMNS =
  'id, url, url_normalized, kind, title, publisher, domain, published_at, language, ' +
  'wikipedia_revision_id, summary, sec_accession, sec_filed_on, archive_url, source_id, ' +
  'source_url, method';

export const documentSpec: KeyedSpec<DocumentPayload> = {
  table: 'documents',
  columns: DOCUMENT_COLUMNS,
  load: (db, payloads) =>
    selectIn(
      db,
      'documents',
      DOCUMENT_COLUMNS,
      'url_normalized',
      payloads.map((p) => p.url_normalized),
    ),
  keys: (r) => [r.url_normalized as string],
  label: (p) => p.url_normalized,
  keep: ['url_normalized'],
};

export function documentWriter(db: ServiceClient): DomainWriter<'document'> {
  return {
    async upsert(records, ctx) {
      const refs = resolverFor(db, ctx);
      await loadSources(refs, records);
      return writeRecords({
        db,
        kind: 'document',
        spec: documentSpec,
        records,
        refs,
        ctx,
        build: ({ source_key: _s, ...fields }, prov) => ({ ...fields, ...prov }),
      });
    },
  };
}
