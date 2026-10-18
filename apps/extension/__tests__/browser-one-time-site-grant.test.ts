import { afterEach, describe, expect, it, vi } from 'vitest';
import * as sitePolicy from '../src/features/site-policy/store';
import {
  addOneTimeSiteGrant,
  expiredOneTimeSiteGrants,
  hasOneTimeSiteGrant,
  ONE_TIME_SITE_GRANT_MAX_MS,
  removeOneTimeSiteGrant,
} from '../src/features/computer-use/oneTimeSiteGrants';
import {
  hasBrowserControlConsent,
  type BrowserControlConsentStorage,
  type BrowserControlPermissions,
} from '../src/features/computer-use/browserControlConsent';
import { authorizeBrowserToolCapability } from '../src/features/browser-tools/tabAuthority';

const ACME = 'https://acme.example';

function emptyStorage(): BrowserControlConsentStorage {
  return { get: async () => ({}), set: async () => undefined };
}

function permissions(granted: boolean): BrowserControlPermissions {
  return {
    contains: async () => granted,
    request: async () => granted,
    remove: async () => true,
  };
}

afterEach(() => {
  removeOneTimeSiteGrant('site_once_test-grant-a');
  removeOneTimeSiteGrant('site_once_test-grant-b');
  vi.restoreAllMocks();
});

describe('one-time site grants', () => {
  it('accepts only well-formed grant ids and http(s) origins, once each', () => {
    expect(addOneTimeSiteGrant('bad id', ACME, false)).toBeNull();
    expect(addOneTimeSiteGrant('site_once_test-grant-a', 'chrome://settings', false)).toBeNull();
    expect(addOneTimeSiteGrant('site_once_test-grant-a', `${ACME}/path`, true)).toMatchObject({
      origin: ACME,
      hostPermissionAdded: true,
    });
    expect(addOneTimeSiteGrant('site_once_test-grant-a', ACME, false)).toBeNull();
    expect(hasOneTimeSiteGrant(ACME)).toBe(true);
  });

  it('stops granting the moment it is revoked or expires', () => {
    const now = 1_000;
    addOneTimeSiteGrant('site_once_test-grant-a', ACME, false, now);
    expect(hasOneTimeSiteGrant(ACME, now + 1)).toBe(true);
    expect(hasOneTimeSiteGrant(ACME, now + ONE_TIME_SITE_GRANT_MAX_MS)).toBe(false);
    expect(expiredOneTimeSiteGrants(now + ONE_TIME_SITE_GRANT_MAX_MS)).toHaveLength(1);
    removeOneTimeSiteGrant('site_once_test-grant-a');
    expect(hasOneTimeSiteGrant(ACME, now + 1)).toBe(false);
  });

  it('stands in for the stored consent record but never for Chrome host access', async () => {
    expect(await hasBrowserControlConsent(ACME, emptyStorage(), permissions(true))).toBe(false);
    addOneTimeSiteGrant('site_once_test-grant-a', ACME, true);
    expect(await hasBrowserControlConsent(ACME, emptyStorage(), permissions(true))).toBe(true);
    expect(await hasBrowserControlConsent(ACME, emptyStorage(), permissions(false))).toBe(false);
    removeOneTimeSiteGrant('site_once_test-grant-a');
    expect(await hasBrowserControlConsent(ACME, emptyStorage(), permissions(true))).toBe(false);
  });

  it('admits automation on a one-time origin without touching the approved-sites list', async () => {
    const assertSiteAccess = vi.spyOn(sitePolicy, 'assertSiteAccess');
    vi.spyOn(sitePolicy, 'readAdminSitePolicy').mockResolvedValue(null);
    addOneTimeSiteGrant('site_once_test-grant-a', ACME, true);
    await expect(
      authorizeBrowserToolCapability(`${ACME}/form`, 'automation'),
    ).resolves.toMatchObject({ origin: ACME });
    expect(assertSiteAccess).not.toHaveBeenCalled();
  });

  it("keeps the organization's block in force over a one-time grant", async () => {
    vi.spyOn(sitePolicy, 'readAdminSitePolicy').mockResolvedValue({
      version: 1,
      blocklist: [{ pattern: ACME }],
      allowlist: [],
    });
    addOneTimeSiteGrant('site_once_test-grant-a', ACME, true);
    await expect(authorizeBrowserToolCapability(`${ACME}/form`, 'automation')).rejects.toThrow(
      /organization/,
    );
  });

  it('does not stretch a one-time grant to uploads or downloads', async () => {
    const assertSiteAccess = vi
      .spyOn(sitePolicy, 'assertSiteAccess')
      .mockRejectedValue(new Error('not approved'));
    addOneTimeSiteGrant('site_once_test-grant-a', ACME, true);
    await expect(authorizeBrowserToolCapability(`${ACME}/form`, 'download')).rejects.toThrow(
      'not approved',
    );
    expect(assertSiteAccess).toHaveBeenCalledOnce();
  });
});
