/**
 * Platform-operator identity, deliberately separate from the organisation
 * `admin`/`owner` role in Clerk `publicMetadata`. That role is org-scoped and
 * self-service: a customer who owns their own org holds it. Platform-wide
 * surfaces — every account's security telemetry, cross-tenant erasure, the
 * trust-and-safety queue, takedown of anyone's shared content — must never be
 * gated on it, or any customer admin can act on every other tenant.
 *
 * Membership comes only from `AGI_PLATFORM_ADMIN_USER_IDS`, a deploy-time
 * comma-separated allowlist of Clerk user ids. An unset or empty list denies
 * everyone: no accidental open door in an environment that forgot to set it.
 */

export const PLATFORM_ADMIN_ENV_VAR = 'AGI_PLATFORM_ADMIN_USER_IDS';

export function parsePlatformAdminIds(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export function isPlatformAdmin(
  userId: string | null | undefined,
  raw: string | undefined | null,
): boolean {
  if (!userId) return false;
  const allowed = parsePlatformAdminIds(raw);
  if (allowed.length === 0) return false;
  return allowed.includes(userId);
}
