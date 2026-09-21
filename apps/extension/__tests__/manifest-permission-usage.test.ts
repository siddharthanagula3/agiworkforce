/**
 * Chrome shows the install warning for a permission whether or not anything
 * calls it, so a permission nobody uses costs the user trust and buys nothing.
 * These walk the manifest and the source in both directions: every declared
 * permission has to be spent somewhere, and every API the source reaches for
 * has to be declared.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const manifest = JSON.parse(readFileSync(join(APP_ROOT, 'manifest.json'), 'utf8')) as {
  permissions: string[];
  optional_permissions?: string[];
};

const packageJson = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.(ts|js)$/u.test(entry.name) && !/\.d\.ts$/u.test(entry.name)) out.push(full);
    }
  };
  walk(join(APP_ROOT, 'src'));
  return out;
}

const SOURCES = sourceFiles().map((file) => ({
  path: relative(APP_ROOT, file),
  text: readFileSync(file, 'utf8'),
}));

/**
 * What a declared permission is spent on. `api` is a namespace this source
 * calls; `viaDependency` is a package that calls it for us through the
 * WebExtension polyfill, which no grep of our own source would find.
 */
interface PermissionEvidence {
  readonly api?: string;
  readonly viaDependency?: string;
  readonly grants?: readonly string[];
}

const PERMISSION_EVIDENCE: Readonly<Record<string, PermissionEvidence>> = {
  // activeTab has no namespace of its own: it is the user-gesture grant that
  // lets the two namespaces below touch the focused tab without host access.
  activeTab: { grants: ['chrome.tabs', 'chrome.scripting'] },
  tabs: { api: 'chrome.tabs' },
  storage: { api: 'chrome.storage' },
  nativeMessaging: { api: 'chrome.runtime.connectNative' },
  alarms: { api: 'chrome.alarms' },
  contextMenus: { api: 'chrome.contextMenus' },
  sidePanel: { api: 'chrome.sidePanel' },
  scripting: { api: 'chrome.scripting' },
  cookies: { viaDependency: '@clerk/chrome-extension' },
  notifications: { api: 'chrome.notifications' },
  tabGroups: { api: 'chrome.tabGroups' },
  debugger: { api: 'chrome.debugger' },
  downloads: { api: 'chrome.downloads' },
};

/** Namespaces Chrome exposes to every extension without a permission. */
const PERMISSION_FREE_NAMESPACES: ReadonlySet<string> = new Set([
  'runtime',
  'i18n',
  'action',
  'commands',
  'permissions',
  'extension',
  'windows',
]);

const NAMESPACE_BY_PERMISSION: Readonly<Record<string, string>> = {
  tabs: 'tabs',
  storage: 'storage',
  alarms: 'alarms',
  contextMenus: 'contextMenus',
  sidePanel: 'sidePanel',
  scripting: 'scripting',
  cookies: 'cookies',
  notifications: 'notifications',
  tabGroups: 'tabGroups',
  debugger: 'debugger',
  downloads: 'downloads',
};

function usesApi(api: string): boolean {
  return SOURCES.some((source) => source.text.includes(api));
}

function importsDependency(name: string): boolean {
  return SOURCES.some((source) => source.text.includes(`from '${name}`));
}

/**
 * `chrome.foo` occurrences that are a real member access. The lookbehind drops
 * `agi.chrome.chat.` and `https://chrome.google.com`, which are strings.
 */
function referencedNamespaces(): Map<string, string> {
  const found = new Map<string, string>();
  for (const source of SOURCES) {
    for (const match of source.text.matchAll(
      /(?<![\w./-])chrome\.([a-zA-Z][a-zA-Z0-9]*)\s*[.?[(]/gu,
    )) {
      const namespace = match[1] as string;
      if (!found.has(namespace)) found.set(namespace, source.path);
    }
  }
  return found;
}

describe('every permission the manifest declares is spent', () => {
  it('accounts for each declared permission', () => {
    const unaccounted = manifest.permissions.filter(
      (permission) => !(permission in PERMISSION_EVIDENCE),
    );
    expect(unaccounted).toEqual([]);
  });

  it.each(manifest.permissions)('%s is used by something that ships', (permission) => {
    const evidence = PERMISSION_EVIDENCE[permission] as PermissionEvidence;

    if (evidence.api) {
      expect(usesApi(evidence.api), `nothing in src calls ${evidence.api}`).toBe(true);
      return;
    }
    if (evidence.viaDependency) {
      expect(packageJson.dependencies[evidence.viaDependency]).toBeDefined();
      expect(
        importsDependency(evidence.viaDependency),
        `nothing in src imports ${evidence.viaDependency}`,
      ).toBe(true);
      return;
    }
    for (const granted of evidence.grants ?? []) {
      expect(usesApi(granted), `nothing in src calls ${granted}`).toBe(true);
    }
  });
});

describe('every API the source reaches for is declared', () => {
  it('names no chrome namespace the manifest has not paid for', () => {
    const declared = new Set(
      manifest.permissions
        .map((permission) => NAMESPACE_BY_PERMISSION[permission])
        .filter((namespace): namespace is string => Boolean(namespace)),
    );

    const undeclared = [...referencedNamespaces()].filter(
      ([namespace]) => !declared.has(namespace) && !PERMISSION_FREE_NAMESPACES.has(namespace),
    );

    expect(undeclared.map(([namespace, path]) => `${namespace} (${path})`)).toEqual([]);
  });
});

describe('browsing history stays out of reach', () => {
  it('declares no history permission, so Chrome refuses the API', () => {
    expect(manifest.permissions).not.toContain('history');
    expect(manifest.optional_permissions ?? []).not.toContain('history');
  });

  it('calls no history or bookmarks API, so page context can only come from a live tab', () => {
    for (const source of SOURCES) {
      expect(source.text, `${source.path} reaches for browsing history`).not.toMatch(
        /\bchrome\.(history|bookmarks|topSites)\b/u,
      );
    }
  });
});
