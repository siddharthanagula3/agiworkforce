import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  EMBEDDED_PAGE_PARAM,
  EMBEDDED_PAGE_PARAM_VALUE,
  isEmbeddableAccountPagePath,
  isEmbeddablePagePath,
} from '@agiworkforce/types';

const mockOpenBrowserAsync = jest.fn();
const mockOpenURL = jest.fn();
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));
jest.mock('expo-linking', () => ({ openURL: (...args: unknown[]) => mockOpenURL(...args) }));

import { API_URL } from '@/lib/constants';
import {
  openWebAccountPage,
  openWebContentPage,
  webAccountPageUrl,
  webContentPageUrl,
} from '@/src/platform/webContentPage';

const mobileRoot = join(__dirname, '..');
const SOURCE_ROOTS = ['app', 'components', 'hooks', 'lib', 'services', 'src', 'stores'];
const RAW_OPENER =
  /\b(openExternalUrl|openInAppBrowser|openUntrustedUrlInAppBrowser|Linking\.openURL)\(/g;
const MARKER = `${EMBEDDED_PAGE_PARAM}=${EMBEDDED_PAGE_PARAM_VALUE}`;
const WEB_BILLING_ONLY_LINKS: ReadonlySet<string> = new Set(['PURCHASE_HELP_URL']);

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    if (entry === 'node_modules' || entry === '__tests__') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const files = SOURCE_ROOTS.flatMap((root) => sourceFiles(join(mobileRoot, root)));
const sources = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]));

function constantValues(): Map<string, string> {
  const values = new Map<string, string>();
  for (const source of sources.values()) {
    for (const match of source.matchAll(
      /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*(?:new URL\(\s*)?['`]([^'`]*)['`]/g,
    )) {
      values.set(match[1] ?? '', match[2] ?? '');
    }
  }
  return values;
}

function openerArgument(source: string, start: number): string {
  let depth = 1;
  let index = start;
  while (index < source.length && depth > 0) {
    const char = source[index];
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    index += 1;
  }
  return source.slice(start, index - 1);
}

function contentPathsIn(argument: string, constants: Map<string, string>): string[] {
  const resolved = argument.replace(/\b[A-Z][A-Z0-9_]*\b/g, (name) => constants.get(name) ?? name);
  const paths: string[] = [];
  for (const match of resolved.matchAll(/agiworkforce\.com(\/[A-Za-z0-9/_-]*)?/g)) {
    paths.push(match[1] ?? '/');
  }
  for (const match of resolved.matchAll(/(?:new URL\(\s*|\}\s*)['`]?(\/[A-Za-z0-9/_-]*)/g)) {
    paths.push(match[1] ?? '/');
  }
  return paths.filter(
    (path) => path === '/' || isEmbeddablePagePath(path) || isEmbeddableAccountPagePath(path),
  );
}

function rawOpenerOffenders(
  source: string,
  constants: Map<string, string>,
  label: string,
): string[] {
  const offenders: string[] = [];
  for (const match of source.matchAll(RAW_OPENER)) {
    const argument = openerArgument(source, (match.index ?? 0) + match[0].length);
    if (WEB_BILLING_ONLY_LINKS.has(argument.trim())) continue;
    for (const path of contentPathsIn(argument, constants)) offenders.push(`${label}: ${path}`);
  }
  return offenders;
}

beforeEach(() => {
  mockOpenBrowserAsync.mockReset().mockResolvedValue({ type: 'dismiss' });
  mockOpenURL.mockReset().mockResolvedValue(true);
});

describe('web content pages opened from the app', () => {
  it('marks a site path with the shared embedded-page parameter', () => {
    expect(webContentPageUrl('/terms')).toBe(`${new URL('/terms', API_URL).toString()}?${MARKER}`);
  });

  it('keeps the query a page already carries and marks absolute site addresses', () => {
    const url = new URL(webContentPageUrl('https://agiworkforce.com/help?q=permissions'));
    expect(url.host).toBe('agiworkforce.com');
    expect(url.pathname).toBe('/help');
    expect(url.searchParams.get('q')).toBe('permissions');
    expect(url.searchParams.get(EMBEDDED_PAGE_PARAM)).toBe(EMBEDDED_PAGE_PARAM_VALUE);
  });

  it('opens the marked page in the in-app browser sheet', async () => {
    await expect(openWebContentPage('https://agiworkforce.com/privacy')).resolves.toBe(true);
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
      `https://agiworkforce.com/privacy?${MARKER}`,
      expect.objectContaining({ presentationStyle: 'pageSheet' }),
    );
  });

  it('refuses a host outside the reviewed list instead of marking it', async () => {
    await expect(openWebContentPage('https://attacker.example/terms')).resolves.toBe(false);
    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
  });

  it('opens no site content page, account page or homepage without the marker helper', () => {
    const constants = constantValues();
    const offenders: string[] = [];
    for (const [file, source] of sources) {
      if (file.endsWith(join('src', 'platform', 'webContentPage.ts'))) continue;
      offenders.push(
        ...rawOpenerOffenders(source, constants, relative(mobileRoot, file).split(sep).join('/')),
      );
    }
    expect(offenders).toEqual([]);
  });

  it('flags a raw opener of an account page, by literal or by constant', () => {
    const constants = new Map([['WEB_SECURITY_URL', 'https://agiworkforce.com/settings/security']]);
    const source = [
      "void openExternalUrl('https://agiworkforce.com/settings/account');",
      'void openInAppBrowser(WEB_SECURITY_URL);',
      "void openInAppBrowser(new URL('/settings/security', API_URL).toString());",
    ].join('\n');
    expect(rawOpenerOffenders(source, constants, 'sample')).toEqual([
      'sample: /settings/account',
      'sample: /settings/security',
      'sample: /settings/security',
    ]);
  });

  it('marks the account and security pages and nothing else as account pages', () => {
    expect(webAccountPageUrl('https://agiworkforce.com/settings/account')).toBe(
      `https://agiworkforce.com/settings/account?${MARKER}`,
    );
    expect(webAccountPageUrl('/settings/security')).toBe(
      `${new URL('/settings/security', API_URL).toString()}?${MARKER}`,
    );
    for (const path of ['/settings/billing', '/settings/usage', '/upgrade', '/pricing', '/chat']) {
      expect([path, webAccountPageUrl(path)]).toEqual([path, null]);
    }
  });

  it('opens a marked account page in the in-app sheet, or the system browser when asked', async () => {
    await expect(openWebAccountPage('https://agiworkforce.com/settings/security')).resolves.toBe(
      true,
    );
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
      `https://agiworkforce.com/settings/security?${MARKER}`,
      expect.objectContaining({ presentationStyle: 'pageSheet' }),
    );

    await expect(
      openWebAccountPage('https://agiworkforce.com/settings/account', 'system'),
    ).resolves.toBe(true);
    expect(mockOpenURL).toHaveBeenCalledWith(`https://agiworkforce.com/settings/account?${MARKER}`);
  });

  it('refuses to open a settings page that is not an account page', async () => {
    await expect(openWebAccountPage('https://agiworkforce.com/settings/billing')).resolves.toBe(
      false,
    );
    await expect(openWebAccountPage('/upgrade', 'system')).resolves.toBe(false);
    await expect(openWebAccountPage('https://attacker.example/settings/account')).resolves.toBe(
      false,
    );
    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it('spells the marker only through the shared constant', () => {
    const handWritten = [...sources]
      .filter(([, source]) => source.includes(MARKER))
      .map(([file]) => relative(mobileRoot, file));
    expect(handWritten).toEqual([]);
  });

  it('routes every legal, help, status and account link the app shows through the helper', () => {
    const openers = [
      'app/(app)/about.tsx',
      'app/(auth)/login.tsx',
      'services/providerConsent.ts',
      'services/termsNotice.ts',
      'services/notifications.ts',
      'src/features/auth/components/MobileSignUp.tsx',
      'src/features/auth/components/authErrorMessage.ts',
      'src/features/companion/components/PairingRiskDisclosure.tsx',
      'src/features/onboarding/components/FirstRunDisclosureModal.tsx',
      'src/features/release-state/releaseUpdateNotice.ts',
      'src/features/service-notices/service.ts',
      'src/features/settings/cloud-privacy/NamedProviderConsentModal.tsx',
      'src/features/settings/cloud-privacy/index.tsx',
      'src/features/settings/index.tsx',
      'src/features/settings/permissions/index.tsx',
      'src/features/settings/personalization/index.tsx',
      'src/features/support/HelpArticleLink.tsx',
      'src/features/settings/account-security/index.tsx',
      'src/features/settings/account-security/WorkspaceMfaBanner.tsx',
      'src/features/settings/cloud-account/index.tsx',
    ];
    for (const file of openers) {
      const source = sources.get(join(mobileRoot, file)) ?? '';
      expect([file, /from '@\/src\/platform\/webContentPage'/.test(source)]).toEqual([file, true]);
    }
  });
});
