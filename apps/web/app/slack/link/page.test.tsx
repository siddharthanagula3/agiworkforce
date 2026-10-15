import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import SlackLinkPage from './page';

const userState = vi.hoisted(() => ({ isLoaded: true, isSignedIn: false }));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: userState.isLoaded, isSignedIn: userState.isSignedIn, user: null }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'token' ? 'slk_link' : null) }),
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
  Header: () => <header>Header</header>,
}));

vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => <footer>Footer</footer>,
}));

describe('/slack/link page', () => {
  beforeEach(() => {
    userState.isLoaded = true;
    userState.isSignedIn = false;
  });

  it('offers a signed-out Slack user an account beside sign-in, both returning to the link', () => {
    render(<SlackLinkPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sign in to the AGI Workforce account Slack should answer as. Sign in or create an account.',
    );
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?redirectTo=%2Fslack%2Flink%3Ftoken%3Dslk_link',
    );
    expect(screen.getByRole('link', { name: 'create an account' })).toHaveAttribute(
      'href',
      '/signup?redirectTo=%2Fslack%2Flink%3Ftoken%3Dslk_link',
    );
  });
});
