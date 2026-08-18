import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  AuthShell: ({ children }: { embedded?: boolean; children: ReactNode }) => (
    <div data-testid="auth-shell">{children}</div>
  ),
}));

import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import SignupPage from './page';

async function renderSignup(redirectTo = '/chat') {
  render(await SignupPage({ searchParams: Promise.resolve({ redirectTo }) }));
}

describe('/signup terms clickwrap', () => {
  beforeEach(() => {
    window.localStorage.clear();
    signUpProps.mockClear();
  });

  it('does not mount account creation until the terms are accepted', async () => {
    await renderSignup();

    expect(screen.queryByTestId('clerk-sign-up')).not.toBeInTheDocument();
    expect(signUpProps).not.toHaveBeenCalled();
    expect(screen.getByTestId('terms-gate-blocked')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toHaveAccessibleName(
      /agree to the terms of service.*acknowledge the privacy policy/i,
    );
  });

  it('mounts account creation once the box is ticked, and routes the new account through the recorder', async () => {
    await renderSignup('/chat');

    await userEvent.click(screen.getByRole('checkbox', { name: /terms of service/i }));

    expect(screen.getByTestId('clerk-sign-up')).toBeInTheDocument();
    expect(signUpProps).toHaveBeenCalledWith(
      expect.objectContaining({
        forceRedirectUrl: '/signup/complete?redirectTo=%2Fchat',
      }),
    );
  });

  it('sends the new account to the recorder with a prop search params cannot override', async () => {
    await renderSignup('/chat');

    await userEvent.click(screen.getByRole('checkbox', { name: /terms of service/i }));

    const props = signUpProps.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(props['fallbackRedirectUrl']).toBeUndefined();
  });

  it('restores consent on the OAuth return trip so the widget is not unmounted mid-flow', async () => {
    window.localStorage.setItem('agi.terms-accepted-version', POLICY_LAST_UPDATED.terms);

    await renderSignup();

    expect(await screen.findByTestId('clerk-sign-up')).toBeInTheDocument();
  });

  it('re-prompts when the stored consent names a superseded revision', async () => {
    window.localStorage.setItem('agi.terms-accepted-version', '1970-01-01');

    await renderSignup();

    expect(screen.queryByTestId('clerk-sign-up')).not.toBeInTheDocument();
  });
});
