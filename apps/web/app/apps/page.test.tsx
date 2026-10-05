import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
type LoggerModule = typeof import('@/lib/logger');
type IdentityModule = typeof import('@/lib/server/identity');

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

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

import AppsPage from './page';

async function firstResponse(): Promise<HTMLElement> {
  const body = document.createElement('div');
  body.innerHTML = renderToString(await AppsPage());
  return body;
}

beforeEach(() => {
  mocks.identity.mockReset();
  mocks.logger.error.mockReset();
});

describe('/apps is decided on the server', () => {
  it('puts the signed-out explanation and the sign-in link in the first response, before any identity script has loaded', async () => {
    mocks.identity.mockResolvedValue(SIGNED_OUT);

    const body = await firstResponse();

    expect(body.querySelector('h1')?.textContent).toBe(
      'Apps connect AGI to the tools you already use',
    );
    expect(body.textContent).toContain('bundles the commands, skills and connections');
    expect(body.querySelector('a[href="/login?redirectTo=%2Fapps"]')?.textContent).toBe(
      'Sign in to browse apps',
    );
    expect(body.querySelector('main a[href="/features/plugins"]')?.textContent).toBe(
      'How apps and plugins work',
    );
    expect(body.querySelector('[data-testid="settings-modal-redirect"]')).toBeNull();
    expect(mocks.logger.error).not.toHaveBeenCalled();
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

      expect(body.querySelector('h1')?.textContent).toBe(
        'Apps connect AGI to the tools you already use',
      );
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
