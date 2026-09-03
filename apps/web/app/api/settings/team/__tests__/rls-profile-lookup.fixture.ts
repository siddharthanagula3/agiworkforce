export interface ProfileFixtureRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
}

const PROFILES_EMAIL_LOOKUP_RE =
  /from\s+public\.profiles[\s\S]*?lower\(email\)\s*=\s*lower\(\$1\)/i;

export function isProfilesEmailLookup(sql: string): boolean {
  return PROFILES_EMAIL_LOOKUP_RE.test(sql);
}

function findProfileByEmail(
  profiles: ProfileFixtureRow[],
  params: unknown[] | undefined,
): ProfileFixtureRow | null {
  const email = String((params ?? [])[0] ?? '').toLowerCase();
  return profiles.find((row) => row.email.toLowerCase() === email) ?? null;
}

export function rlsScopedProfileLookup(
  profiles: ProfileFixtureRow[],
  scopedUserId: string,
  sql: string,
  params?: unknown[],
): unknown[] | undefined {
  if (!isProfilesEmailLookup(sql)) return undefined;
  const match = findProfileByEmail(profiles, params);
  return match && match.id === scopedUserId ? [match] : [];
}

export function bypassProfileLookup(
  profiles: ProfileFixtureRow[],
  sql: string,
  params?: unknown[],
): unknown[] | undefined {
  if (!isProfilesEmailLookup(sql)) return undefined;
  const match = findProfileByEmail(profiles, params);
  return match ? [match] : [];
}
