/**
 * Browser permission profiles in the extension: the durable grant, its scope,
 * and the tab gate that reads it.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserPermissionProfile } from '@agiworkforce/types';

const SITE = 'https://allowed.example';
const TAB_ID = 44;

const store: Record<string, unknown> = {};
const grantedOrigins = new Set<string>();
const tabs = new Map<number, { id: number; url: string }>();

function areaFor(backing: Record<string, unknown>) {
  return {
    get: vi.fn((keys?: unknown) => {
      if (typeof keys === 'string') return Promise.resolve({ [keys]: backing[keys] });
      if (Array.isArray(keys)) {
        return Promise.resolve(Object.fromEntries(keys.map((key) => [key, backing[key]])));
      }
      return Promise.resolve({ ...backing });
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(backing, items);
      return Promise.resolve();
    }),
  };
}

vi.stubGlobal('chrome', {
  runtime: { id: 'profiles-test', lastError: undefined },
  storage: { local: areaFor(store), session: areaFor({}) },
  permissions: {
    contains: vi.fn((permissions: { origins?: string[] }) =>
      Promise.resolve((permissions.origins ?? []).every((p) => grantedOrigins.has(p))),
    ),
    request: vi.fn(() => Promise.resolve(true)),
    remove: vi.fn(() => Promise.resolve(true)),
  },
  tabs: {
    get: vi.fn((tabId: number) => {
      const tab = tabs.get(tabId);
      return tab ? Promise.resolve(tab) : Promise.reject(new Error('no tab'));
    }),
  },
});

const {
  BROWSER_PROFILE_SCOPE_STORAGE_KEY,
  BROWSER_PROFILE_STORAGE_KEY,
  createBrowserProfileSection,
  liveProfilesFor,
  profileGateFor,
  readBrowserPermissionProfiles,
  revokeBrowserPermissionProfile,
  sanitizeStoredProfiles,
  sanitizeStoredScope,
} = await import('../src/features/options/site-permission-policy');
const { authorizeBrowserToolTab } = await import('../src/features/browser-tools/tabAuthority');

const VIEWER = { userId: 'user_a', workspaceId: 'workspace_a' };
const NOW = 1_700_000_000_000;

function storage() {
  return {
    get: (key: string) => Promise.resolve({ [key]: store[key] }),
    set: (items: Record<string, unknown>) => {
      Object.assign(store, items);
      return Promise.resolve();
    },
  };
}

function profile(overrides: Partial<BrowserPermissionProfile> = {}): BrowserPermissionProfile {
  return {
    id: 'profile_a',
    label: 'Shopping',
    userId: VIEWER.userId,
    workspaceId: VIEWER.workspaceId,
    sites: [SITE],
    capabilities: ['automation'],
    createdAtMs: NOW - 1_000,
    expiresAtMs: null,
    revokedAtMs: null,
    ...overrides,
  };
}

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
  grantedOrigins.clear();
  grantedOrigins.add(`${SITE}/*`);
  tabs.clear();
  tabs.set(TAB_ID, { id: TAB_ID, url: `${SITE}/cart` });
  store['agi_site_policy_admin'] = undefined;
  store['agi_site_allowlist'] = [SITE];
  store['agi_cu_browser_control_consent'] = [SITE];
  document.body.replaceChildren();
});

describe('stored profiles are untrusted input', () => {
  it('drops a row with no scope, no site or no capability rather than repairing it', () => {
    expect(
      sanitizeStoredProfiles([
        { ...profile(), userId: '' },
        { ...profile(), sites: [] },
        { ...profile(), capabilities: ['take-over-the-world'] },
        { ...profile(), workspaceId: 42 },
        'not a profile',
      ]),
    ).toEqual([]);
  });

  it('normalizes sites and keeps one row per id', () => {
    const [kept, ...rest] = sanitizeStoredProfiles([
      { ...profile(), sites: [`${SITE}:443/cart`, SITE, 'file:///etc/passwd'] },
      profile(),
    ]);
    expect(rest).toHaveLength(0);
    expect(kept?.sites).toEqual([SITE]);
  });

  it('reads a scope with no workspace as personal, not as a wildcard', () => {
    expect(sanitizeStoredScope({ userId: 'user_a' })).toEqual({
      userId: 'user_a',
      workspaceId: null,
    });
    expect(sanitizeStoredScope({ workspaceId: 'workspace_a' })).toBeNull();
  });
});

describe('the profile gate', () => {
  it('leaves the existing gates deciding when the person holds no profile', () => {
    expect(
      profileGateFor([], VIEWER, { url: SITE, capability: 'automation', nowMs: NOW }),
    ).toBeNull();
    expect(
      profileGateFor([profile()], null, { url: SITE, capability: 'automation', nowMs: NOW }),
    ).toBeNull();
  });

  /** L73387: a profile from another workspace is not visible, so it does not gate. */
  it('ignores a profile granted in another workspace or to another person', () => {
    const elsewhere = [
      profile({ id: 'other_workspace', workspaceId: 'workspace_b' }),
      profile({ id: 'other_user', userId: 'user_b' }),
    ];
    expect(
      profileGateFor(elsewhere, VIEWER, { url: SITE, capability: 'automation', nowMs: NOW }),
    ).toBeNull();
    expect(liveProfilesFor(elsewhere, VIEWER, NOW)).toEqual([]);
  });

  it('becomes authoritative once one is granted here', () => {
    const held = [profile()];
    expect(
      profileGateFor(held, VIEWER, { url: SITE, capability: 'automation', nowMs: NOW })?.allowed,
    ).toBe(true);
    expect(
      profileGateFor(held, VIEWER, {
        url: 'https://elsewhere.example',
        capability: 'automation',
        nowMs: NOW,
      }),
    ).toMatchObject({ allowed: false, refusal: 'no-such-profile' });
    expect(
      profileGateFor(held, VIEWER, { url: SITE, capability: 'download', nowMs: NOW }),
    ).toMatchObject({ allowed: false });
  });
});

describe('tab authority under a profile', () => {
  it('reports no profile when none is granted, and still authorizes the tab', async () => {
    await expect(authorizeBrowserToolTab(TAB_ID, storage())).resolves.toMatchObject({
      origin: SITE,
      profileId: null,
    });
  });

  it('names the profile that admitted the tab', async () => {
    store[BROWSER_PROFILE_STORAGE_KEY] = [profile()];
    store[BROWSER_PROFILE_SCOPE_STORAGE_KEY] = VIEWER;

    await expect(authorizeBrowserToolTab(TAB_ID, storage())).resolves.toMatchObject({
      profileId: 'profile_a',
    });
  });

  /** L73386: the session is the tab, the grant is the profile, and revoking the grant stops the tab. */
  it('refuses the same tab once the profile is revoked', async () => {
    store[BROWSER_PROFILE_STORAGE_KEY] = [profile()];
    store[BROWSER_PROFILE_SCOPE_STORAGE_KEY] = VIEWER;
    await expect(authorizeBrowserToolTab(TAB_ID, storage())).resolves.toMatchObject({
      profileId: 'profile_a',
    });

    await expect(revokeBrowserPermissionProfile(storage(), 'profile_a', VIEWER, NOW)).resolves.toBe(
      true,
    );

    await expect(authorizeBrowserToolTab(TAB_ID, storage())).rejects.toThrow(/revoked|not one of/);
  });

  it('refuses the tab once the profile has expired', async () => {
    store[BROWSER_PROFILE_STORAGE_KEY] = [profile({ expiresAtMs: NOW - 1 })];
    store[BROWSER_PROFILE_SCOPE_STORAGE_KEY] = VIEWER;

    await expect(authorizeBrowserToolTab(TAB_ID, storage())).rejects.toThrow(/expired|not one of/);
  });

  it('will not let another workspace revoke a profile it cannot see', async () => {
    store[BROWSER_PROFILE_STORAGE_KEY] = [profile()];

    await expect(
      revokeBrowserPermissionProfile(
        storage(),
        'profile_a',
        { userId: VIEWER.userId, workspaceId: 'workspace_b' },
        NOW,
      ),
    ).resolves.toBe(false);
    expect((await readBrowserPermissionProfiles(storage()))[0]?.revokedAtMs).toBeNull();
  });
});

describe('the options section', () => {
  it('lists only this scope profiles and asks twice before revoking', async () => {
    store[BROWSER_PROFILE_STORAGE_KEY] = [
      profile(),
      profile({ id: 'elsewhere', workspaceId: 'workspace_b' }),
    ];

    const section = createBrowserProfileSection(storage(), VIEWER);
    await section.loaded;

    const items = section.element.querySelectorAll('.opt-profile-item');
    expect(items).toHaveLength(1);
    expect(section.status.textContent).toContain('1 permission profile');

    const revoke = section.element.querySelector('button') as HTMLButtonElement;
    revoke.click();
    expect(revoke.textContent).toBe('Click again to revoke');
    expect(section.status.textContent).toContain('Click again to end every session');
    expect((await readBrowserPermissionProfiles(storage()))[0]?.revokedAtMs).toBeNull();

    revoke.click();
    await section.refresh();
    const stored = await readBrowserPermissionProfiles(storage());
    expect(stored.find((held) => held.id === 'profile_a')?.revokedAtMs).not.toBeNull();
  });

  it('says so rather than listing anything when nobody is signed in', async () => {
    const section = createBrowserProfileSection(storage(), null);
    await section.loaded;

    expect(section.element.querySelectorAll('.opt-profile-item')).toHaveLength(0);
    expect(section.status.textContent).toContain('Sign in');
  });
});
