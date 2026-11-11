// The derived jobs `pipeline job <name>` can run (P4.7). Each factory builds its job against the
// dev database.
import type { ServiceClient } from '../db/client.ts';
import { ConfigurationError } from '../errors.ts';
import {
  CATEGORIZE_TAGS_JOB_NAME,
  createCategorizeTagsJob,
  supabaseCategorizeTagsDeps,
} from './categorize-tags.ts';
import { FIXTURE_JOB_NAME, createFixtureJob, supabaseFixtureTable } from './fixture.ts';
import type { Job } from './job.ts';

export type { Job, JobContext, JobWork } from './job.ts';

// Generic in each job's own item and change types; the runner only sees `Job`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const JOBS: Record<string, (db: ServiceClient) => Job<any, any>> = {
  [CATEGORIZE_TAGS_JOB_NAME]: (db) => createCategorizeTagsJob(supabaseCategorizeTagsDeps(db)),
  [FIXTURE_JOB_NAME]: (db) => createFixtureJob(supabaseFixtureTable(db)),
};

export function listJobNames(): string[] {
  return Object.keys(JOBS).sort();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createJob(name: string, db: ServiceClient): Job<any, any> {
  const factory = JOBS[name];
  if (!factory) {
    throw new ConfigurationError(`Unknown job: ${name}. Jobs: ${listJobNames().join(', ')}.`);
  }
  return factory(db);
}
