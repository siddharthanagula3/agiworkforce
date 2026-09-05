export const APP_URL_ENV = 'NEXT_PUBLIC_APP_URL';

/**
 * This deployment's own origin, used as the authorized party when no explicit
 * allowlist is configured. A single-origin deployment should not have to
 * restate its own address to be allowed to verify its own tokens.
 */
export function resolveDeploymentOrigin(appUrl?: string): string | null {
  const configured =
    appUrl ??
    (typeof process === 'undefined' || !process.env ? undefined : process.env[APP_URL_ENV]);
  const trimmed = configured?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}
