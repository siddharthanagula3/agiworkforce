import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const authState = { isSignedIn: false, isLoaded: true };

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => authState,
}));

vi.mock('@/features/settings/components/SettingsModalRedirect', () => ({
  SettingsModalRedirect: ({ section }: { section: string }) => (
    <div data-testid="settings-redirect">{section}</div>
  ),
}));

import SkillsPage from '../page';

/**
 * /skills is sitemap-indexed at 0.8 and is the CTA target of two marketing
 * pages, but it rendered null and bounced anonymous visitors to /login. A
 * person who clicked "Browse Skills" got a blank frame and a redirect that
 * never said what the page was.
 */
describe('/skills for a signed-out visitor', () => {
  it('explains what the page is instead of rendering nothing', async () => {
    authState.isSignedIn = false;
    authState.isLoaded = true;

    render(<SkillsPage />);

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/skills/i);
    expect(screen.getByText(/reusable instruction set/i)).toBeTruthy();
  });

  it('offers the sign-in rather than performing it', async () => {
    authState.isSignedIn = false;

    render(<SkillsPage />);

    const signIn = await screen.findByRole('link', { name: /sign in to browse skills/i });
    expect(signIn.getAttribute('href')).toBe('/login?redirectTo=%2Fskills');
  });

  it('still opens the settings surface once signed in', async () => {
    authState.isSignedIn = true;

    render(<SkillsPage />);

    expect(await screen.findByTestId('settings-redirect')).toHaveTextContent('skills');
  });
});
