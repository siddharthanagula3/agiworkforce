export function normalizeApprovedSiteOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;

  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export interface SiteTabCandidate {
  url?: string;
  active?: boolean;
  lastAccessed?: number;
}

export function selectApprovedSiteOrigin(tabs: ReadonlyArray<SiteTabCandidate>): string | null {
  const candidates = tabs
    .map((tab) => ({ tab, origin: normalizeApprovedSiteOrigin(tab.url) }))
    .filter(
      (candidate): candidate is { tab: SiteTabCandidate; origin: string } =>
        candidate.origin !== null,
    );
  const selected =
    candidates.find(({ tab }) => tab.active) ??
    [...candidates].sort((a, b) => (b.tab.lastAccessed ?? 0) - (a.tab.lastAccessed ?? 0))[0];
  return selected?.origin ?? null;
}

export function sanitizeApprovedSiteOrigins(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.map(normalizeApprovedSiteOrigin).filter((origin): origin is string => origin !== null),
    ),
  ];
}

export interface SiteReadPermissions {
  contains(permissions: chrome.permissions.Permissions): Promise<boolean>;
  request(permissions: chrome.permissions.Permissions): Promise<boolean>;
  remove(permissions: chrome.permissions.Permissions): Promise<boolean>;
}

function chromeSitePermissions(): SiteReadPermissions {
  return {
    contains: (permissions) => chrome.permissions.contains(permissions),
    request: (permissions) => chrome.permissions.request(permissions),
    remove: (permissions) => chrome.permissions.remove(permissions),
  };
}

export function approvedSiteHostPattern(origin: string): string | null {
  const normalized = normalizeApprovedSiteOrigin(origin);
  return normalized === null ? null : `${normalized}/*`;
}

/**
 * Whether Chrome has actually granted this extension read access to `origin`,
 * as opposed to the origin merely appearing in `agi_site_allowlist`. Page
 * context capture calls `chrome.scripting.executeScript`, which Chrome refuses
 * regardless of what the extension's own storage says.
 */
export async function hasApprovedSiteHostPermission(
  origin: string,
  permissions: SiteReadPermissions = chromeSitePermissions(),
): Promise<boolean> {
  const pattern = approvedSiteHostPattern(origin);
  if (!pattern) return false;
  try {
    return await permissions.contains({ origins: [pattern] });
  } catch {
    return false;
  }
}

/**
 * Asks Chrome for host access to `origin`. Must be called from a foreground
 * extension page inside a user gesture, and must be the first await in that
 * handler, an earlier await spends the gesture and Chrome refuses.
 */
export async function requestApprovedSiteHostPermission(
  origin: string,
  permissions: SiteReadPermissions = chromeSitePermissions(),
): Promise<boolean> {
  const pattern = approvedSiteHostPattern(origin);
  if (!pattern) return false;
  try {
    return await permissions.request({ origins: [pattern] });
  } catch {
    return false;
  }
}

export async function removeApprovedSiteHostPermission(
  origin: string,
  permissions: SiteReadPermissions = chromeSitePermissions(),
): Promise<void> {
  const pattern = approvedSiteHostPattern(origin);
  if (!pattern) return;
  try {
    await permissions.remove({ origins: [pattern] });
  } catch {
    // A pattern covered by a required host permission cannot be removed; the
    // allowlist entry is still removed regardless.
  }
}
