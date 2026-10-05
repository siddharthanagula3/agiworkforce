import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
type ScanModule0 = typeof import('@/lib/services/skill-catalog-service');
type LoggerModule = typeof import('@/lib/logger');
type IdentityModule = typeof import('@/lib/server/identity');

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  getManagedSkillCatalog: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const SIGNED_OUT = { subject: null, isSignedIn: false };
const SIGNED_IN = { subject: 'user_1', isSignedIn: true };
const SIGN_IN_HREF = '/login?redirectTo=%2Fskills';

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
    <div data-testid="settings-redirect" data-section={section} />
  ),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/skill-catalog-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getManagedSkillCatalog: mocks.getManagedSkillCatalog,
}));

import SkillsPage from '../page';

async function firstResponse(): Promise<HTMLElement> {
  const body = document.createElement('div');
  body.innerHTML = renderToString(await SkillsPage());
  return body;
}

beforeEach(() => {
  mocks.identity.mockReset();
  mocks.logger.error.mockReset();
  mocks.getManagedSkillCatalog.mockReset();
  mocks.getManagedSkillCatalog.mockResolvedValue([
    { name: 'review-checklist', description: 'Walks a change through a review checklist.' },
  ]);
});

/**
 * /skills is sitemap-indexed at 0.8 and is the CTA target of two marketing
 * pages, but it rendered null and bounced anonymous visitors to /login. A
 * person who clicked "Browse skills" got a blank frame and a redirect that
 * never said what the page was.
 */
describe('/skills is decided on the server', () => {
  it('puts the signed-out explanation and the sign-in link in the first response, before any identity script has loaded', async () => {
    mocks.identity.mockResolvedValue(SIGNED_OUT);

    const body = await firstResponse();

    expect(body.querySelector('h1')?.textContent).toBe('Skills live in your workspace');
    expect(body.textContent).toContain('reusable instruction set');
    expect(body.querySelector(`a[href="${SIGN_IN_HREF}"]`)?.textContent).toBe(
      'Sign in to use skills',
    );
    expect(body.querySelector('main a[href="/features/plugins"]')?.textContent).toBe(
      'What plugins can do',
    );
    expect(body.querySelector('[data-testid="settings-redirect"]')).toBeNull();
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it('lists the built-in skills a visitor can expect before signing in', async () => {
    mocks.identity.mockResolvedValue(SIGNED_OUT);

    const body = await firstResponse();

    expect(body.textContent).toContain('review-checklist');
    expect(body.textContent).toContain('Walks a change through a review checklist.');
    expect(body.querySelector('[role="status"]')).toBeNull();
  });

  it('says so when the skill catalogue cannot be read, and still serves the page', async () => {
    mocks.identity.mockResolvedValue(SIGNED_OUT);
    mocks.getManagedSkillCatalog.mockRejectedValue(new Error('catalogue offline'));

    const body = await firstResponse();

    expect(body.querySelector('[role="status"]')?.textContent).toMatch(/temporarily unreachable/i);
    expect(body.querySelector('h1')?.textContent).toBe('Skills live in your workspace');
    expect(body.querySelector(`a[href="${SIGN_IN_HREF}"]`)).not.toBeNull();
  });

  it('opens the skills section of the settings modal for a signed-in account, and none of the signed-out page', async () => {
    mocks.identity.mockResolvedValue(SIGNED_IN);

    const body = await firstResponse();

    expect(
      body.querySelector('[data-testid="settings-redirect"]')?.getAttribute('data-section'),
    ).toBe('skills');
    expect(body.querySelector('h1')).toBeNull();
    expect(body.querySelector('a[href^="/login"]')).toBeNull();
    expect(mocks.getManagedSkillCatalog).not.toHaveBeenCalled();
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
    'serves the signed-out page with its skill list, not an empty or failed one, when the identity read %s, and logs it once',
    async (_, fail) => {
      const failure = new Error('identity unreachable');
      fail(failure);

      const body = await firstResponse();

      expect(body.querySelector('h1')?.textContent).toBe('Skills live in your workspace');
      expect(body.querySelector(`a[href="${SIGN_IN_HREF}"]`)).not.toBeNull();
      expect(body.textContent).toContain('review-checklist');
      expect(mocks.logger.error).toHaveBeenCalledTimes(1);
      expect(mocks.logger.error).toHaveBeenCalledWith(
        { error: failure, route: '/skills' },
        expect.stringContaining('Identity could not be read'),
      );
    },
  );

  it('is a server component with no client wrapper waiting on browser identity state', () => {
    const source = readFileSync(join(__dirname, '..', 'page.tsx'), 'utf8');

    expect(source).not.toMatch(/^['"]use client['"]/mu);
    expect(source).not.toContain('@/lib/identity/client');
    expect(existsSync(join(__dirname, '..', 'SkillsRoute.tsx'))).toBe(false);
  });
});
