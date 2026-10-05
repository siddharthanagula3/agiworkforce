export const SUPPORT_WIDGET_BLOCKLIST: readonly string[] = [
  '/login',
  '/signup',
  '/sign-in',
  '/sign-up',
  '/register',
  '/verify',
  '/auth',
  '/connect',
  '/device-auth',
  '/share',
  '/shared',
  '/status',
  '/support',
  '/artifact-sandbox',
];

export const SUPPORT_APP_ROUTE_PREFIXES: readonly string[] = [
  '/chat',
  '/chats',
  '/library',
  '/projects',
  '/artifacts',
  '/settings',
  '/billing',
  '/usage',
  '/admin',
  '/schedules',
  '/tasks',
  '/connectors',
  '/skills',
  '/dashboard',
  '/code',
];

export const SUPPORT_COMPOSER_ROUTE_PREFIXES: readonly string[] = ['/chat', '/code'];

export const SUPPORT_PUBLIC_ROUTE_PREFIXES: readonly string[] = ['/help'];

function matches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname === `${prefix}`,
  );
}

export function isSupportWidgetVisible(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (matches(pathname, SUPPORT_WIDGET_BLOCKLIST)) return false;
  if (matches(pathname, SUPPORT_APP_ROUTE_PREFIXES)) return true;
  return matches(pathname, SUPPORT_PUBLIC_ROUTE_PREFIXES);
}

export function resolveSupportSurface(pathname: string | null | undefined): 'app' | 'marketing' {
  if (!pathname) return 'marketing';
  return matches(pathname, SUPPORT_APP_ROUTE_PREFIXES) ? 'app' : 'marketing';
}

export function isSupportComposerRoute(pathname: string | null | undefined): boolean {
  return Boolean(pathname) && matches(pathname ?? '', SUPPORT_COMPOSER_ROUTE_PREFIXES);
}
