import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const useAuth = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());

vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }) }));

vi.mock('@clerk/nextjs', () => ({
  useAuth,
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
  useClerk: () => ({ signOut: vi.fn(), openUserProfile: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/apps',
}));

vi.mock('@/features/settings/components/SettingsModalRedirect', () => ({
  SettingsModalRedirect: ({ section }: { section: string }) => (
    <div data-testid="settings-modal-redirect" data-section={section} />
  ),
}));

import AppsPage from './page';

describe('/apps navigation', () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it('offers sign-in with /apps as the return path, rather than performing it', () => {
    // /apps is indexed at sitemap priority 0.9. It used to render null and
    // replace the location, so a visitor arriving from a marketing CTA saw a
    // blank frame and a redirect that never said what the page was.
    useAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });

    render(<AppsPage />);

    const signIn = screen.getByRole('link', { name: /sign in to browse apps/i });
    expect(signIn).toHaveAttribute('href', '/login?redirectTo=%2Fapps');
    expect(replace).not.toHaveBeenCalled();
  });

  it('never sends a signed-out visitor back to the page whose CTA sent them here', () => {
    useAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });

    const { container } = render(<AppsPage />);

    const integrationsSource = readFileSync(
      join(__dirname, '..', 'integrations', 'page.tsx'),
      'utf8',
    );
    expect(integrationsSource).toContain("href: '/apps'");

    for (const call of replace.mock.calls) {
      expect(String(call[0]).startsWith('/integrations')).toBe(false);
    }
    const pageLinks = [...container.querySelectorAll('a')].filter(
      (link) => !link.closest('header, footer'),
    );
    for (const link of pageLinks) {
      expect(link.getAttribute('href')?.startsWith('/integrations')).toBeFalsy();
    }
  });

  it('opens the plugins section of the settings modal for a signed-in visitor', () => {
    useAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });

    render(<AppsPage />);

    expect(screen.getByTestId('settings-modal-redirect')).toHaveAttribute(
      'data-section',
      'plugins',
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('renders nothing and navigates nowhere while Clerk is still loading', () => {
    useAuth.mockReturnValue({ isLoaded: false, isSignedIn: false });

    const { container } = render(<AppsPage />);

    expect(container).toBeEmptyDOMElement();
    expect(replace).not.toHaveBeenCalled();
  });
});
