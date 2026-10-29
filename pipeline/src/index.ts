// Node jobs run by GitHub Actions: scrapers, imports, matching, AI batches (D-003).
import { APP_NAME } from '@sarvis/core';

/** Keep in step with pipeline/package.json (a test checks). Sent in the User-Agent and run rows. */
export const PIPELINE_VERSION = '0.0.0';

export function userAgent(version: string = PIPELINE_VERSION): string {
  return `${APP_NAME}/${version} (+https://github.com/LukaMS/sarvis)`;
}
