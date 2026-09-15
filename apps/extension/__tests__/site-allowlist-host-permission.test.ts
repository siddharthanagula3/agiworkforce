import { describe, expect, it } from 'vitest';
import {
  approvedSiteHostPattern,
  hasApprovedSiteHostPermission,
  removeApprovedSiteHostPermission,
  requestApprovedSiteHostPermission,
  type SiteReadPermissions,
} from '../src/features/options/site-allowlist';

function fakePermissions(granted: string[] = []): SiteReadPermissions & { origins: Set<string> } {
  const origins = new Set(granted);
  return {
    origins,
    contains: (permissions) =>
      Promise.resolve((permissions.origins ?? []).every((origin) => origins.has(origin))),
    request: (permissions) => {
      for (const origin of permissions.origins ?? []) origins.add(origin);
      return Promise.resolve(true);
    },
    remove: (permissions) => {
      for (const origin of permissions.origins ?? []) origins.delete(origin);
      return Promise.resolve(true);
    },
  };
}

const MDN = 'https://developer.mozilla.org';
const MDN_PATTERN = `${MDN}/*`;

describe('approved-site host permission', () => {
  it('builds the host pattern from a normalized origin', () => {
    expect(approvedSiteHostPattern(MDN)).toBe(MDN_PATTERN);
    expect(approvedSiteHostPattern('not a url')).toBeNull();
  });

  it('reports no read access for an origin Chrome never granted', async () => {
    await expect(hasApprovedSiteHostPermission(MDN, fakePermissions())).resolves.toBe(false);
  });

  it('asks Chrome for host access and reports the grant', async () => {
    const permissions = fakePermissions();
    await expect(requestApprovedSiteHostPermission(MDN, permissions)).resolves.toBe(true);
    expect(permissions.origins.has(MDN_PATTERN)).toBe(true);
    await expect(hasApprovedSiteHostPermission(MDN, permissions)).resolves.toBe(true);
  });

  it('reports a refusal rather than throwing, and grants nothing', async () => {
    const permissions: SiteReadPermissions = {
      contains: () => Promise.resolve(false),
      request: () => Promise.resolve(false),
      remove: () => Promise.resolve(true),
    };
    await expect(requestApprovedSiteHostPermission(MDN, permissions)).resolves.toBe(false);
  });

  it('removes host access on request', async () => {
    const permissions = fakePermissions([MDN_PATTERN]);
    await removeApprovedSiteHostPermission(MDN, permissions);
    expect(permissions.origins.has(MDN_PATTERN)).toBe(false);
  });

  it('never calls chrome.permissions for a non-http(s) origin', async () => {
    let called = false;
    const permissions: SiteReadPermissions = {
      contains: () => {
        called = true;
        return Promise.resolve(false);
      },
      request: () => {
        called = true;
        return Promise.resolve(true);
      },
      remove: () => {
        called = true;
        return Promise.resolve(true);
      },
    };
    await hasApprovedSiteHostPermission('chrome://extensions', permissions);
    await requestApprovedSiteHostPermission('chrome://extensions', permissions);
    await removeApprovedSiteHostPermission('chrome://extensions', permissions);
    expect(called).toBe(false);
  });
});
