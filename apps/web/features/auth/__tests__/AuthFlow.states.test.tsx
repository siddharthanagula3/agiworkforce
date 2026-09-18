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
import { AUTH_ERROR_SOURCE_COPY } from '@/lib/auth/error-taxonomy.copy';
import type { AuthNoticeKind } from '@/lib/auth/error-taxonomy';
import type { AuthProvider, AuthResult } from '../authContract';

const PROVIDERS: readonly AuthProvider[] = [{ id: 'google', label: 'Google' }];
const EMAIL = 'person@example.com';
const REDIRECTS = {
  completeUrl: '/login/complete',
  switchUrl: '/signup',
  ssoCallbackUrl: '/auth/sso-callback',
};

function renderFlow(overrides: { passkeySignIn?: boolean } = {}) {
  render(
    <AuthFlow
      mode="login"
      providers={PROVIDERS}
      redirects={REDIRECTS}
      passkeySignIn={overrides.passkeySignIn ?? false}
    />,
  );
}

function notice(kind: AuthNoticeKind, retryAfterSeconds: number | null = null): AuthResult {
  return { status: 'next', step: { kind: 'notice', notice: kind, retryAfterSeconds } };
}

function held<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function submitEmail() {
  await userEvent.type(screen.getByLabelText('Email address'), EMAIL);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

beforeEach(() => {
  client.isReady = true;
  for (const fn of Object.values(client)) {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      fn.mockReset();
      fn.mockResolvedValue({ status: 'complete' } as AuthResult);
    }
  }
  Object.defineProperty(window, 'PublicKeyCredential', {
    configurable: true,
    value: function PublicKeyCredential() {},
  });
  window.localStorage.clear();
});

describe('AuthFlow named states', () => {
  it('says it is checking the account while the lookup is in flight', async () => {
    const gate = held<AuthResult>();
    client.startWithEmail.mockReturnValue(gate.promise);
    renderFlow();

    await submitEmail();

    expect(screen.getByTestId('auth-phase')).toHaveTextContent('Checking your account');
    gate.resolve({ status: 'complete' });
    await waitFor(() => expect(screen.getByTestId('auth-phase')).toBeEmptyDOMElement());
  });

  it('says it is waiting for the passkey rather than showing a bare spinner', async () => {
    const gate = held<AuthResult>();
    client.signInWithPasskey.mockReturnValue(gate.promise);
    renderFlow({ passkeySignIn: true });

    await userEvent.click(
      await screen.findByRole('button', { name: /Sign in with a passkey or security key/ }),
    );

    expect(screen.getByTestId('auth-phase')).toHaveTextContent('Waiting for your passkey');
    gate.resolve({ status: 'complete' });
  });

  it('offers a retry after a dismissed passkey prompt instead of going quiet', async () => {
    client.signInWithPasskey.mockResolvedValue({
      status: 'failed',
      kind: 'passkey_dismissed',
      message: AUTH_ERROR_SOURCE_COPY.passkey_dismissed.message,
    });
    renderFlow({ passkeySignIn: true });

    await userEvent.click(
      await screen.findByRole('button', { name: /Sign in with a passkey or security key/ }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      AUTH_ERROR_SOURCE_COPY.passkey_dismissed.message,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(client.signInWithPasskey).toHaveBeenCalledTimes(2);
  });

  it('stays on a redirecting state once the provider hand-off is under way', async () => {
    client.startProvider.mockResolvedValue({ status: 'redirecting' });
    renderFlow();

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() =>
      expect(screen.getByTestId('auth-phase')).toHaveTextContent('Taking you to your provider'),
    );
  });

  it('remembers the provider that was used last and says so next time', async () => {
    client.startProvider.mockResolvedValue({ status: 'redirecting' });
    renderFlow();
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() =>
      expect(window.localStorage.getItem('agiworkforce-auth-last-method')).toBe('provider:google'),
    );

    render(<AuthFlow mode="login" providers={PROVIDERS} redirects={REDIRECTS} />);
    const buttons = await screen.findAllByRole('button', { name: /Continue with Google/ });
    expect(buttons[buttons.length - 1]).toHaveTextContent('Last used');
  });

  it.each([
    ['link_expired', 'This link expired'],
    ['link_already_used', 'This link was already used'],
    ['account_suspended', 'This account is suspended'],
    ['provider_outage', 'That provider is not responding'],
  ] as const)('gives %s its own screen', async (kind, heading) => {
    client.startWithEmail.mockResolvedValue(notice(kind));
    renderFlow();

    await submitEmail();

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.queryByLabelText('Email address')).toBeNull();
  });

  it('holds the way out of a rate-limit screen until the wait is over', async () => {
    client.startWithEmail.mockResolvedValue(notice('rate_limited', 2));
    renderFlow();

    await submitEmail();

    const button = await screen.findByRole('button', { name: /Try again in 2s/ });
    expect(button).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled(), {
      timeout: 4000,
    });
  });

  it('points a suspended account at support, and a provider outage nowhere', async () => {
    client.startWithEmail.mockResolvedValue(notice('account_suspended'));
    renderFlow();
    await submitEmail();

    expect(await screen.findByRole('link', { name: 'Contact support' })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:'),
    );
  });

  it('lets a password account switch to any other factor it holds', async () => {
    client.startWithEmail.mockResolvedValue({
      status: 'next',
      step: { kind: 'password', email: EMAIL, methods: ['password', 'email_code', 'passkey'] },
    });
    renderFlow();
    await submitEmail();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Try another way to sign in' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));

    expect(client.startMethod).toHaveBeenCalledWith('email_code');
  });

  it('lets a second factor hand over to another configured factor', async () => {
    client.startWithEmail.mockResolvedValue({
      status: 'next',
      step: {
        kind: 'second_factor',
        factor: { kind: 'authenticator', label: 'Authenticator code', hint: null },
        alternatives: [{ kind: 'backup_code', label: 'Backup code', hint: null }],
      },
    });
    renderFlow();
    await submitEmail();

    await userEvent.click(await screen.findByRole('button', { name: 'Use a backup code' }));

    expect(client.switchSecondFactor).toHaveBeenCalledWith({
      kind: 'backup_code',
      label: 'Backup code',
      hint: null,
    });
  });

  it('offers recovery when the account has no backup code left to fall back on', async () => {
    client.startWithEmail.mockResolvedValue({
      status: 'next',
      step: {
        kind: 'second_factor',
        factor: { kind: 'authenticator', label: 'Authenticator code', hint: null },
        alternatives: [],
      },
    });
    renderFlow();
    await submitEmail();

    expect(
      await screen.findByRole('link', { name: 'Lost the device with your codes?' }),
    ).toBeInTheDocument();
  });
});
