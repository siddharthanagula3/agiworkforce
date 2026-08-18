import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const signUpProps = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs', () => ({
  SignUp: (props: Record<string, unknown>) => {
    signUpProps(props);
    return <div data-testid="clerk-sign-up" />;
  },
}));

vi.mock('@/features/marketing/components/AuthShell', () => ({
  AuthShell: ({ children }: { embedded?: boolean; children: ReactNode }) => (
    <div data-testid="auth-shell">{children}</div>
  ),
}));

import SignupPage from './page';

async function renderSignup(redirectTo = '/chat') {
  render(await SignupPage({ searchParams: Promise.resolve({ redirectTo }) }));
}

/**
 * Founder decision 2026-08-17: no clickwrap above the form. The checkbox blocked
 * the auth widget until ticked, which met people with a consent wall before
 * anything identified them and re-appeared whenever the stored marker was gone.
 * Assent now sits against the button being pressed, and the durable record is
 * still written server-side by /signup/complete — which is what makes "what did
 * they agree to, and when" answerable at all.
 */
describe('/signup terms assent', () => {
  beforeEach(() => {
    window.localStorage.clear();
    signUpProps.mockClear();
  });

  it('mounts account creation immediately, with no checkbox in the way', async () => {
    await renderSignup();

    expect(screen.getByTestId('clerk-sign-up')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByTestId('terms-gate-blocked')).not.toBeInTheDocument();
  });

  it('states the agreement against the action, naming the clauses that need it', async () => {
    await renderSignup();

    // The arbitration clause and class-action waiver are the terms that most
    // need to have been shown; a bare "see our terms" link would not name them.
    const notice = screen.getByText(/by creating an account/i);
    expect(notice).toHaveTextContent(/arbitration clause and class-action waiver/i);
    expect(screen.getByRole('link', { name: /terms of service/i })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('routes the new account through the recorder that stores the accepted version', async () => {
    await renderSignup('/chat');

    expect(signUpProps).toHaveBeenCalledWith(
      expect.objectContaining({ forceRedirectUrl: '/signup/complete?redirectTo=%2Fchat' }),
    );
  });

  it('sends the new account to the recorder with a prop search params cannot override', async () => {
    await renderSignup('/chat');

    const props = signUpProps.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(props['fallbackRedirectUrl']).toBeUndefined();
  });
});
