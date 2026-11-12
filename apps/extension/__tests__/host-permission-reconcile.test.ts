import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  chromeHostPermissionReconcileDeps,
  planHostPermissionRelease,
  releaseUnapprovedHostPermissions,
  type HostPermissionReconcileDeps,
} from '../src/features/computer-use/hostPermissionReconcile';
import {
  listTransientHostPermissions,
  recordTransientHostPermission,
  type TransientHostPermissionStorage,
} from '../src/features/computer-use/transientHostPermissions';

const APPROVED = 'https://approved.example';
const ONCE = 'https://once.example';
const REQUIRED = ['http://localhost/*', 'https://agiworkforce.com/*'];
const CONTENT_MATCHES = ['http://*/*', 'https://*/*'];

function deps(
  granted: string[],
  approved: () => Promise<string[]>,
): HostPermissionReconcileDeps & { remove: ReturnType<typeof vi.fn> } {
  return {
    grantedOrigins: async () => granted,
    requiredOrigins: () => [...REQUIRED, ...CONTENT_MATCHES],
    approvedOrigins: approved,
    remove: vi.fn(async () => true),
  };
}

describe('site access left over from "Allow once"', () => {
  it('is released after a browser restart wiped the session record of the grant', async () => {
    const session: Record<string, unknown> = {};
    const storage: TransientHostPermissionStorage = {
      get: async (key) => ({ [key]: session[key] }),
      set: async (items) => {
        Object.assign(session, items);
      },
    };
    await recordTransientHostPermission('site_once_restart', ONCE, storage);
    for (const key of Object.keys(session)) delete session[key];
    expect(await listTransientHostPermissions(storage)).toEqual([]);

    const chrome = deps([...REQUIRED, `${APPROVED}/*`, `${ONCE}/*`], async () => [APPROVED]);
    expect(await releaseUnapprovedHostPermissions(chrome)).toEqual([`${ONCE}/*`]);
    expect(chrome.remove).toHaveBeenCalledTimes(1);
    expect(chrome.remove).toHaveBeenCalledWith(`${ONCE}/*`);
  });

  it('keeps permanently approved sites, manifest hosts and content script matches', () => {
    expect(
      planHostPermissionRelease(
        [...REQUIRED, ...CONTENT_MATCHES, `${APPROVED}/*`],
        [...REQUIRED, ...CONTENT_MATCHES],
        [APPROVED],
      ),
    ).toEqual([]);
  });

  it('keeps nothing optional when the approved list cannot be read', async () => {
    const chrome = deps([`${APPROVED}/*`, `${ONCE}/*`], async () => {
      throw new Error('storage unavailable');
    });
    expect(await releaseUnapprovedHostPermissions(chrome)).toEqual([`${APPROVED}/*`, `${ONCE}/*`]);
  });

  it('goes on releasing the rest when Chrome refuses one removal', async () => {
    const chrome = deps([`${ONCE}/*`, 'https://other.example/*'], async () => []);
    chrome.remove.mockRejectedValueOnce(new Error('You cannot remove required permissions.'));
    expect(await releaseUnapprovedHostPermissions(chrome)).toEqual(['https://other.example/*']);
    expect(chrome.remove).toHaveBeenCalledTimes(2);
  });

  it('reads Chrome grants and treats manifest hosts and content script matches as required', async () => {
    const remove = vi.fn(async () => true);
    vi.stubGlobal('chrome', {
      permissions: {
        getAll: async () => ({ origins: [...REQUIRED, ...CONTENT_MATCHES, `${ONCE}/*`] }),
        remove,
      },
      runtime: {
        getManifest: () => ({
          host_permissions: REQUIRED,
          content_scripts: [{ matches: CONTENT_MATCHES, js: ['src/content.js'] }],
        }),
      },
    });
    try {
      await expect(
        releaseUnapprovedHostPermissions(chromeHostPermissionReconcileDeps(async () => [])),
      ).resolves.toEqual([`${ONCE}/*`]);
      expect(remove).toHaveBeenCalledWith({ origins: [`${ONCE}/*`] });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('runs when the browser starts and when the extension is installed or updated', () => {
    const background = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/background.ts'),
      'utf8',
    );
    expect(background).toMatch(
      /^chrome\.runtime\.onStartup\.addListener\(releaseUnapprovedSiteAccess\);$/m,
    );
    expect(background).toMatch(
      /chrome\.runtime\.onInstalled\.addListener\(\(details\) => \{\s*void rebuildContextMenus\(\);\s*releaseUnapprovedSiteAccess\(\);/,
    );
    expect(background).toMatch(
      /releaseUnapprovedHostPermissions\(chromeHostPermissionReconcileDeps\(readUserSiteAllowlist\)\)/,
    );
  });
});
