// Node jobs run by GitHub Actions: scrapers, imports, matching, AI batches (D-003).
import { APP_NAME } from '@sarvis/core';

/** Keep in step with pipeline/package.json (a test checks). Sent in the User-Agent and run rows. */
export const PIPELINE_VERSION = '0.0.0';

/**
 * `Sarvis/<version> (+<repo>)`, or `Sarvis/<version> (+<repo>; <email>)` for a source whose terms
 * ask for a contact email (D-015). The second form also fits OFF's `AppName/Version (ContactEmail)`.
 * `withRepo = false` gives `Sarvis/<version> (<email>)`: SEC EDGAR refuses any User-Agent that
 * carries a URL (measured in P3.16, D-074).
 */
export function userAgent(
  version: string = PIPELINE_VERSION,
  contactEmail: string | null = null,
  withRepo = true,
): string {
  if (!withRepo && contactEmail) return `${APP_NAME}/${version} (${contactEmail})`;
  const contact = contactEmail ? `; ${contactEmail}` : '';
  return `${APP_NAME}/${version} (+https://github.com/LukaMS/sarvis${contact})`;
}
