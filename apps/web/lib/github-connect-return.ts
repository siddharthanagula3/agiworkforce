import { CLOUD_CODE_PAGE_ROUTE } from '@agiworkforce/types';

const CONNECTORS_PATH = '/connectors';

const ALLOWED_RETURN_PATHS = new Set<string>([CLOUD_CODE_PAGE_ROUTE, CONNECTORS_PATH]);

export const GITHUB_CONNECT_RETURN_COOKIE = 'github_connect_return';

/**
 * Only the two pages that start this flow may receive the browser afterwards.
 * Anything else is dropped so the cookie cannot become an open redirect.
 */
export function githubConnectReturnPath(value: string | null | undefined): string | null {
  if (!value || !ALLOWED_RETURN_PATHS.has(value)) return null;
  return value;
}

export function githubConnectReturnLocation(path: string, status: string): string {
  return `${path}?github=${encodeURIComponent(status)}`;
}
