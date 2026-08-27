import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(APP_ROOT, 'manifest.json'), 'utf8')) as Record<
  string,
  unknown
>;

/**
 * Frozen because `debugger` is the most heavily scrutinised permission in Web
 * Store review and every entry here has to be defensible in the store listing.
 * Adding one is a deliberate act with a justification to write, not a diff that
 * slips through — see CHROME_WEB_STORE_LISTING.md.
 */
const EXPECTED_PERMISSIONS = [
  'activeTab',
  'tabs',
  'storage',
  'nativeMessaging',
  'alarms',
  'contextMenus',
  'sidePanel',
  'scripting',
  'cookies',
  'notifications',
  'tabGroups',
  'debugger',
];

const EXPECTED_HOST_PERMISSIONS = [
  'http://localhost/*',
  'http://127.0.0.1/*',
  'https://agiworkforce.com/*',
  'https://api.agiworkforce.com/*',
];

describe('Chrome manifest trust contract', () => {
  it('disallows incognito because Chrome local storage is shared across profiles', () => {
    expect(manifest['incognito']).toBe('not_allowed');
  });

  it('declares exactly the permissions the store listing justifies', () => {
    expect(manifest['permissions']).toEqual(EXPECTED_PERMISSIONS);
  });

  it('installs with host access to loopback and AGI only', () => {
    expect(manifest['host_permissions']).toEqual(EXPECTED_HOST_PERMISSIONS);
  });

  it('keeps every other origin behind an optional grant Chrome itself asks for', () => {
    expect(manifest['optional_host_permissions']).toEqual(['http://*/*', 'https://*/*']);
    for (const pattern of EXPECTED_HOST_PERMISSIONS) {
      expect(manifest['optional_host_permissions']).not.toContain(pattern);
    }
  });

  it('exposes no extension resource to web pages', () => {
    expect(manifest['web_accessible_resources']).toBeUndefined();
  });

  it('leaves the DevTools-Protocol shortcut unbound so no browser chord is stolen', () => {
    const commands = manifest['commands'] as Record<string, { suggested_key?: unknown }>;
    expect(commands['capture_page']?.suggested_key).toBeUndefined();
  });

  it('carries a written justification for every permission it declares', () => {
    const listing = readFileSync(join(APP_ROOT, 'CHROME_WEB_STORE_LISTING.md'), 'utf8');
    for (const permission of EXPECTED_PERMISSIONS) {
      expect(listing, `no store justification for "${permission}"`).toContain(`\`${permission}\``);
    }
    for (const host of EXPECTED_HOST_PERMISSIONS) {
      expect(listing, `no store justification for "${host}"`).toContain(`\`${host}\``);
    }
    expect(listing).toContain('## Single purpose');
    expect(listing).toContain('optional_host_permissions');
  });

  it('describes Managed Cloud chat without claiming Desktop owns chat inference', () => {
    expect(String(manifest['description'])).toContain('Managed Cloud');
    expect(String(manifest['description'])).not.toMatch(/for AGI Desktop/i);
  });

  it('allows Clerk runtime styles without weakening the extension script policy', () => {
    const contentSecurityPolicy = manifest['content_security_policy'] as
      | { extension_pages?: unknown }
      | undefined;
    const extensionPages = String(contentSecurityPolicy?.extension_pages ?? '');

    expect(extensionPages).toContain("style-src 'self' 'unsafe-inline'");
    expect(extensionPages).toContain("script-src 'self'");
    expect(extensionPages).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(extensionPages).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  });
});
