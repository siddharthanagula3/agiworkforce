import {
  EMBEDDED_PAGE_PARAM,
  EMBEDDED_PAGE_PARAM_VALUE,
  isEmbeddableAccountPagePath,
} from '@agiworkforce/types';
import { API_URL } from '@/lib/constants';
import { openExternalUrl, openInAppBrowser } from '@/lib/safeOpenURL';

export function webContentPageUrl(pathOrUrl: string): string {
  const url = new URL(pathOrUrl, API_URL);
  url.searchParams.set(EMBEDDED_PAGE_PARAM, EMBEDDED_PAGE_PARAM_VALUE);
  return url.toString();
}

export function openWebContentPage(pathOrUrl: string): Promise<boolean> {
  return openInAppBrowser(webContentPageUrl(pathOrUrl));
}

export function webAccountPageUrl(pathOrUrl: string): string | null {
  const url = new URL(pathOrUrl, API_URL);
  return isEmbeddableAccountPagePath(url.pathname) ? webContentPageUrl(url.toString()) : null;
}

export async function openWebAccountPage(
  pathOrUrl: string,
  browser: 'in-app' | 'system' = 'in-app',
): Promise<boolean> {
  const url = webAccountPageUrl(pathOrUrl);
  if (url === null) return false;
  return browser === 'system' ? openExternalUrl(url) : openInAppBrowser(url);
}
