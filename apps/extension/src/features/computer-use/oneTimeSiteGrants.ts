import { normalizeApprovedSiteOrigin } from '../options/site-allowlist';

export const ONE_TIME_SITE_GRANT_MAX_MS = 30 * 60_000;
const GRANT_ID_PATTERN = /^site_once_[A-Za-z0-9_-]{8,128}$/;

export interface OneTimeSiteGrant {
  grantId: string;
  origin: string;
  hostPermissionAdded: boolean;
  expiresAtMs: number;
}

const grants = new Map<string, OneTimeSiteGrant>();

export function isOneTimeSiteGrantId(value: unknown): value is string {
  return typeof value === 'string' && GRANT_ID_PATTERN.test(value);
}

export function addOneTimeSiteGrant(
  grantId: string,
  origin: string,
  hostPermissionAdded: boolean,
  nowMs = Date.now(),
): OneTimeSiteGrant | null {
  const normalized = normalizeApprovedSiteOrigin(origin);
  if (!normalized || !isOneTimeSiteGrantId(grantId) || grants.has(grantId)) return null;
  const grant = {
    grantId,
    origin: normalized,
    hostPermissionAdded,
    expiresAtMs: nowMs + ONE_TIME_SITE_GRANT_MAX_MS,
  };
  grants.set(grantId, grant);
  return grant;
}

export function removeOneTimeSiteGrant(grantId: string): OneTimeSiteGrant | null {
  const grant = grants.get(grantId) ?? null;
  grants.delete(grantId);
  return grant;
}

export function oneTimeGrantedOrigins(nowMs = Date.now()): string[] {
  return [
    ...new Set(
      [...grants.values()]
        .filter((grant) => grant.expiresAtMs > nowMs)
        .map((grant) => grant.origin),
    ),
  ];
}

export function hasOneTimeSiteGrant(origin: string, nowMs = Date.now()): boolean {
  const normalized = normalizeApprovedSiteOrigin(origin);
  return normalized !== null && oneTimeGrantedOrigins(nowMs).includes(normalized);
}

export function expiredOneTimeSiteGrants(nowMs = Date.now()): OneTimeSiteGrant[] {
  return [...grants.values()].filter((grant) => grant.expiresAtMs <= nowMs);
}
