import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { BrowserViewer } from '../BrowserViewer';
import { cleanupBrowserStore, useBrowserStore } from '../../../stores/browserStore';
import { useAuthStore } from '../../../stores/auth';

import {
  PROFILE_ENDED_THIS_SESSION,
  desktopViewerScope,
  liveSessionsFor,
  resolveViewerProfile,
  sessionProfileStillHolds,
  startViewerSession,
  useBrowserProfileStore,
} from '../permissionProfiles';

vi.mock('../../../lib/tauri-mock', () => ({
  invoke: vi.fn(),
  listen: vi.fn(() => Promise.resolve(() => {})),
  isTauri: true,
}));

const NOW = 1_700_000_000_000;
const VIEWER = { userId: 'user_a', workspaceId: null };
const OTHER_USER = { userId: 'user_b', workspaceId: null };
const SITE = 'https://example.com';

beforeEach(() => {
  useBrowserProfileStore.getState().reset();
});

function grant(overrides: Partial<Parameters<typeof grantInput>[0]> = {}) {
  return useBrowserProfileStore.getState().grant(VIEWER, grantInput(overrides));
}

function grantInput(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile_a',
    label: 'Shopping',
    sites: [SITE],
    capabilities: ['automation' as const],
    nowMs: NOW,
    ...overrides,
  };
}

describe('the desktop viewer scope', () => {
  it('is personal, because the desktop app has no workspace to switch to', () => {
    expect(desktopViewerScope('user_a')).toEqual({ userId: 'user_a', workspaceId: null });
    expect(desktopViewerScope(null)).toBeNull();
    expect(desktopViewerScope('')).toBeNull();
  });
});

describe('resolving a profile for the viewer', () => {
  it('finds the granted profile for a site it covers', () => {
    grant();
    const decision = resolveViewerProfile(VIEWER, {
      url: `${SITE}/cart`,
      capability: 'automation',
      nowMs: NOW,
    });
    expect(decision.allowed && decision.profile.id).toBe('profile_a');
  });

  it('refuses a site the profile does not cover', () => {
    grant();
    expect(
      resolveViewerProfile(VIEWER, {
        url: 'https://elsewhere.example',
        capability: 'automation',
        nowMs: NOW,
      }),
    ).toMatchObject({ allowed: false });
  });

  /** L73387: another account sees nothing, not even that the profile exists. */
  it('hides a profile from another account', () => {
    grant();
    const mine = resolveViewerProfile(VIEWER, { url: SITE, capability: 'automation', nowMs: NOW });
    const theirs = resolveViewerProfile(OTHER_USER, {
      url: SITE,
      capability: 'automation',
      nowMs: NOW,
    });

    expect(mine.allowed).toBe(true);
    expect(theirs).toMatchObject({ allowed: false, refusal: 'no-such-profile' });
  });

  it('refuses a named profile by name rather than silently using a wider one', () => {
    grant();
    grant({ id: 'profile_expired', expiresAtMs: NOW - 1 });

    expect(
      resolveViewerProfile(VIEWER, {
        url: SITE,
        capability: 'automation',
        profileId: 'profile_expired',
        nowMs: NOW,
      }),
    ).toMatchObject({ allowed: false, refusal: 'profile-expired' });
  });
});

describe('a session references a profile', () => {
  it('holds while the profile is a grant and stops the moment it is revoked', () => {
    grant();
    startViewerSession({
      sessionId: 'session-1',
      profileId: 'profile_a',
      kind: 'built-in',
      nowMs: NOW,
    });

    expect(sessionProfileStillHolds('session-1', NOW)).toBe(true);
    expect(liveSessionsFor('profile_a')).toHaveLength(1);

    const ended = useBrowserProfileStore.getState().revoke('profile_a', VIEWER, NOW + 10);

    expect(ended.map((session) => session.sessionId)).toEqual(['session-1']);
    expect(sessionProfileStillHolds('session-1', NOW + 10)).toBe(false);
    expect(liveSessionsFor('profile_a')).toHaveLength(0);
  });

  it('stops holding when the profile expires, with nobody calling anything', () => {
    grant({ expiresAtMs: NOW + 1_000 });
    startViewerSession({
      sessionId: 'session-1',
      profileId: 'profile_a',
      kind: 'built-in',
      nowMs: NOW,
    });

    expect(sessionProfileStillHolds('session-1', NOW + 999)).toBe(true);
    expect(sessionProfileStillHolds('session-1', NOW + 1_001)).toBe(false);
  });

  it('ends every session on the profile, not only the one in front of the person', () => {
    grant();
    startViewerSession({
      sessionId: 'session-1',
      profileId: 'profile_a',
      kind: 'built-in',
      nowMs: NOW,
    });
    startViewerSession({
      sessionId: 'session-2',
      profileId: 'profile_a',
      kind: 'user-chrome',
      nowMs: NOW,
    });

    expect(useBrowserProfileStore.getState().revoke('profile_a', VIEWER, NOW + 5)).toHaveLength(2);
  });

  it('will not let another account revoke a profile it cannot see', () => {
    grant();
    startViewerSession({
      sessionId: 'session-1',
      profileId: 'profile_a',
      kind: 'built-in',
      nowMs: NOW,
    });

    expect(useBrowserProfileStore.getState().revoke('profile_a', OTHER_USER, NOW + 5)).toEqual([]);
    expect(sessionProfileStillHolds('session-1', NOW + 5)).toBe(true);
  });

  it('names the consequence the viewer shows when a grant ends under a running session', () => {
    expect(PROFILE_ENDED_THIS_SESSION).toContain('no longer valid');
  });
});

describe('the viewer window is a session on a profile', () => {
  let invokeMock: Mock<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>;

  beforeEach(async () => {
    const { invoke } = await import('../../../lib/tauri-mock');
    invokeMock = invoke as typeof invokeMock;
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'browser_launch') return 'session-1';
      if (command === 'browser_open_tab') return 'tab-1';
      return undefined;
    });
    useBrowserStore.setState({
      sessions: [
        {
          id: 'session-1',
          browserType: 'Chromium',
          headless: false,
          tabs: [{ id: 'tab-1', url: 'about:blank', title: '', active: true }],
          createdAt: NOW,
        },
      ] as never,
      activeSessionId: 'session-1',
      initialized: true,
      screenshots: [],
      isStreaming: false,
    } as never);
    useAuthStore.setState({ user: { id: VIEWER.userId, email: 'qa@example.com' } } as never);
  });

  afterEach(() => {
    cleanupBrowserStore();
  });

  /** L73386: revoking the grant ends the window running on it, not the other way round. */
  it('closes the running browser and says why when its profile is revoked', async () => {
    grant();
    startViewerSession({
      sessionId: 'session-1',
      profileId: 'profile_a',
      kind: 'built-in',
      nowMs: NOW,
    });

    render(<BrowserViewer />);
    expect(screen.queryByText(PROFILE_ENDED_THIS_SESSION)).toBeNull();

    useBrowserProfileStore.getState().revoke('profile_a', VIEWER, NOW + 10);

    await waitFor(() => {
      expect(screen.getByText(PROFILE_ENDED_THIS_SESSION)).toBeTruthy();
    });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('browser_close', { browserId: 'session-1' });
    });
  });

  it('leaves a window alone when no profile was ever bound to it', async () => {
    render(<BrowserViewer />);

    await waitFor(() => {
      expect(screen.queryByText(PROFILE_ENDED_THIS_SESSION)).toBeNull();
    });
    expect(invokeMock).not.toHaveBeenCalledWith('browser_close', expect.anything());
  });
});
