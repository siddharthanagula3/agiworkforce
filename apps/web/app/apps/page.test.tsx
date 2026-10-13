import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONNECTORS_COMING_SOON_DETAIL,
  connectorsReleased,
  type PluginRegistryEntry,
} from '@agiworkforce/types';
type LoggerModule = typeof import('@/lib/logger');
type IdentityModule = typeof import('@/lib/server/identity');

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  loadPluginCatalog: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const CATALOGUE_ENTRY: PluginRegistryEntry = {
  id: 'github-automation',
  name: 'GitHub Automation',
  version: '1.0.0',
  description: 'Automate pull request reviews.',
  category: 'Developer',
  publisher: { id: 'agi', name: 'AGI', kind: 'first-party' },
  source: 'builtin',
  status: 'preview',
  webInstallable: false,
  declaredSkills: ['Code Review'],
  requiredConnectors: ['github'],
  capabilities: ['connectors'],
  permissions: [],
  examplePrompts: [],
  versions: [],
  distribution: null,
  integrity: { sha256: null, signature: null, signatureAlgorithm: null },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const SIGNED_OUT = { subject: null, isSignedIn: false };
const SIGNED_IN = { subject: 'user_1', isSignedIn: true };

vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }) }));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: false, isSignedIn: false }),
  useUser: () => ({ isLoaded: false, isSignedIn: false, user: null }),
  useClerk: () => ({ signOut: vi.fn(), openUserProfile: vi.fn() }),
}));

vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal<IdentityModule>()),
  getRequestIdentity: () => mocks.identity(),
}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: mocks.logger,
}));

vi.mock('@/features/settings/components/SettingsModalRedirect', () => ({
  SettingsModalRedirect: ({ section }: { section: string }) => (
    <div data-testid="settings-modal-redirect" data-section={section} />
  ),
}));

vi.mock('@/features/plugins/server/registry-source', () => ({
  detailInstallCommand: vi.fn(),
  entryReaderCountForTests: vi.fn(),
  loadPluginCatalog: mocks.loadPluginCatalog,
  loadPluginEntry: vi.fn(),
  loadPluginReleaseHistory: vi.fn(),
}));

import AppsPage from './page';

async function firstResponse(): Promise<HTMLElement> {
  const body = document.createElement('div');
  body.innerHTML = renderToString(await AppsPage());
  return body;
}

beforeEach(() => {
  mocks.identity.mockReset();
  mocks.logger.error.mockReset();
  mocks.loadPluginCatalog.mockReset();
  mocks.loadPluginCatalog.mockResolvedValue({ status: 'ok', entries: [CATALOGUE_ENTRY] });
});

describe('/apps is decided on the server', () => {
  it('puts the signed-out explanation and the sign-in link in the first response, before any identity script has loaded', async () => {
    mocks.identity.mockResolvedValue(SIGNED_OUT);

    const body = await firstResponse();

    expect(body.querySelector('h1')?.textContent).toBe('Apps are packs you install into AGI');
    expect(body.textContent).toContain('An app is a pack you install into the assistant.');
    expect(body.querySelector('a[href="/login?redirectTo=%2Fapps"]')?.textContent).toBe(
      'Sign in to install apps',
    );
    expect(body.querySelector('main a[href="/features/plugins"]')?.textContent).toBe(
      'How apps and plugins work',
    );
    expect(body.querySelector('[data-testid="settings-modal-redirect"]')).toBeNull();
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it('says what installing an app does today, and promises no connection while connectors are unreleased', async () => {
    mocks.identity.mockResolvedValue(SIGNED_OUT);

    const page = (await firstResponse()).textContent ?? '';

    expect(page).toContain(
      'On the web, installing one adds the skills it declares and connects no service by itself.',
    );
    expect(page).not.toContain('read from it and act in it');
    expect(page).not.toContain('connections for one service');
    expect(page.includes(CONNECTORS_COMING_SOON_DETAIL)).toBe(!connectorsReleased());
  });

  it('lists the public catalogue under the explanation, each app linked to its own page', async () => {
    mocks.identity.mockResolvedValue(SIGNED_OUT);

    const body = await firstResponse();

    const catalogue = body.querySelector('#apps-catalogue');
    expect(catalogue?.querySelector('h3 a[href="/plugins/github-automation"]')?.textContent).toBe(
      'GitHub Automation',
    );
    expect(catalogue?.textContent).toContain('Automate pull request reviews.');
    expect(catalogue?.textContent).toContain('Declared: not installable yet');
    expect(catalogue?.querySelector('a[href="/plugins"]')).not.toBeNull();
    expect(body.textContent).not.toContain('the directory needs you signed in');
  });

  it('says the registry is unreachable instead of showing an empty catalogue', async () => {
    mocks.identity.mockResolvedValue(SIGNED_OUT);
    mocks.loadPluginCatalog.mockResolvedValue({ status: 'unavailable' });

    const body = await firstResponse();

    expect(body.querySelector('[role="status"]')?.textContent).toMatch(/unreachable right now/);
    expect(body.querySelector('#apps-catalogue h3')).toBeNull();
    expect(body.querySelector('h1')?.textContent).toBe('Apps are packs you install into AGI');
  });

  it('says the registry holds no packs when it is empty', async () => {
    mocks.identity.mockResolvedValue(SIGNED_OUT);
    mocks.loadPluginCatalog.mockResolvedValue({ status: 'ok', entries: [] });

    const body = await firstResponse();

    expect(body.querySelector('[role="status"]')?.textContent).toBe(
      'The registry holds no packs yet.',
    );
    expect(body.querySelector('#apps-catalogue h3')).toBeNull();
  });

  it('never sends a signed-out visitor back to /integrations, whose hero now opens the public directory', async () => {
    mocks.identity.mockResolvedValue(SIGNED_OUT);

    const body = await firstResponse();

    const integrationsSource = readFileSync(
      join(__dirname, '..', 'integrations', 'page.tsx'),
      'utf8',
    );
    expect(integrationsSource).toContain("href: '/connectors/mcp-directory'");
    expect(integrationsSource).not.toContain("href: '/apps'");

    const pageLinks = [...body.querySelectorAll('main a')];
    expect(pageLinks.length).toBeGreaterThan(0);
    for (const link of pageLinks) {
      expect(link.getAttribute('href')?.startsWith('/integrations')).toBeFalsy();
    }
  });

  it('opens the plugins section of the settings modal for a signed-in account, and none of the signed-out page', async () => {
    mocks.identity.mockResolvedValue(SIGNED_IN);

    const body = await firstResponse();

    expect(
      body.querySelector('[data-testid="settings-modal-redirect"]')?.getAttribute('data-section'),
    ).toBe('plugins');
    expect(body.querySelector('h1')).toBeNull();
    expect(body.querySelector('a[href^="/login"]')).toBeNull();
    expect(mocks.loadPluginCatalog).not.toHaveBeenCalled();
  });

  it.each<[string, (failure: Error) => void]>([
    ['rejects', (failure) => mocks.identity.mockRejectedValue(failure)],
    [
      'throws before it starts',
      (failure) =>
        mocks.identity.mockImplementation(() => {
          throw failure;
        }),
    ],
  ])(
    'serves the signed-out page, not an empty or failed one, when the identity read %s, and logs it once',
    async (_, fail) => {
      const failure = new Error('identity unreachable');
      fail(failure);

      const body = await firstResponse();

      expect(body.querySelector('h1')?.textContent).toBe('Apps are packs you install into AGI');
      expect(body.querySelector('a[href="/login?redirectTo=%2Fapps"]')).not.toBeNull();
      expect(mocks.logger.error).toHaveBeenCalledTimes(1);
      expect(mocks.logger.error).toHaveBeenCalledWith(
        { error: failure, route: '/apps' },
        expect.stringContaining('Identity could not be read'),
      );
    },
  );

  it('is a server component that waits on no browser identity state', () => {
    const source = readFileSync(join(__dirname, 'page.tsx'), 'utf8');

    expect(source).not.toMatch(/^['"]use client['"]/mu);
    expect(source).not.toContain('@/lib/identity/client');
    expect(source).not.toMatch(/return null\b/u);
  });
});
