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
  readProviderReturn: () => null,
}));

vi.mock('../IdentityAuthAdapter', () => ({
  useIdentityAuthClient: () => client,
  useIdentityTicketSignIn: () => ({ ready: true, signInWithTicket: vi.fn() }),
  IdentityBotProtection: () => <div data-testid="bot-protection" />,
  IdentitySsoCallback: () => null,
}));

vi.mock('../useCountdown', () => ({
  useCountdown: () => [0, () => undefined],
}));

import { AuthFlow } from '../AuthFlow';
import { AUTH_ERROR_SOURCE_COPY } from '@/lib/auth/error-taxonomy.copy';
import type { AuthProvider, AuthResult } from '../authContract';

const PROVIDERS: readonly AuthProvider[] = [{ id: 'google', label: 'Google' }];
const EMAIL = 'person@example.com';
const PASSWORD = 'correct horse battery';
const CODE = '123456';
const LAST_METHOD_KEY = 'agiworkforce-auth-last-method';
const REDIRECTS = {
  signInCompleteUrl: '/login/complete',
  signUpCompleteUrl: '/signup/complete',
  ssoCallbackUrl: '/auth/sso-callback',
};

const PASSWORD_STEP: AuthResult = {
  status: 'next',
  step: { kind: 'password', email: EMAIL, methods: ['password', 'email_code'] },
};

const WRONG_PASSWORD: AuthResult = {
  status: 'failed',
  kind: 'credentials_invalid',
  message: AUTH_ERROR_SOURCE_COPY.credentials_invalid.message,
  field: 'password',
};

function renderFlow() {
  render(<AuthFlow providers={PROVIDERS} redirects={REDIRECTS} />);
}

async function continueWith(email = EMAIL) {
  await userEvent.type(screen.getByLabelText('Email address'), email);
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
  window.localStorage.clear();
});

describe('an address whose account has a password', () => {
  beforeEach(() => {
    client.startWithEmail.mockResolvedValue(PASSWORD_STEP);
  });

  it('goes from the address to the password step, and nowhere near sign-up', async () => {
    renderFlow();
    await continueWith();

    expect(await screen.findByRole('heading', { name: 'Enter your password' })).toBeVisible();
    expect(client.startWithEmail).toHaveBeenCalledWith(EMAIL);
    expect(screen.queryByRole('heading', { name: 'Create a password' })).toBeNull();
  });

  it('sends the password and remembers it as the last method', async () => {
    renderFlow();
    await continueWith();
    await userEvent.type(await screen.findByLabelText('Password'), PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(client.submitPassword).toHaveBeenCalledWith(PASSWORD));
    expect(window.localStorage.getItem(LAST_METHOD_KEY)).toBe('method:password');
  });

  it('keeps a wrong password on the password field', async () => {
    client.submitPassword.mockResolvedValue(WRONG_PASSWORD);
    renderFlow();
    await continueWith();
    await userEvent.type(await screen.findByLabelText('Password'), PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      AUTH_ERROR_SOURCE_COPY.credentials_invalid.message,
    );
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps Forgot password, which emails a reset code', async () => {
    client.startPasswordReset.mockResolvedValue({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'reset', methods: ['password'] },
    });
    renderFlow();
    await continueWith();

    await userEvent.click(await screen.findByRole('button', { name: 'Forgot password?' }));

    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    await userEvent.type(screen.getByLabelText('Code'), CODE);
    await waitFor(() => expect(client.submitCode).toHaveBeenCalledWith(CODE, 'reset'));
  });

  it('keeps the one-time code as the other way in', async () => {
    client.startMethod.mockResolvedValue({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'sign_in', methods: ['password', 'email_code'] },
    });
    renderFlow();
    await continueWith();

    await userEvent.click(await screen.findByRole('button', { name: 'Email me a code' }));

    expect(client.startMethod).toHaveBeenCalledWith('email_code');
    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  });

  it('keeps the password out of the address bar and out of browser storage', async () => {
    client.submitPassword.mockResolvedValue(WRONG_PASSWORD);
    const before = window.location.href;
    renderFlow();
    await continueWith();
    await userEvent.type(await screen.findByLabelText('Password'), PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('alert');

    expect(window.location.href).toBe(before);
    const stored = [window.localStorage, window.sessionStorage].flatMap((storage) =>
      Array.from({ length: storage.length }, (_unused, index) => {
        const key = storage.key(index) ?? '';
        return `${key}=${storage.getItem(key) ?? ''}`;
      }),
    );
    expect(stored.join('\n')).not.toContain(PASSWORD);
    expect(document.cookie).not.toContain(PASSWORD);
  });
});

describe('an address whose account has no password', () => {
  it('goes from the address straight to the code step', async () => {
    client.startWithEmail.mockResolvedValue({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'sign_in', methods: ['email_code'] },
    });
    renderFlow();
    await continueWith();

    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    expect(screen.queryByLabelText('Password')).toBeNull();
    await userEvent.type(screen.getByLabelText('Code'), CODE);
    await waitFor(() => expect(client.submitCode).toHaveBeenCalledWith(CODE, 'sign_in'));
  });
});

describe('an address no account uses', () => {
  beforeEach(() => {
    client.startWithEmail.mockResolvedValue({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'sign_up', methods: [] },
    });
  });

  it('goes on to the code with no error and no question about which screen to use', async () => {
    renderFlow();
    await continueWith();

    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('link', { name: /sign up|log in/i })).toBeNull();
  });

  it('asks for a new password after the code, then hands the account to completion', async () => {
    client.submitCode.mockResolvedValue({
      status: 'next',
      step: { kind: 'new_password', email: EMAIL, purpose: 'sign_up' },
    });
    renderFlow();
    await continueWith();
    await userEvent.type(await screen.findByLabelText('Code'), CODE);

    expect(await screen.findByRole('heading', { name: 'Create a password' })).toBeVisible();
    expect(screen.getByTestId('bot-protection')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Password'), PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(client.submitNewPassword).toHaveBeenCalledWith(PASSWORD, 'sign_up'));
    expect(await screen.findByTestId('auth-phase')).toHaveTextContent(/sign/i);
  });
});
