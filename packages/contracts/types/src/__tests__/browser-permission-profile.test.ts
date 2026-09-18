import { describe, expect, it } from 'vitest';

import {
  authorizeProfileRequest,
  findVisibleProfile,
  liveSessionsOnProfile,
  normalizeProfileSite,
  profileAdmits,
  profileIsLive,
  profilesVisibleTo,
  revokeProfileAndEndSessions,
  selectProfileForRequest,
  type BrowserPermissionProfile,
  type BrowserProfileSession,
} from '../browser-permission-profile';

const NOW = 1_700_000_000_000;

function profile(overrides: Partial<BrowserPermissionProfile> = {}): BrowserPermissionProfile {
  return {
    id: 'profile_a',
    label: 'Shopping',
    userId: 'user_a',
    workspaceId: 'workspace_a',
    sites: ['https://example.com'],
    capabilities: ['automation'],
    createdAtMs: NOW - 1_000,
    expiresAtMs: null,
    revokedAtMs: null,
    ...overrides,
  };
}

function session(overrides: Partial<BrowserProfileSession> = {}): BrowserProfileSession {
  return {
    sessionId: 'session_1',
    profileId: 'profile_a',
    kind: 'built-in',
    startedAtMs: NOW - 500,
    endedAtMs: null,
    ...overrides,
  };
}

const request = { url: 'https://example.com/cart', capability: 'automation', nowMs: NOW } as const;

describe('browser permission profiles', () => {
  it('admits only the sites and capabilities it was granted', () => {
    expect(profileAdmits(profile(), request).allowed).toBe(true);

    expect(profileAdmits(profile(), { ...request, url: 'https://other.example' })).toMatchObject({
      allowed: false,
      refusal: 'site-not-in-profile',
    });
    expect(profileAdmits(profile(), { ...request, capability: 'download' })).toMatchObject({
      allowed: false,
      refusal: 'capability-not-in-profile',
    });
  });

  it('treats a scheme change as a different site', () => {
    expect(profileAdmits(profile(), { ...request, url: 'http://example.com/cart' })).toMatchObject({
      refusal: 'site-not-in-profile',
    });
    expect(normalizeProfileSite('https://example.com:443/cart')).toBe('https://example.com');
    expect(normalizeProfileSite('file:///etc/passwd')).toBeNull();
  });

  it('stops admitting once it expires or is revoked', () => {
    const expired = profile({ expiresAtMs: NOW });
    expect(profileIsLive(expired, NOW)).toBe(false);
    expect(profileAdmits(expired, request)).toMatchObject({ refusal: 'profile-expired' });

    const revoked = profile({ revokedAtMs: NOW - 1 });
    expect(profileIsLive(revoked, NOW)).toBe(false);
    expect(profileAdmits(revoked, request)).toMatchObject({ refusal: 'profile-revoked' });
  });

  /**
   * L73387. The refusal must not distinguish "exists but is not yours" from
   * "does not exist", or the check itself becomes a directory of other
   * workspaces' grants.
   */
  it('hides a profile from another user and from another workspace', () => {
    const profiles = [profile()];
    const otherWorkspace = { userId: 'user_a', workspaceId: 'workspace_b' };
    const otherUser = { userId: 'user_b', workspaceId: 'workspace_a' };
    const personal = { userId: 'user_a', workspaceId: null };

    expect(
      profilesVisibleTo(profiles, { userId: 'user_a', workspaceId: 'workspace_a' }),
    ).toHaveLength(1);
    expect(profilesVisibleTo(profiles, otherWorkspace)).toHaveLength(0);
    expect(profilesVisibleTo(profiles, otherUser)).toHaveLength(0);
    expect(profilesVisibleTo(profiles, personal)).toHaveLength(0);

    expect(findVisibleProfile(profiles, 'profile_a', otherWorkspace)).toBeUndefined();

    const refusal = authorizeProfileRequest(profiles, 'profile_a', otherWorkspace, request);
    const missing = authorizeProfileRequest(profiles, 'profile_zzz', otherWorkspace, request);
    expect(refusal).toMatchObject({ allowed: false, refusal: 'no-such-profile' });
    expect(refusal).toEqual(missing);
  });

  it('picks the first of the viewer own profiles that covers the request', () => {
    const profiles = [
      profile({ id: 'profile_expired', expiresAtMs: NOW - 1 }),
      profile({ id: 'profile_other_workspace', workspaceId: 'workspace_b' }),
      profile({ id: 'profile_live' }),
    ];
    const viewer = { userId: 'user_a', workspaceId: 'workspace_a' };

    const decision = selectProfileForRequest(profiles, viewer, request);
    expect(decision.allowed && decision.profile.id).toBe('profile_live');

    expect(
      selectProfileForRequest(profiles, viewer, { ...request, capability: 'upload' }),
    ).toMatchObject({ refusal: 'capability-not-in-profile' });

    expect(
      selectProfileForRequest(profiles, viewer, { ...request, url: 'https://nowhere.example' }),
    ).toMatchObject({ refusal: 'no-such-profile' });
  });

  it('says a profile lapsed rather than that none exists, when one lists the site', () => {
    const viewer = { userId: 'user_a', workspaceId: 'workspace_a' };
    const expired = [profile({ expiresAtMs: NOW - 1 })];

    expect(selectProfileForRequest(expired, viewer, request)).toMatchObject({
      refusal: 'profile-expired',
    });
    expect(
      selectProfileForRequest(expired, viewer, { ...request, url: 'https://nowhere.example' }),
    ).toMatchObject({ refusal: 'no-such-profile' });
  });

  /** L73386: a session references a profile, so revoking the profile ends it. */
  it('ends every session on a profile when the profile is revoked', () => {
    const sessions = [
      session({ sessionId: 'session_1' }),
      session({ sessionId: 'session_2', kind: 'user-chrome' }),
      session({ sessionId: 'session_3', profileId: 'profile_b' }),
      session({ sessionId: 'session_4', endedAtMs: NOW - 10 }),
    ];

    const effect = revokeProfileAndEndSessions(profile(), sessions, NOW);

    expect(effect.profile.revokedAtMs).toBe(NOW);
    expect(effect.ended.map((item) => item.sessionId)).toEqual(['session_1', 'session_2']);
    expect(liveSessionsOnProfile(effect.sessions, 'profile_a')).toHaveLength(0);
    expect(liveSessionsOnProfile(effect.sessions, 'profile_b')).toHaveLength(1);
    expect(effect.sessions.find((item) => item.sessionId === 'session_4')?.endedAtMs).toBe(
      NOW - 10,
    );
  });

  it('keeps a revocation idempotent', () => {
    const once = revokeProfileAndEndSessions(profile(), [session()], NOW);
    const twice = revokeProfileAndEndSessions(once.profile, once.sessions, NOW + 5_000);

    expect(twice.profile.revokedAtMs).toBe(NOW);
    expect(twice.ended).toHaveLength(0);
  });
});
