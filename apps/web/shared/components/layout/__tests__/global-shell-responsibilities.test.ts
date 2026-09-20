import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const LAYOUT_DIR = path.resolve(__dirname, '..');
const WEB_DIR = path.resolve(LAYOUT_DIR, '../../..');
const APP_DIR = path.join(WEB_DIR, 'app');

const HOSTS = {
  rootLayout: path.join(APP_DIR, 'layout.tsx'),
  providers: path.join(APP_DIR, 'providers.tsx'),
  runtimeMounts: path.join(APP_DIR, 'AppRuntimeMounts.tsx'),
  appShell: path.join(LAYOUT_DIR, 'WebAppShell.tsx'),
  accountMenu: path.join(LAYOUT_DIR, 'AccountMenuItems.tsx'),
  brandRow: path.join(LAYOUT_DIR, 'SidebarBrandRow.tsx'),
} as const;

type HostName = keyof typeof HOSTS;

interface ShellResponsibility {
  concern: string;
  host: HostName;
  symbol: string;
}

const RESPONSIBILITIES: readonly ShellResponsibility[] = [
  { concern: 'current account', host: 'appShell', symbol: 'useCurrentUser' },
  { concern: 'current workspace', host: 'accountMenu', symbol: 'WorkspaceMenuItems' },
  { concern: 'current organization', host: 'appShell', symbol: 'useIsWorkspaceAdmin' },
  { concern: 'current route', host: 'appShell', symbol: 'usePathname' },
  { concern: 'current project', host: 'appShell', symbol: 'useManagedCloudProjects' },
  { concern: 'current conversation', host: 'appShell', symbol: 'useConversations' },
  { concern: 'product capabilities', host: 'providers', symbol: 'CapabilityProvider' },
  { concern: 'user entitlements', host: 'appShell', symbol: 'useBillingStore' },
  { concern: 'effective policies', host: 'appShell', symbol: 'useDisabledWorkspaceFeatures' },
  { concern: 'network status', host: 'runtimeMounts', symbol: 'OfflineIndicator' },
  { concern: 'global notifications', host: 'brandRow', symbol: 'NotificationBell' },
  { concern: 'push notifications', host: 'rootLayout', symbol: 'WebPushOptIn' },
  { concern: 'modal stack', host: 'providers', symbol: 'SettingsModalProvider' },
  { concern: 'toast stack', host: 'providers', symbol: 'SonnerToaster' },
  { concern: 'command palette', host: 'runtimeMounts', symbol: 'CommandPaletteProvider' },
  { concern: 'global search', host: 'appShell', symbol: 'GlobalSearchDialog' },
  { concern: 'help access', host: 'appShell', symbol: 'helpHrefForPath' },
  { concern: 'support access', host: 'providers', symbol: 'SupportWidgetMount' },
  { concern: 'theme', host: 'providers', symbol: 'ThemeProvider' },
  { concern: 'theme before first paint', host: 'rootLayout', symbol: 'THEME_INIT_SCRIPT' },
  { concern: 'locale', host: 'providers', symbol: 'I18nextProvider' },
  { concern: 'accessibility preferences', host: 'runtimeMounts', symbol: 'AppearancePreferences' },
  { concern: 'skip links', host: 'rootLayout', symbol: 'SkipLinks' },
  { concern: 'session expiry', host: 'runtimeMounts', symbol: 'SessionTimeoutGuard' },
] as const;

const sourceCache = new Map<string, string>();

function hostSource(host: HostName): string {
  const file = HOSTS[host];
  const cached = sourceCache.get(file);
  if (cached !== undefined) return cached;
  const source = readFileSync(file, 'utf8');
  sourceCache.set(file, source);
  return source;
}

function importSpecifier(source: string, symbol: string): string | null {
  for (const match of source.matchAll(/import\s+([\s\S]*?)\s+from\s+'([^']+)'/g)) {
    const clause = match[1] ?? '';
    const specifier = match[2] ?? '';
    const named = new RegExp(`(?:^|[{,\\s])${symbol}(?:\\s+as\\s+\\w+)?(?:\\s*[,}]|$)`).test(
      clause,
    );
    const defaultImport = new RegExp(`^(?:type\\s+)?${symbol}\\s*(?:,|$)`).test(clause.trim());
    if (named || defaultImport) return specifier;
  }
  return null;
}

const ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^@shared\//, path.join(WEB_DIR, 'shared') + '/'],
  [/^@features\//, path.join(WEB_DIR, 'features') + '/'],
  [/^@\//, WEB_DIR + '/'],
];

function resolveWorkspaceModule(specifier: string, fromFile: string): string | null {
  let base: string | null = null;
  if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    for (const [pattern, replacement] of ALIASES) {
      if (pattern.test(specifier)) {
        base = specifier.replace(pattern, replacement);
        break;
      }
    }
  }
  if (base === null) return null;
  for (const candidate of [
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, 'index.tsx'),
    path.join(base, 'index.ts'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return '';
}

function usesSymbol(source: string, symbol: string): boolean {
  const withoutImports = source.replace(/import\s+[\s\S]*?\s+from\s+'[^']+';?/g, '');
  return new RegExp(`(?:<${symbol}[\\s/>]|\\b${symbol}\\s*\\(|\\{[^{}]*\\b${symbol}\\b)`).test(
    withoutImports,
  );
}

describe('the global shell owns the state every surface reads from it', () => {
  it('covers the whole set rather than a handful of it', () => {
    expect(RESPONSIBILITIES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(RESPONSIBILITIES.map((r) => r.concern)).size).toBe(RESPONSIBILITIES.length);
  });

  it.each(Object.entries(HOSTS))('%s exists', (_name, file) => {
    expect(existsSync(file), `${file} is missing`).toBe(true);
  });

  it.each(RESPONSIBILITIES.map((r) => [r.concern, r.host, r.symbol]))(
    '%s is provided in %s by %s',
    (_concern, host, symbol) => {
      const source = hostSource(host as HostName);
      const specifier = importSpecifier(source, symbol as string);
      expect(specifier, `${symbol} is not imported by ${HOSTS[host as HostName]}`).not.toBeNull();
      const resolved = resolveWorkspaceModule(specifier as string, HOSTS[host as HostName]);
      expect(resolved, `${specifier} resolves to no file in this workspace`).not.toBe('');
      expect(usesSymbol(source, symbol as string), `${symbol} is imported but never used`).toBe(
        true,
      );
    },
  );

  it('notices a concern whose provider was never wired', () => {
    const source = hostSource('appShell');
    expect(importSpecifier(source, 'AnUnmountedProvider')).toBeNull();
    expect(usesSymbol(source, 'AnUnmountedProvider')).toBe(false);
  });

  it('notices an import that resolves to nothing', () => {
    expect(resolveWorkspaceModule('@shared/components/NotAThing', HOSTS.appShell)).toBe('');
  });
});
