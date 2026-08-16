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
