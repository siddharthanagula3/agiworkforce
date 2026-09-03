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
