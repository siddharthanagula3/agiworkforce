export const OUR_CLOUD_HOSTS: readonly string[] = [
  'agiworkforce.com', // web app + www/api/gateway/signaling subdomains
  'vercel.app', // Vercel-hosted web + LLM endpoints
  'neon.tech', // managed Postgres (Neon)
  'clerk.com',
  'clerk.accounts.dev',
  'clerk.dev',
  'clerk.services',
];

function normalizeHost(host: string | null | undefined): string {
  if (!host) return '';
  return host.toLowerCase().replace(/\.$/, '');
}

export function matchesCloudHost(
  host: string | null | undefined,
  hosts: readonly string[],
): boolean {
  const normalized = normalizeHost(host);
  if (normalized.length === 0) return false;
  return hosts.some((denied) => normalized === denied || normalized.endsWith(`.${denied}`));
}

/**
 * Returns true when `host` is one of OUR managed-cloud hosts (the shared
 * {@link OUR_CLOUD_HOSTS} floor). Boundary-safe suffix match, case-insensitive,
 * trailing-dot-tolerant. Nullish/empty/malformed hosts are NOT-ours (the guard's
 * fail-closed behaviour lives in the surface's mode check, not here).
 */
export function isOurCloudHost(host: string | null | undefined): boolean {
  return matchesCloudHost(host, OUR_CLOUD_HOSTS);
}
