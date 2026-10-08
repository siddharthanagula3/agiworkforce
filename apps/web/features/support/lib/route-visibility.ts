export const SUPPORT_WIDGET_ROUTE_PREFIXES: readonly string[] = ['/help', '/support'];

export function isSupportWidgetVisible(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return SUPPORT_WIDGET_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
