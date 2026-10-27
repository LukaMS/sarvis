// Node jobs run by GitHub Actions: scrapers, imports, matching, AI batches (D-003).
import { APP_NAME } from '@sarvis/core';

export function userAgent(version: string): string {
  return `${APP_NAME}/${version} (+https://github.com/LukaMS/sarvis)`;
}
