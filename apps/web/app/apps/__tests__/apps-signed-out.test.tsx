import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const authState = { isSignedIn: false, isLoaded: true };

vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }) }));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => authState,
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
  useClerk: () => ({ signOut: vi.fn(), openUserProfile: vi.fn() }),
}));

vi.mock('@/features/settings/components/SettingsModalRedirect', () => ({
  SettingsModalRedirect: ({ section }: { section: string }) => (
    <div data-testid="settings-redirect">{section}</div>
  ),
}));

import AppsPage from '../page';

/**
 * /apps is the highest-priority indexed route of the three (0.9) and had the
 * same defect /skills did: render null, replace the location with /login.
 */
describe('/apps for a signed-out visitor', () => {
  it('says what an app is instead of rendering nothing', async () => {
    authState.isSignedIn = false;
    authState.isLoaded = true;

    render(<AppsPage />);

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/apps connect/i);
    expect(screen.getByText(/bundles the commands, skills and connections/i)).toBeTruthy();
  });

  it('offers the sign-in with a return path back here', async () => {
    authState.isSignedIn = false;

    render(<AppsPage />);

    const signIn = await screen.findByRole('link', { name: /sign in to browse apps/i });
    expect(signIn.getAttribute('href')).toBe('/login?redirectTo=%2Fapps');
  });

  it('opens the plugins surface once signed in', async () => {
    authState.isSignedIn = true;

    render(<AppsPage />);

    expect(await screen.findByTestId('settings-redirect')).toHaveTextContent('plugins');
  });
});
