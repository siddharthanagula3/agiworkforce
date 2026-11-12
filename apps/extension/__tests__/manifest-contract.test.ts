import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  PRODUCT_COPYRIGHT_NAME,
  PRODUCT_NAMES,
  SITE_POLICY_CAPABILITIES,
} from '@agiworkforce/types';

import { GATEWAY_URL_ALLOWLIST_EXACT } from '../src/background/policy';
import { ARTIFACT_SANDBOX_ORIGIN } from '../src/lib/webOrigin';
import { ADMIN_SITE_POLICY_STORAGE_KEY } from '../src/features/site-policy/store';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(APP_ROOT, 'manifest.json'), 'utf8')) as Record<
  string,
  unknown
>;

/**
 * Frozen because `debugger` is the most heavily scrutinised permission in Web
 * Store review and every entry here has to be defensible in the store listing.
 * Adding one is a deliberate act with a justification to write, not a diff that
 * slips through, see docs/chrome-web-store-listing.md.
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
  'downloads',
];

const STORE_SUMMARY_MAX_CHARACTERS = 132;

function listingShortDescription(): string {
  const listing = readFileSync(join(APP_ROOT, 'docs/chrome-web-store-listing.md'), 'utf8');
  const lines = listing.split('\n');
  const heading = lines.findIndex((line) => line.startsWith('**Short description'));
  expect(heading, 'the listing has no short description heading').toBeGreaterThan(-1);
  const quoted = lines.slice(heading + 1).find((line) => line.trim() !== '');
  expect(quoted?.startsWith('> '), 'the short description must be one quoted line').toBe(true);
  return (quoted ?? '').slice(2).trim();
}

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

  it('asks for browsing history only as an optional grant the user turns on', () => {
    expect(manifest['optional_permissions']).toEqual(['history']);
    const listing = readFileSync(join(APP_ROOT, 'docs/chrome-web-store-listing.md'), 'utf8');
    expect(listing).toContain('`optional_permissions`: `history`');
  });

  it('exposes no extension resource to web pages', () => {
    expect(manifest['web_accessible_resources']).toBeUndefined();
  });

  it('opens the side panel on a chord Chrome and ChromeOS leave free, so Chrome assigns it', () => {
    const commands = manifest['commands'] as Record<string, { suggested_key?: unknown }>;
    expect(commands['_execute_action']?.suggested_key).toEqual({
      default: 'Alt+Shift+K',
      mac: 'Command+Shift+K',
    });
  });

  it('binds page capture to a chord Chrome and ChromeOS leave free, so no browser chord is stolen', () => {
    const commands = manifest['commands'] as Record<string, { suggested_key?: unknown }>;
    expect(commands['capture_page']?.suggested_key).toEqual({
      default: 'Alt+Shift+Y',
      mac: 'Command+Shift+Y',
    });
  });

  it('carries a written justification for every permission it declares', () => {
    const listing = readFileSync(join(APP_ROOT, 'docs/chrome-web-store-listing.md'), 'utf8');
    for (const permission of EXPECTED_PERMISSIONS) {
      expect(listing, `no store justification for "${permission}"`).toContain(`\`${permission}\``);
    }
    for (const host of EXPECTED_HOST_PERMISSIONS) {
      expect(listing, `no store justification for "${host}"`).toContain(`\`${host}\``);
    }
    expect(listing).toContain('## Single purpose');
    expect(listing).toContain('optional_host_permissions');
  });

  it('justifies the all-sites content script, which is the install warning users see', () => {
    const listing = readFileSync(join(APP_ROOT, 'docs/chrome-web-store-listing.md'), 'utf8');
    const contentScripts = manifest['content_scripts'] as Array<{ matches?: string[] }>;
    const matches = contentScripts[0]?.matches ?? [];

    expect(matches).toEqual(['http://*/*', 'https://*/*']);
    expect(listing, 'no store justification for the content_scripts match').toContain(
      '`content_scripts` match',
    );
    for (const match of matches) {
      expect(listing, `no store justification for "${match}"`).toContain(`\`${match}\``);
    }
    expect(listing).toContain('read and change all your data on all websites');
  });

  it('names the store item from the product registry, the same name the toolbar shows', () => {
    const storeName = `${PRODUCT_COPYRIGHT_NAME} ${PRODUCT_NAMES.extension}`;
    const action = manifest['action'] as { default_title?: unknown };

    expect(manifest['name']).toBe(storeName);
    expect(action.default_title).toBe(storeName);
    expect(String(manifest['name']).length).toBeLessThanOrEqual(75);
  });

  it('uses the store listing short description as the manifest description Chrome shows', () => {
    const summary = listingShortDescription();
    const packageJson = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as {
      description?: unknown;
    };

    expect(summary.length).toBeGreaterThan(0);
    expect(summary.length).toBeLessThanOrEqual(STORE_SUMMARY_MAX_CHARACTERS);
    expect(manifest['description']).toBe(summary);
    expect(packageJson.description).toBe(summary);
    expect(summary).not.toMatch(/for AGI Desktop/i);
  });

  it('names every gateway origin exactly, with no agiworkforce.com wildcard', () => {
    const contentSecurityPolicy = manifest['content_security_policy'] as
      { extension_pages?: unknown } | undefined;
    const connectSource = /connect-src ([^;]+)/.exec(
      String(contentSecurityPolicy?.extension_pages ?? ''),
    )?.[1];

    expect(connectSource).toBeDefined();
    expect(connectSource).not.toContain('https://*.agiworkforce.com');
    for (const origin of GATEWAY_URL_ALLOWLIST_EXACT) {
      expect(connectSource, `connect-src cannot reach allowlisted gateway ${origin}`).toContain(
        origin,
      );
    }
  });

  it('frames only the artifact renderer origin, and says why in the listing', () => {
    const listing = readFileSync(join(APP_ROOT, 'docs/chrome-web-store-listing.md'), 'utf8');
    const contentSecurityPolicy = manifest['content_security_policy'] as
      { extension_pages?: unknown } | undefined;
    const frameSource = /frame-src ([^;]+)/
      .exec(String(contentSecurityPolicy?.extension_pages ?? ''))?.[1]
      ?.trim()
      .split(/\s+/);

    expect(frameSource).toEqual(["'self'", ARTIFACT_SANDBOX_ORIGIN]);
    expect(listing).toContain(
      `\`frame-src\` adds exactly one remote origin, \`${ARTIFACT_SANDBOX_ORIGIN}\``,
    );
  });

  it('plays only media the extension downloaded itself', () => {
    const listing = readFileSync(join(APP_ROOT, 'docs/chrome-web-store-listing.md'), 'utf8');
    const contentSecurityPolicy = manifest['content_security_policy'] as
      { extension_pages?: unknown } | undefined;
    const mediaSource = /media-src ([^;]+)/
      .exec(String(contentSecurityPolicy?.extension_pages ?? ''))?.[1]
      ?.trim()
      .split(/\s+/);

    expect(mediaSource).toEqual(["'self'", 'blob:']);
    expect(listing).toContain('`media-src` adds `blob:` only');
  });

  it('declares no Chrome Apps keys, which MV3 ignores and review flags', () => {
    expect(manifest['offline_enabled']).toBeUndefined();
  });

  it('declares the managed schema, without which chrome.storage.managed is always empty', () => {
    const storage = manifest['storage'] as { managed_schema?: unknown } | undefined;
    expect(storage?.managed_schema).toBe('managed-schema.json');
  });

  it('ships the managed schema in the package, because a missing file fails the load', () => {
    expect(readFileSync(join(APP_ROOT, 'vite.config.ts'), 'utf8')).toContain(
      "{ src: 'managed-schema.json', dest: '.' }",
    );
  });

  it('describes the site policy an admin distributes, with the capabilities the engine knows', () => {
    const schema = JSON.parse(readFileSync(join(APP_ROOT, 'managed-schema.json'), 'utf8')) as {
      properties?: Record<string, { type?: string; properties?: Record<string, unknown> }>;
    };
    const policy = schema.properties?.[ADMIN_SITE_POLICY_STORAGE_KEY];
    expect(policy?.type).toBe('object');
    expect(Object.keys(policy?.properties ?? {})).toEqual(['version', 'blocklist', 'allowlist']);

    for (const list of ['blocklist', 'allowlist'] as const) {
      const rule = (
        policy?.properties?.[list] as { items?: { properties?: Record<string, unknown> } }
      )?.items;
      expect(Object.keys(rule?.properties ?? {})).toEqual(['pattern', 'capabilities']);
      const capabilities = rule?.properties?.['capabilities'] as { items?: { enum?: unknown } };
      expect(capabilities.items?.enum).toEqual([...SITE_POLICY_CAPABILITIES]);
    }
  });

  it('allows Clerk runtime styles without weakening the extension script policy', () => {
    const contentSecurityPolicy = manifest['content_security_policy'] as
      { extension_pages?: unknown } | undefined;
    const extensionPages = String(contentSecurityPolicy?.extension_pages ?? '');

    expect(extensionPages).toContain("style-src 'self' 'unsafe-inline'");
    expect(extensionPages).toContain("script-src 'self'");
    expect(extensionPages).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(extensionPages).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  });

  it('lets answer images load from https only, and only as images', () => {
    const contentSecurityPolicy = manifest['content_security_policy'] as
      { extension_pages?: unknown } | undefined;
    const extensionPages = String(contentSecurityPolicy?.extension_pages ?? '');
    const directive = (name: string): string | undefined =>
      new RegExp(`(?:^|;\\s*)${name} ([^;]+)`).exec(extensionPages)?.[1]?.trim();

    expect(directive('img-src')).toBe("'self' data: https:");
    expect(directive('default-src')).toBe("'self'");
    expect(directive('font-src')).toBeUndefined();
    expect(directive('media-src')).toBe("'self' blob:");
    expect(directive('frame-src')).toBe(`'self' ${ARTIFACT_SANDBOX_ORIGIN}`);
  });
});

describe('context menu entries and their store justification', () => {
  const background = readFileSync(join(APP_ROOT, 'src/background.ts'), 'utf8');
  const catalog = JSON.parse(
    readFileSync(join(APP_ROOT, '_locales/en/messages.json'), 'utf8'),
  ) as Record<string, { message: string }>;
  const listing = readFileSync(join(APP_ROOT, 'docs/chrome-web-store-listing.md'), 'utf8');

  function menuTitles(): string[] {
    const start = background.indexOf('const CONTEXT_MENU_ITEMS');
    expect(start, 'CONTEXT_MENU_ITEMS was not found in background.ts').toBeGreaterThan(-1);
    const block = background.slice(start, background.indexOf('];', start));
    const keys = [...block.matchAll(/title: t\('([A-Za-z0-9]+)'\)/g)].map((match) => match[1]!);
    expect(keys.length).toBeGreaterThan(0);
    return keys.map((key) => {
      const entry = catalog[key];
      expect(entry, `${key} has no English message`).toBeDefined();
      return entry!.message.replace('%s', '…');
    });
  }

  it('names every right-click entry in the contextMenus justification', () => {
    const row = listing.split('\n').find((line) => line.startsWith('| `contextMenus`'));
    expect(row, 'the listing has no contextMenus justification row').toBeDefined();
    const missing = menuTitles().filter((title) => !row!.includes(title));
    expect(missing).toEqual([]);
  });

  it('describes the rewrite and local-app entries in the detailed description', () => {
    expect(listing).toContain('Rewrite selection');
    expect(listing).toContain('Send selected text to a local app');
  });
});
