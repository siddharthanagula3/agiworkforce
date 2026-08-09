import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const useAuth = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs', () => ({ useAuth }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
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

  it('sends a signed-out visitor to sign-in with /apps as the return path', () => {
    useAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });

    render(<AppsPage />);

    expect(replace).toHaveBeenCalledWith('/login?redirectTo=%2Fapps');
  });

  it('never bounces a signed-out visitor back to the page whose CTA sent them here', () => {
    // /integrations' primary CTA points at /apps. If /apps answered a signed-out
    // visitor by replacing with /integrations, the button would be a closed
    // loop: /integrations -> /apps -> /integrations, rendering null in between.
    useAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });

    render(<AppsPage />);

    const integrationsSource = readFileSync(
      join(__dirname, '..', 'integrations', 'page.tsx'),
      'utf8',
    );
    expect(integrationsSource).toContain('href="/apps"');

    for (const call of replace.mock.calls) {
      expect(String(call[0]).startsWith('/integrations')).toBe(false);
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
