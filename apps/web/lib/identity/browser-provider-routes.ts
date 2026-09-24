import { isAuthPath, isProductPath } from '@agiworkforce/types/product-routes';

const IDENTITY_AWARE_PUBLIC_PREFIXES = [
  '/apps',
  '/connectors',
  '/gallery',
  '/invite',
  '/plugins',
  '/skills',
] as const;

function pathOnly(pathname: string): string {
  const value = pathname.split(/[?#]/u)[0] || '/';
  if (value.length <= 1) return '/';
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function needsBrowserIdentityProvider(pathname: string): boolean {
  if (isProductPath(pathname) || isAuthPath(pathname)) return true;
  const path = pathOnly(pathname);
  return IDENTITY_AWARE_PUBLIC_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
