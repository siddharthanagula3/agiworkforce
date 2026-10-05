import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
type IdentityModule = typeof import('@/lib/server/identity');
type NavigationModule = typeof import('next/navigation');

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }) }));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
  useClerk: () => ({ signOut: vi.fn(), openUserProfile: vi.fn() }),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<NavigationModule>()),
  useRouter: () => mocks.router,
}));

vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal<IdentityModule>()),
  getRequestIdentity: () => mocks.identity(),
}));

vi.mock('@/features/settings/components/SettingsModalRedirect', () => ({
  SettingsModalRedirect: ({ section }: { section: string }) => (
    <div data-testid="settings-redirect">{section}</div>
  ),
}));

import AppsPage from '../page';

beforeEach(() => {
  mocks.identity.mockReset();
  mocks.router.replace.mockReset();
  mocks.router.push.mockReset();
});

/**
 * /apps is the highest-priority indexed route of the three (0.9) and had the
 * same defect /skills did: render null, replace the location with /login.
 */
describe('/apps for a signed-out visitor', () => {
  it('says what an app is instead of rendering nothing', async () => {
    mocks.identity.mockResolvedValue({ subject: null, isSignedIn: false });

    render(await AppsPage());

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/apps connect/i);
    expect(screen.getByText(/bundles the commands, skills and connections/i)).toBeTruthy();
  });

  it('offers the sign-in with a return path back here', async () => {
    mocks.identity.mockResolvedValue({ subject: null, isSignedIn: false });

    render(await AppsPage());

    const signIn = screen.getByText('Sign in to browse apps').closest('a');
    expect(signIn?.getAttribute('href')).toBe('/login?redirectTo=%2Fapps');
  });

  it('offers the sign-in rather than performing it: the mounted page navigates nowhere', async () => {
    mocks.identity.mockResolvedValue({ subject: null, isSignedIn: false });

    render(await AppsPage());

    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it('opens the plugins surface once signed in', async () => {
    mocks.identity.mockResolvedValue({ subject: 'user_1', isSignedIn: true });

    render(await AppsPage());

    expect(screen.getByTestId('settings-redirect')).toHaveTextContent('plugins');
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });
});
