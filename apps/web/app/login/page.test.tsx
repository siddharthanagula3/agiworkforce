import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const signInProps = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs', () => ({
  SignIn: (props: Record<string, unknown>) => {
    signInProps(props);
    return <div data-testid="clerk-sign-in" />;
  },
}));

vi.mock('@/features/marketing/components/AuthShell', () => ({
  AuthShell: ({ embedded, children }: { embedded?: boolean; children: ReactNode }) => (
    <div data-testid="auth-shell" data-embedded={String(embedded ?? false)}>
      {children}
    </div>
  ),
}));

import LoginPage from './page';

describe('/login Desktop surface', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    signInProps.mockClear();
  });

  it('mounts sign-in without a clickwrap, because terms belong to signup', async () => {
    // Founder decision 2026-08-17. A returning user has already accepted; asking
    // again at sign-in re-prompted on every browser session and blocked people
    // out of accounts they had paid for. Acceptance is still enforced where it
    // can actually be attributed: at /signup before Clerk mounts, and at
    // /login/complete against the version recorded on the account.
    render(await LoginPage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument();
    expect(screen.queryByTestId('terms-gate-blocked')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /terms of service/i })).not.toBeInTheDocument();
  });

  it('keeps device approval and account creation inside the embedded Desktop flow', async () => {
    const redirectTo = '/auth/device?user_code=ABCD-1234&surface=desktop';
    render(
      await LoginPage({
        searchParams: Promise.resolve({ redirectTo, surface: 'desktop' }),
      }),
    );

    expect(screen.getByTestId('auth-shell')).toHaveAttribute('data-embedded', 'true');
    expect(signInProps).toHaveBeenCalledWith(
      expect.objectContaining({
        forceRedirectUrl:
          '/login/complete?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234%26surface%3Ddesktop&surface=desktop',
        signUpUrl:
          '/signup?surface=desktop&redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234%26surface%3Ddesktop',
      }),
    );
  });

  it('routes an account created from the sign-in card through the terms clickwrap', async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    const props = signInProps.mock.lastCall?.[0] as Record<string, unknown>;
    expect(props['signUpForceRedirectUrl']).toBe('/signup/complete?redirectTo=%2Fchat');
    expect(props['signUpFallbackRedirectUrl']).toBeUndefined();
  });

  it('forces successful sign-in through durable acceptance verification', async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    const props = signInProps.mock.lastCall?.[0] as Record<string, unknown>;
    expect(props['forceRedirectUrl']).toBe('/login/complete?redirectTo=%2Fchat');
    expect(props['fallbackRedirectUrl']).toBeUndefined();
  });
});
