/**
 * Which paths belong to the product and which belong to the marketing site.
 *
 * Two surfaces decide from this, and they used to decide separately.
 * `apps/web/proxy.ts` builds its route matchers from these prefixes, and the
 * desktop shell decides from the same list which navigations stay inside its
 * window and which open in the browser. A prefix present in one place and
 * missing from the other is the defect this file exists to prevent: a route the
 * proxy gates but the shell hands to the browser, or a marketing page the shell
 * renders as if it were the app.
 *
 * `AUTH_ROUTE_PREFIXES` is separate because those routes are neither. They are
 * not the product, but a shell that opened them externally would push the user
 * into a browser halfway through signing in.
 */

const SLASH_CODE = 47;

export const PRODUCT_ROUTE_PREFIXES = [
  '/chat',
  '/code',
  '/library',
  '/models',
  '/open',
  '/schedules',
  '/tasks',
  '/settings',
  '/billing',
  '/upgrade',
  '/admin',
  '/workspace',
  '/operator',
  '/welcome',
] as const;

export const AUTH_ROUTE_PREFIXES = [
  '/__clerk',
  '/auth',
  '/device-auth',
  '/forgot-password',
  '/login',
  '/pair',
  '/register',
  '/session-expired',
  '/sign-in',
  '/sign-up',
  '/signup',
  '/verify',
] as const;

/**
 * The auth routes the web proxy hands an identity session to, a subset of the
 * set above. The rest render without one: they either have no session to read
 * yet or are recovering from losing it.
 */
export const SESSION_AUTH_ROUTE_PREFIXES = ['/__clerk', '/login', '/signup'] as const;

export type ProductRoutePrefix = (typeof PRODUCT_ROUTE_PREFIXES)[number];
export type AuthRoutePrefix = (typeof AUTH_ROUTE_PREFIXES)[number];

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === SLASH_CODE) end -= 1;
  return value.slice(0, end);
}

function normalizePath(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/u)[0] ?? '';
  const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return withLeadingSlash.length > 1 ? trimTrailingSlashes(withLeadingSlash) : withLeadingSlash;
}

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  const path = normalizePath(pathname);
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function isProductPath(pathname: string): boolean {
  return matchesPrefix(pathname, PRODUCT_ROUTE_PREFIXES);
}

export function isAuthPath(pathname: string): boolean {
  return matchesPrefix(pathname, AUTH_ROUTE_PREFIXES);
}

/**
 * The same prefixes in the pattern dialect `createRouteMatcher` speaks, where
 * `(.*)` is a suffix wildcard rather than a segment boundary. The predicates
 * above are stricter by a segment boundary; no route in the app falls between
 * the two, and `apps/web/__tests__/product-routes-cover-the-app.test.ts` is what
 * keeps that true as routes are added.
 */
export function routeMatcherPatterns(prefixes: readonly string[]): string[] {
  return prefixes.map((prefix) => `${prefix}(.*)`);
}
