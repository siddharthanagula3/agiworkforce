import { describe, expect, it, vi } from 'vitest';
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
        fallbackRedirectUrl: redirectTo,
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

    const props = signInProps.mock.lastCall?.[0] as Record<string, unknown>;
    expect(props['signUpForceRedirectUrl']).toBe('/signup/complete?redirectTo=%2Fchat');
    expect(props['signUpFallbackRedirectUrl']).toBeUndefined();
  });
});
