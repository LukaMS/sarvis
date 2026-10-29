// Smoke check for the pipeline runtime: connects to the dev project with the service role and prints
// the number of `sources` rows. Prints the count only, never a row or a key.
//
//   npm run smoke:db --workspace @sarvis/pipeline
import { DatabaseError } from '../errors.ts';
import { logger } from '../log.ts';
import { getServiceClient } from './client.ts';

async function main() {
  const { count, error } = await getServiceClient()
    .from('sources')
    .select('*', { count: 'exact', head: true });
  if (error) throw new DatabaseError(`Counting sources failed: ${error.message}`, error);
  logger.info('db smoke ok', { table: 'sources', count });
}

main().catch((err: unknown) => {
  logger.error('db smoke failed', { err });
  process.exitCode = 1;
});
