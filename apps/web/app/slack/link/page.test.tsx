import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      'Sign in to the AGI account Slack should answer as. Sign in or create an account.',
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

  describe('signed in', () => {
    const preview = {
      teamName: 'Acme',
      slackUserName: 'Mallory' as string | null,
      expiresAt: '2026-09-28T01:00:00.000Z',
      workspaces: [{ id: null, name: 'Personal', planAllowed: true }],
      selectedWorkspaceId: null,
      requiredPlans: 'Pro, Max',
    };
    const posts: unknown[] = [];

    beforeEach(() => {
      userState.isSignedIn = true;
      posts.length = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          if (url === '/api/csrf') return Response.json({ token: 'csrf' });
          if (init?.method === 'POST') {
            posts.push(JSON.parse(String(init.body)));
            return Response.json({ linked: true, teamName: 'Acme' });
          }
          return Response.json(preview);
        }),
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('names the Slack account and keeps Connect disabled until the person confirms it is theirs', async () => {
      render(<SlackLinkPage />);

      expect(await screen.findByText('Mallory in Acme')).toBeInTheDocument();
      const connect = screen.getByRole('button', { name: 'Connect Slack account' });
      expect(connect).toHaveAttribute('aria-disabled', 'true');
      expect(connect).toHaveAccessibleDescription('Tick the box above to connect.');
      fireEvent.click(connect);
      expect(posts).toHaveLength(0);

      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'This is my Slack account, and I asked AGI for this link in Slack.',
        }),
      );
      expect(connect).toHaveAttribute('aria-disabled', 'false');
      expect(screen.queryByText('Tick the box above to connect.')).toBeNull();

      fireEvent.click(connect);
      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0]).toMatchObject({ acknowledgedSlackAccount: true });
    });

    it('words an unreadable Slack name as a sentence', async () => {
      preview.slackUserName = null;
      render(<SlackLinkPage />);
      expect(await screen.findByText('A Slack account in Acme')).toBeInTheDocument();
      preview.slackUserName = 'Mallory';
    });
  });
});
