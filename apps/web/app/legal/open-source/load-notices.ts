import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { ThirdPartyNotices } from './notices';

export const NOTICES_URL = '/legal/third-party-notices.json';
export const GENERATED_NOTICES_FILE = path.join('public', NOTICES_URL);

export function loadThirdPartyNotices(
  file = path.join(process.cwd(), GENERATED_NOTICES_FILE),
): ThirdPartyNotices | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as ThirdPartyNotices;
}
