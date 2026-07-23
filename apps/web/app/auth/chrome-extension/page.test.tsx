import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import ChromeExtensionAuthCompletePage from './page';

const authState = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: true,
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => authState,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@shared/components/layout/Header', () => ({
  Header: ({ minimal }: { minimal?: boolean }) => (
    <header data-testid="header" data-minimal={String(minimal ?? false)}>
      Header
    </header>
  ),
}));

vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => <footer>Footer</footer>,
}));

describe('/auth/chrome-extension page', () => {
  beforeEach(() => {
    authState.isLoaded = true;
    authState.isSignedIn = true;
  });

  it('confirms the synced web session and tells the user how to refresh the side panel', () => {
    render(<ChromeExtensionAuthCompletePage />);

    expect(screen.getByRole('heading', { name: 'Chrome is connected.' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('session is ready');
    expect(screen.getByText(/close and reopen the AGI side panel/i)).toBeInTheDocument();
    expect(screen.getByTestId('header')).toHaveAttribute('data-minimal', 'true');
  });

  it('sends signed-out users through the web login and back to the completion page', () => {
    authState.isSignedIn = false;
    render(<ChromeExtensionAuthCompletePage />);

    expect(screen.getByRole('alert')).toHaveTextContent('OAuth');
    expect(screen.getByRole('link', { name: 'Sign in to AGI Cloud' })).toHaveAttribute(
      'href',
      '/login?redirectTo=%2Fauth%2Fchrome-extension',
    );
  });

  it('shows a bounded loading state while Clerk initializes', () => {
    authState.isLoaded = false;
    authState.isSignedIn = false;
    render(<ChromeExtensionAuthCompletePage />);

    expect(screen.getByRole('status')).toHaveTextContent('Checking your AGI Cloud session');
  });
});
