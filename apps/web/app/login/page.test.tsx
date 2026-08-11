import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('does not mount Clerk authentication until the clickwrap is accepted', async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));

    expect(screen.queryByTestId('clerk-sign-in')).not.toBeInTheDocument();
    expect(screen.getByTestId('terms-gate-blocked')).toHaveTextContent(/sign in/i);
    expect(signInProps).not.toHaveBeenCalled();
  });

  it('keeps device approval and account creation inside the embedded Desktop flow', async () => {
    const redirectTo = '/auth/device?user_code=ABCD-1234&surface=desktop';
    render(
      await LoginPage({
        searchParams: Promise.resolve({ redirectTo, surface: 'desktop' }),
      }),
    );

    expect(screen.getByTestId('auth-shell')).toHaveAttribute('data-embedded', 'true');
    await userEvent.click(screen.getByRole('checkbox', { name: /terms of service/i }));
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
    // Clerk transfers an OAuth first touch with an unknown identity from SignIn
    // into a sign-up, so this card creates accounts without /signup ever
    // rendering. Those accounts must still land on /signup/complete, which shows
    // the terms and writes the acceptance. Force, not fallback: a preserved
    // ?redirect_url= outranks signUpFallbackRedirectUrl.
    render(await LoginPage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));
    await userEvent.click(screen.getByRole('checkbox', { name: /terms of service/i }));

    const props = signInProps.mock.lastCall?.[0] as Record<string, unknown>;
    expect(props['signUpForceRedirectUrl']).toBe('/signup/complete?redirectTo=%2Fchat');
    expect(props['signUpFallbackRedirectUrl']).toBeUndefined();
  });

  it('forces successful sign-in through durable acceptance verification', async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ redirectTo: '/chat' }) }));
    await userEvent.click(screen.getByRole('checkbox', { name: /terms of service/i }));

    const props = signInProps.mock.lastCall?.[0] as Record<string, unknown>;
    expect(props['forceRedirectUrl']).toBe('/login/complete?redirectTo=%2Fchat');
    expect(props['fallbackRedirectUrl']).toBeUndefined();
  });
});
