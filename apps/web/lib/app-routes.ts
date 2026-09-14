export const APP_ROUTE_PREFIXES = [
  '/chat',
  '/code',
  '/library',
  '/models',
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

export function isAppRoutePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return APP_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
