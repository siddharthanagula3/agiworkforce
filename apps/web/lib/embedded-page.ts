import {
  EMBEDDABLE_ACCOUNT_PAGE_PATHS,
  EMBEDDED_PAGE_PARAM,
  EMBEDDED_PAGE_PARAM_VALUE,
  hasEmbeddedPageMarker,
  isAuthPath,
  isEmbeddableAccountPagePath,
  isEmbeddablePagePath,
  isEmbeddableRecoveryPagePath,
} from '@agiworkforce/types';
import { AUTH_LOGIN_PATH } from '@/features/auth/authRoutes';
import { CANONICAL_SITE_URL, SITE_URL } from '@/lib/seo/site';

const SITE_ORIGIN = new URL(SITE_URL).origin;
const SITE_ORIGINS: ReadonlySet<string> = new Set([
  SITE_ORIGIN,
  new URL(CANONICAL_SITE_URL).origin,
]);
const WEB_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);
const AUTH_RETURN_PARAMS = ['redirectTo', 'next'] as const;

type SearchParamsReader = Pick<URLSearchParams, 'get' | 'getAll' | 'toString'>;

function trimmedPath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/u, '') : pathname;
}

function siteUrl(href: string): URL | null {
  try {
    return new URL(href, SITE_ORIGIN);
  } catch {
    return null;
  }
}

function markedAccountPage(href: string): string | null {
  const url = siteUrl(href);
  if (!url || !SITE_ORIGINS.has(url.origin)) return null;
  if (!isEmbeddableAccountPagePath(url.pathname) || !hasEmbeddedPageMarker(url.searchParams)) {
    return null;
  }
  return `${trimmedPath(url.pathname)}${url.search}`;
}

function markedAccountReturn(search: SearchParamsReader | null | undefined): string | null {
  if (!search) return null;
  for (const param of AUTH_RETURN_PARAMS) {
    const value = search.get(param);
    if (value !== null) return markedAccountPage(value);
  }
  return null;
}

function searchString(search: SearchParamsReader | null | undefined): string {
  const query = search?.toString() ?? '';
  return query ? `?${query}` : '';
}

/**
 * The account page a marked view belongs to, or null when the view is not
 * marked. A marked view is a content page or account page carrying the
 * marker, or a sign-in page whose return address is a marked account page:
 * the phone app's in-app browser has no web session of its own, so the first
 * page an account link shows is a sign-in page.
 */
export function embeddedAccountReturnPath(
  pathname: string | null,
  search: SearchParamsReader | null | undefined,
): string | null {
  if (pathname === null) return null;
  if (isEmbeddableAccountPagePath(pathname)) {
    return markedAccountPage(`${pathname}${searchString(search)}`);
  }
  if (isAuthPath(pathname)) return markedAccountReturn(search);
  return null;
}

export function isEmbeddedPageView(
  pathname: string | null,
  search: SearchParamsReader | null | undefined,
): boolean {
  if (pathname === null) return false;
  if (isEmbeddablePagePath(pathname)) return hasEmbeddedPageMarker(search);
  if (isEmbeddableRecoveryPagePath(pathname) && hasEmbeddedPageMarker(search)) return true;
  return embeddedAccountReturnPath(pathname, search) !== null;
}

export function embeddedSignInPath(accountPage: string): string {
  return `${AUTH_LOGIN_PATH}?redirectTo=${encodeURIComponent(accountPage)}`;
}

export function embeddedRecoverySignInPath(): string {
  const accountPage = new URLSearchParams({ [EMBEDDED_PAGE_PARAM]: EMBEDDED_PAGE_PARAM_VALUE });
  return embeddedSignInPath(`${EMBEDDABLE_ACCOUNT_PAGE_PATHS[0]}?${accountPage.toString()}`);
}

export function embeddedPageHref(
  href: string,
  excludedPaths: ReadonlySet<string> = new Set(),
): string | null {
  if (href.startsWith('#')) return href;
  const url = siteUrl(href);
  if (!url) return null;
  if (!WEB_PROTOCOLS.has(url.protocol) || !SITE_ORIGINS.has(url.origin)) return href;
  const path = trimmedPath(url.pathname);
  if (excludedPaths.has(path)) return null;
  if (isEmbeddablePagePath(path) || isEmbeddableAccountPagePath(path)) {
    url.searchParams.set(EMBEDDED_PAGE_PARAM, EMBEDDED_PAGE_PARAM_VALUE);
    return `${url.pathname}${url.search}${url.hash}`;
  }
  if (isAuthPath(path) && markedAccountReturn(url.searchParams) !== null) {
    return `${url.pathname}${url.search}${url.hash}`;
  }
  return null;
}
