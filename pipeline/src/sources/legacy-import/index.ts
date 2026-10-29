// The legacy-import source (PLAN P2.18): the P0.2 export in docs/legacy/data/*.json, re-imported
// as `pending` facts with `legacy-import` provenance (DATA_MODEL §8). The files are local, so
// there's no HTTP; each file is still one step and one stored raw object, and parse works from
// the stored file. Rows link by legacy uuid, so the source reads companies and brands once to
// resolve those links (the files are fixed: README.md records their hashes).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { SourceResponseError } from '../../errors.ts';
import type { FetchResult, ParseResult, RawPayload, Source } from '../source.ts';
import {
  LEGACY_EXPORTED_AT,
  LEGACY_FILES,
  LEGACY_JOB,
  LEGACY_KEY,
  LEGACY_VERSION,
  type LegacyFile,
  type LegacyIndex,
  type Row,
  buildIndex,
  mapLegacyFile,
} from './map.ts';

export { LEGACY_KEY } from './map.ts';

/** The export folder in the repo. */
export const LEGACY_DATA_DIR = fileURLToPath(
  new URL('../../../../docs/legacy/data/', import.meta.url),
);
/** The `request_url` of a stored file: its repo path, which is how parse tells the files apart. */
const REQUEST_PREFIX = 'docs/legacy/data/';

export interface LegacyStep {
  file: LegacyFile;
}

function readRows(body: string, file: string): Row[] {
  const rows: unknown = JSON.parse(body);
  if (!Array.isArray(rows)) throw new SourceResponseError(200, `${file} is not a JSON array.`);
  return rows as Row[];
}

export interface LegacyImportOptions {
  /** Defaults to docs/legacy/data. */
  dataDir?: string;
}

export function createLegacyImportSource(
  options: LegacyImportOptions = {},
): Source<'company', LegacyStep> {
  const dir = options.dataDir ?? LEGACY_DATA_DIR;
  const read = (file: string) => readFileSync(`${dir}/${file}`, 'utf8');
  let index: LegacyIndex | null = null;
  const indexOf = () =>
    (index ??= buildIndex(
      readRows(read('companies.json'), 'companies.json'),
      readRows(read('brands.json'), 'brands.json'),
    ));

  return {
    key: LEGACY_KEY,
    job: LEGACY_JOB,
    version: LEGACY_VERSION,
    // Each file names its own batches; the first one is companies.
    recordKind: 'company',
    capabilities: {
      supportsDelta: false,
      // Facts dropped from the export aren't evidence of anything, so nothing is deactivated.
      supportsDeactivation: false,
      storeSpecificPricing: false,
    },
    politenessDelayMs: 0,

    plan() {
      indexOf();
      return LEGACY_FILES.map((file) => ({ file }));
    },

    async fetch(step): Promise<FetchResult<LegacyStep>> {
      return {
        response: {
          body: read(step.file),
          fetchedAt: LEGACY_EXPORTED_AT,
          url: REQUEST_PREFIX + step.file,
          status: null,
          contentType: 'application/json',
        },
      };
    },

    parse(raw: RawPayload): ParseResult {
      const file = raw.requestUrl?.startsWith(REQUEST_PREFIX)
        ? raw.requestUrl.slice(REQUEST_PREFIX.length)
        : '';
      if (!(LEGACY_FILES as readonly string[]).includes(file)) {
        throw new SourceResponseError(200, `Not a legacy export file: ${raw.requestUrl}`);
      }
      const batches = mapLegacyFile(file as LegacyFile, readRows(raw.body, file), indexOf());
      return {
        records: [],
        batches,
        expectedTotal: null,
      };
    },
  };
}
