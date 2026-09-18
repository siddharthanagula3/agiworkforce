/**
 * A browser permission profile is not a browser session.
 *
 * A profile is the durable grant: these sites, these capabilities, until this
 * moment, held by one person in one workspace. A session is one live browser
 * that references a profile and dies with the window. Granting is therefore an
 * act a person performs once, and revoking is an act that ends every session
 * standing on the profile rather than the one in front of them.
 *
 * The scope pair (owner, workspace) is checked on every read. A profile that
 * belongs to another person or to another workspace is reported as absent, not
 * as denied: "you may not use profile X" already tells the caller X exists.
 */

import { SITE_POLICY_CAPABILITIES, type SitePolicyCapability } from './site-policy';
import type { BrowserSessionKind } from './browser-session';

export const BROWSER_PROFILE_CAPABILITIES = SITE_POLICY_CAPABILITIES;

export type BrowserProfileCapability = SitePolicyCapability;

/**
 * Personal use has no workspace. `null` is a scope of its own, never a wildcard
 * that matches every workspace.
 */
export type BrowserProfileScope = {
  readonly userId: string;
  readonly workspaceId: string | null;
};

export interface BrowserPermissionProfile extends BrowserProfileScope {
  readonly id: string;
  readonly label: string;
  readonly sites: readonly string[];
  readonly capabilities: readonly BrowserProfileCapability[];
  readonly createdAtMs: number;
  readonly expiresAtMs: number | null;
  readonly revokedAtMs: number | null;
}

/** A live browser that runs under a profile. */
export interface BrowserProfileSession {
  readonly sessionId: string;
  readonly profileId: string;
  readonly kind: BrowserSessionKind;
  readonly startedAtMs: number;
  readonly endedAtMs: number | null;
}

export const BROWSER_PROFILE_REFUSALS = [
  'no-such-profile',
  'profile-revoked',
  'profile-expired',
  'site-not-in-profile',
  'capability-not-in-profile',
] as const;

export type BrowserProfileRefusal = (typeof BROWSER_PROFILE_REFUSALS)[number];

export type BrowserProfileDecision =
  | { readonly allowed: true; readonly profile: BrowserPermissionProfile }
  | {
      readonly allowed: false;
      readonly refusal: BrowserProfileRefusal;
      readonly message: string;
    };

export function normalizeProfileSite(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isBrowserProfileCapability(value: unknown): value is BrowserProfileCapability {
  return (
    typeof value === 'string' && (BROWSER_PROFILE_CAPABILITIES as readonly string[]).includes(value)
  );
}

export function sameProfileScope(a: BrowserProfileScope, b: BrowserProfileScope): boolean {
  return a.userId === b.userId && a.workspaceId === b.workspaceId;
}

/**
 * The isolation rule. A workspace switch is a scope change, so a profile
 * granted in one workspace is invisible in the next even to the same person.
 */
export function profilesVisibleTo(
  profiles: readonly BrowserPermissionProfile[],
  viewer: BrowserProfileScope,
): readonly BrowserPermissionProfile[] {
  return profiles.filter((profile) => sameProfileScope(profile, viewer));
}

export function findVisibleProfile(
  profiles: readonly BrowserPermissionProfile[],
  profileId: string,
  viewer: BrowserProfileScope,
): BrowserPermissionProfile | undefined {
  return profiles.find((profile) => profile.id === profileId && sameProfileScope(profile, viewer));
}

export function profileIsLive(profile: BrowserPermissionProfile, nowMs: number): boolean {
  if (profile.revokedAtMs !== null) return false;
  return profile.expiresAtMs === null || profile.expiresAtMs > nowMs;
}

export interface BrowserProfileRequest {
  readonly url: string;
  readonly capability: BrowserProfileCapability;
  readonly nowMs: number;
}

const NO_SUCH_PROFILE =
  'No browser permission profile of yours covers this. Grant one in browser settings, then try again.';

function refuse(refusal: BrowserProfileRefusal, message: string): BrowserProfileDecision {
  return { allowed: false, refusal, message };
}

export function profileAdmits(
  profile: BrowserPermissionProfile,
  request: BrowserProfileRequest,
): BrowserProfileDecision {
  if (profile.revokedAtMs !== null) {
    return refuse(
      'profile-revoked',
      `Permission profile "${profile.label}" was revoked, so nothing runs under it.`,
    );
  }
  if (profile.expiresAtMs !== null && profile.expiresAtMs <= request.nowMs) {
    return refuse(
      'profile-expired',
      `Permission profile "${profile.label}" has expired. Grant it again to keep using it.`,
    );
  }

  const origin = normalizeProfileSite(request.url);
  if (!origin || !profile.sites.includes(origin)) {
    return refuse(
      'site-not-in-profile',
      `"${origin ?? request.url}" is not one of the sites permission profile "${profile.label}" covers.`,
    );
  }
  if (!profile.capabilities.includes(request.capability)) {
    return refuse(
      'capability-not-in-profile',
      `Permission profile "${profile.label}" does not grant ${request.capability} on this site.`,
    );
  }

  return { allowed: true, profile };
}

/**
 * The whole check in one call: scope first, so a profile from another workspace
 * refuses with `no-such-profile` rather than leaking that it exists.
 */
export function authorizeProfileRequest(
  profiles: readonly BrowserPermissionProfile[],
  profileId: string,
  viewer: BrowserProfileScope,
  request: BrowserProfileRequest,
): BrowserProfileDecision {
  const profile = findVisibleProfile(profiles, profileId, viewer);
  if (!profile) return refuse('no-such-profile', NO_SUCH_PROFILE);
  return profileAdmits(profile, request);
}

/**
 * The first profile of the viewer's that covers the request. When none does,
 * the refusal names the nearest miss among profiles that list this site: a
 * live one missing the capability first, then one that lapsed. It leaks
 * nothing, because everything considered here is already theirs.
 */
export function selectProfileForRequest(
  profiles: readonly BrowserPermissionProfile[],
  viewer: BrowserProfileScope,
  request: BrowserProfileRequest,
): BrowserProfileDecision {
  const origin = normalizeProfileSite(request.url);
  let lapsed: BrowserProfileDecision | null = null;

  for (const profile of profilesVisibleTo(profiles, viewer)) {
    const decision = profileAdmits(profile, request);
    if (decision.allowed) return decision;
    if (!origin || !profile.sites.includes(origin)) continue;
    if (decision.refusal === 'capability-not-in-profile') return decision;
    lapsed ??= decision;
  }

  return lapsed ?? refuse('no-such-profile', NO_SUCH_PROFILE);
}

export function revokeProfile(
  profile: BrowserPermissionProfile,
  nowMs: number,
): BrowserPermissionProfile {
  return profile.revokedAtMs === null ? { ...profile, revokedAtMs: nowMs } : profile;
}

export interface ProfileRevocationEffect {
  readonly profile: BrowserPermissionProfile;
  readonly ended: readonly BrowserProfileSession[];
  readonly sessions: readonly BrowserProfileSession[];
}

/**
 * Revoking a profile ends every session on it. A session that outlived its
 * grant is the defect this separation exists to make impossible.
 */
export function revokeProfileAndEndSessions(
  profile: BrowserPermissionProfile,
  sessions: readonly BrowserProfileSession[],
  nowMs: number,
): ProfileRevocationEffect {
  const revoked = revokeProfile(profile, nowMs);
  const ended: BrowserProfileSession[] = [];
  const next = sessions.map((session) => {
    if (session.profileId !== profile.id || session.endedAtMs !== null) return session;
    const closed = { ...session, endedAtMs: nowMs };
    ended.push(closed);
    return closed;
  });
  return { profile: revoked, ended, sessions: next };
}

export function liveSessionsOnProfile(
  sessions: readonly BrowserProfileSession[],
  profileId: string,
): readonly BrowserProfileSession[] {
  return sessions.filter(
    (session) => session.profileId === profileId && session.endedAtMs === null,
  );
}
