import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const flowProps = vi.hoisted(() => vi.fn());

vi.mock('@/features/auth/AuthFlow', () => ({
  AuthFlow: (props: Record<string, unknown>) => {
    flowProps(props);
    return <div data-testid="auth-flow" />;
  },
}));

vi.mock('@/features/auth/AuthLayout', () => ({
  AuthLayout: ({ embedded, children }: { embedded?: boolean; children: ReactNode }) => (
    <div data-testid="auth-layout" data-embedded={String(embedded ?? false)}>
      {children}
    </div>
  ),
}));

import LoginPage from './page';

function lastRedirects(): Record<string, string> {
  const props = flowProps.mock.lastCall?.[0] as Record<string, unknown>;
  return props['redirects'] as Record<string, string>;
}

describe('/login', () => {
  beforeEach(() => {
    flowProps.mockClear();
  });

  it('mounts the log-in flow without a clickwrap, because terms belong to signup', async () => {
    // Founder decision 2026-08-17. A returning user has already accepted; asking
    // again at sign-in re-prompted on every browser session and blocked people
    // out of accounts they had paid for. Acceptance is still enforced where it
    // can actually be attributed: on /signup before an account can be created,
    // and at /login/complete against the version recorded on the account.
    render(await LoginPage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    expect(screen.getByTestId('auth-flow')).toBeInTheDocument();
    expect(flowProps).toHaveBeenCalledWith(expect.objectContaining({ mode: 'login' }));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('forces successful sign-in through durable acceptance verification', async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    expect(lastRedirects()['completeUrl']).toBe('/login/complete?redirectTo=%2Fchat');
  });

  it('keeps device approval and account creation inside the embedded Desktop flow', async () => {
    const redirectTo = '/auth/device?user_code=ABCD-1234&surface=desktop';
    render(
      await LoginPage({
        searchParams: Promise.resolve({ redirectTo, surface: 'desktop' }),
      }),
    );

    expect(screen.getByTestId('auth-layout')).toHaveAttribute('data-embedded', 'true');
    expect(lastRedirects()).toEqual({
      completeUrl:
        '/login/complete?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234%26surface%3Ddesktop&surface=desktop',
      switchUrl:
        '/signup?surface=desktop&redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234%26surface%3Ddesktop',
      ssoCallbackUrl:
        '/auth/sso-callback?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234%26surface%3Ddesktop&surface=desktop',
    });
  });

  it('carries the one stale-session retry through the completion round trip', async () => {
    render(
      await LoginPage({ searchParams: Promise.resolve({ redirectTo: '/chat', authRetry: '1' }) }),
    );

    expect(lastRedirects()['completeUrl']).toBe('/login/complete?redirectTo=%2Fchat&authRetry=1');
  });

  it('sends an unsafe redirect target to the default destination', async () => {
    render(
      await LoginPage({ searchParams: Promise.resolve({ redirectTo: 'https://evil.example' }) }),
    );

    expect(lastRedirects()['completeUrl']).toBe('/login/complete?redirectTo=%2F');
  });
});
