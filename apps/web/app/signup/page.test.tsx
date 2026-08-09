import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

const signUpProps = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs', () => ({
  SignUp: (props: Record<string, unknown>) => {
    signUpProps(props);
    return <div data-testid="clerk-sign-up" />;
  },
}));

vi.mock('@/features/marketing/components/AuthShell', () => ({
  AuthShell: ({ embedded, children }: { embedded?: boolean; children: ReactNode }) => (
    <div data-testid="auth-shell" data-embedded={String(embedded ?? false)}>
      {children}
    </div>
  ),
}));

import SignupPage from './page';

describe('/signup Desktop surface', () => {
  it('keeps account creation and the return to sign-in inside the embedded Desktop flow', async () => {
    const redirectTo = '/auth/device?user_code=ABCD-1234&surface=desktop';
    render(
      await SignupPage({
        searchParams: Promise.resolve({ redirectTo, surface: 'desktop' }),
      }),
    );

    expect(screen.getByTestId('auth-shell')).toHaveAttribute('data-embedded', 'true');

    // The Clerk card only exists behind the terms clickwrap.
    await userEvent.click(screen.getByRole('checkbox', { name: /terms of service/i }));

    expect(signUpProps).toHaveBeenCalledWith(
      expect.objectContaining({
        // New accounts pass through /signup/complete, which records the
        // acceptance before handing the Desktop flow back its device page.
        forceRedirectUrl:
          '/signup/complete?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234%26surface%3Ddesktop',
        signInUrl:
          '/login?surface=desktop&redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234%26surface%3Ddesktop',
      }),
    );
  });
});
