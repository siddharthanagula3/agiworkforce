import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const client = vi.hoisted(() => ({
  isReady: true,
  startWithEmail: vi.fn(),
  submitPassword: vi.fn(),
  submitCode: vi.fn(),
  resendCode: vi.fn(),
  submitSecondFactor: vi.fn(),
  switchSecondFactor: vi.fn(),
  submitNewPassword: vi.fn(),
  startPasswordReset: vi.fn(),
  startMethod: vi.fn(),
  startProvider: vi.fn(),
  signInWithPasskey: vi.fn(),
  restart: vi.fn(),
}));

vi.mock('../identityAuthAdapter', () => ({
  useIdentityAuthClient: () => client,
  IdentityBotProtection: () => null,
}));

import { AuthFlow } from '../AuthFlow';
import type { AuthProvider, AuthResult } from '../authContract';

const PROVIDERS: readonly AuthProvider[] = [{ id: 'google', label: 'Google' }];
const EMAIL = 'person@example.com';
const REDIRECTS = {
  completeUrl: '/login/complete',
  switchUrl: '/signup',
  ssoCallbackUrl: '/auth/sso-callback',
};

function renderFlow(passkeySignIn = false) {
  render(
    <AuthFlow
      mode="login"
      providers={PROVIDERS}
      redirects={REDIRECTS}
      passkeySignIn={passkeySignIn}
    />,
  );
}

async function submitEmail() {
  await userEvent.type(screen.getByLabelText('Email address'), EMAIL);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

beforeEach(() => {
  for (const fn of Object.values(client)) {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      fn.mockReset();
      fn.mockResolvedValue({ status: 'complete' } as AuthResult);
    }
  }
  Reflect.deleteProperty(window, 'PublicKeyCredential');
  window.localStorage.clear();
});

describe('auth accessibility', () => {
  it('names the step region with the heading the step renders', () => {
    renderFlow();

    const heading = screen.getByRole('heading', { name: 'Welcome back' });
    const region = document.querySelector('section[aria-labelledby]');
    expect(region?.getAttribute('aria-labelledby')).toBe(heading.id);
  });

  it('ties a field error to the field rather than only announcing it', async () => {
    client.startWithEmail.mockResolvedValue({
      status: 'failed',
      kind: 'identifier_not_found',
      message: 'No account uses this email.',
      field: 'email',
    });
    renderFlow();

    await submitEmail();

    const field = await screen.findByLabelText('Email address');
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    const describedBy = field.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? '')).toHaveTextContent(
      'No account uses this email.',
    );
  });

  it('moves focus into the step it opens rather than leaving it on the old control', async () => {
    client.startWithEmail.mockResolvedValue({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'sign_in', methods: [] },
    });
    renderFlow();

    await submitEmail();

    await waitFor(() => expect(screen.getByLabelText('Code')).toHaveFocus());
  });

  it('focuses a terminal screen that has no field to land in', async () => {
    client.startWithEmail.mockResolvedValue({
      status: 'next',
      step: { kind: 'notice', notice: 'link_expired', retryAfterSeconds: null },
    });
    renderFlow();

    await submitEmail();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'This link expired' })).toHaveFocus(),
    );
  });

  it('falls back to email when the browser has no passkey support at all', () => {
    renderFlow(true);

    expect(screen.queryByRole('button', { name: /passkey/i })).toBeNull();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });
});
