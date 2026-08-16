
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

function matches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname === `${prefix}`,
  );
}

export function isSupportWidgetVisible(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return !matches(pathname, SUPPORT_WIDGET_BLOCKLIST);
}

export function resolveSupportSurface(pathname: string | null | undefined): 'app' | 'marketing' {
  if (!pathname) return 'marketing';
  return matches(pathname, SUPPORT_APP_ROUTE_PREFIXES) ? 'app' : 'marketing';
}
