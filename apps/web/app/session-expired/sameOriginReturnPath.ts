import { getSafeRedirectUrl } from '@/lib/safe-redirect';
import { SITE_URL } from '@/lib/seo/site';
import { SESSION_EXPIRED_PATH } from '@/lib/server/session-expired';

const REFUSED = '';
const API_PATH = '/api';
const PATH_ORIGIN = 'http://same-origin.invalid';

function isUnder(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function sameOriginReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  const path = getSafeRedirectUrl(value, SITE_URL, REFUSED);
  if (path === REFUSED) return null;
  const { pathname } = new URL(path, PATH_ORIGIN);
  if (isUnder(pathname, API_PATH) || isUnder(pathname, SESSION_EXPIRED_PATH)) return null;
  return path;
}
