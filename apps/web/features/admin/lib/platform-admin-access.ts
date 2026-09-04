/**
 * Who may see the operator dashboard.
 *
 * This is deliberately NOT {@link hasAdminConsoleAccess}. That check passes for
 * any Clerk user whose `publicMetadata.role` is `owner` or `admin`, which is an
 * ORGANISATION role: a customer who owns their own org holds it. The enterprise
 * console is scoped to their org, so that is correct there.
 *
 * The operator dashboard is not scoped to an org. It reads every account, every
 * feedback row, and can reset another user's usage. Gating that on an org role
 * would hand the platform's own books to any customer admin, so it needs an
 * allowlist of platform operators and nothing weaker.
 *
 * The allowlist lives in AGI_PLATFORM_ADMIN_USER_IDS as a comma-separated list
 * of Clerk user ids. Ids, not emails: an email can be changed on the identity
 * provider by whoever controls the mailbox, and a verified-email check would
 * make the gate only as strong as that. An unset variable denies everyone,
 * which is the safe direction for a surface that can mutate billing state.
 */

export const PLATFORM_ADMIN_ENV_VAR = 'AGI_PLATFORM_ADMIN_USER_IDS';

export function parsePlatformAdminIds(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
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
