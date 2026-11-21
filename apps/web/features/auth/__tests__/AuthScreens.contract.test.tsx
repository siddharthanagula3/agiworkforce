import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const signInState = vi.hoisted(() => ({
  status: 'needs_first_factor' as string,
  identifier: 'person@example.com' as string | null,
  supportedFirstFactors: [] as { strategy: string; safeIdentifier?: string }[],
  supportedSecondFactors: [] as { strategy: string; safeIdentifier?: string }[],
  create: vi.fn(),
  password: vi.fn(),
  emailCode: { sendCode: vi.fn(), verifyCode: vi.fn() },
  resetPasswordEmailCode: { sendCode: vi.fn(), verifyCode: vi.fn(), submitPassword: vi.fn() },
  mfa: {
    sendPhoneCode: vi.fn(),
    sendEmailCode: vi.fn(),
    verifyTOTP: vi.fn(),
    verifyPhoneCode: vi.fn(),
    verifyEmailCode: vi.fn(),
    verifyBackupCode: vi.fn(),
  },
  sso: vi.fn(),
  passkey: vi.fn(),
  finalize: vi.fn(),
  reset: vi.fn(),
}));

const signUpState = vi.hoisted(() => ({
  status: 'missing_requirements' as string,
  emailAddress: 'person@example.com' as string | null,
  missingFields: [] as string[],
  unverifiedFields: ['email_address'] as string[],
  create: vi.fn(),
  password: vi.fn(),
  verifications: {
    emailAddress: { status: null as string | null },
    sendEmailCode: vi.fn(),
    verifyEmailCode: vi.fn(),
  },
  sso: vi.fn(),
  finalize: vi.fn(),
  reset: vi.fn(),
}));

const clerkState = vi.hoisted(() => ({ loaded: true, on: vi.fn(), off: vi.fn() }));

vi.mock('@clerk/nextjs', () => ({
  AuthenticateWithRedirectCallback: () => null,
  useClerk: () => clerkState,
  useSignIn: () => ({ signIn: signInState, errors: null, fetchStatus: 'idle' }),
  useSignUp: () => ({ signUp: signUpState, errors: null, fetchStatus: 'idle' }),
}));

import { resolveAuthProviders } from '@agiworkforce/client-runtime';

import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { AuthFlow } from '../AuthFlow';
import { AuthLayout } from '../AuthLayout';
import { AUTH_RESEND_COOLDOWN_SECONDS } from '../authContract';

const PROVIDERS = resolveAuthProviders('google,microsoft,apple');
const EMAIL = 'person@example.com';
const ONE_SECOND_MS = 1000;
const REDIRECTS = {
  signInCompleteUrl: '/login/complete?redirectTo=%2Fchat',
  signUpCompleteUrl: '/signup/complete?redirectTo=%2Fchat',
  ssoCallbackUrl: '/auth/sso-callback?redirectTo=%2Fchat',
};
const AGREEMENT_SENTENCE = 'By continuing, you agree to our Terms and Privacy Policy.';

const ok = { error: null };

function vendorError(error: Record<string, unknown>) {
  return { error: { errors: [error] } };
}

function renderScreen(passkeySignIn = false) {
  return render(
    <AuthLayout>
      <AuthFlow providers={PROVIDERS} passkeySignIn={passkeySignIn} redirects={REDIRECTS} />
    </AuthLayout>,
  );
}

function noAccountUsesTheAddress(): void {
  signInState.create.mockResolvedValueOnce(
    vendorError({ code: 'form_identifier_not_found', meta: { paramName: 'identifier' } }),
  );
}

function emailField(): HTMLInputElement {
  return screen.getByLabelText('Email address') as HTMLInputElement;
}

async function submitEmail(email = EMAIL) {
  await userEvent.type(emailField(), email);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

function held<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => {
  clerkState.loaded = true;
  clerkState.on.mockReset();
  clerkState.off.mockReset();
  signInState.status = 'needs_first_factor';
  signInState.identifier = EMAIL;
  signInState.supportedFirstFactors = [];
  signInState.supportedSecondFactors = [];
  signUpState.status = 'missing_requirements';
  signUpState.emailAddress = EMAIL;
  signUpState.missingFields = [];
  signUpState.unverifiedFields = ['email_address'];
  signUpState.verifications.emailAddress.status = null;
  for (const fn of [
    signInState.create,
    signInState.password,
    signInState.emailCode.sendCode,
    signInState.emailCode.verifyCode,
    signInState.resetPasswordEmailCode.sendCode,
    signInState.resetPasswordEmailCode.verifyCode,
    signInState.mfa.sendPhoneCode,
    signInState.mfa.sendEmailCode,
    signInState.mfa.verifyEmailCode,
    signInState.sso,
    signInState.passkey,
    signInState.finalize,
    signInState.reset,
    signUpState.create,
    signUpState.password,
    signUpState.verifications.sendEmailCode,
    signUpState.verifications.verifyEmailCode,
    signUpState.sso,
    signUpState.finalize,
    signUpState.reset,
  ]) {
    fn.mockReset();
    fn.mockResolvedValue(ok);
  }
  Object.defineProperty(window, 'PublicKeyCredential', {
    configurable: true,
    value: function PublicKeyCredential() {},
  });
  window.localStorage.clear();
});

describe('the one screen, for an address no account uses', () => {
  beforeEach(() => {
    noAccountUsesTheAddress();
  });

  it('carries the brand, the heading, the address field and every configured provider, and no switch line', () => {
    renderScreen();

    const brand = screen.getByRole('link', { name: 'AGI' });
    expect(brand).toHaveAttribute('href', '/');
    expect(brand.querySelector('img.agi-mark')).not.toBeNull();

    expect(emailField()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();

    for (const provider of PROVIDERS) {
      const button = screen.getByRole('button', { name: `Continue with ${provider.label}` });
      expect(button.querySelector('svg')).not.toBeNull();
    }

    expect(screen.getByRole('heading', { name: 'Log in or sign up' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^(Log in|Sign up)$/ })).toBeNull();
  });

  it('states the agreement beside the action and links both policies from it', () => {
    renderScreen();

    const agreement = screen.getByTestId('auth-signup-agreement');
    expect(within(agreement).getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      CANONICAL_POLICY_ROUTES.terms,
    );
    expect(within(agreement).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      CANONICAL_POLICY_ROUTES.privacy,
    );
    expect(agreement).toHaveTextContent(AGREEMENT_SENTENCE);
    expect(within(agreement).queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getAllByText(/By continuing/)).toHaveLength(1);
  });

  it('looks the address up first, then creates the account with the agreement and no age', async () => {
    renderScreen();

    await submitEmail();

    await waitFor(() =>
      expect(signUpState.create).toHaveBeenCalledWith({ emailAddress: EMAIL, legalAccepted: true }),
    );
    expect(signInState.create).toHaveBeenCalledWith({ identifier: EMAIL });
    expect(signInState.create.mock.invocationCallOrder[0]).toBeLessThan(
      signUpState.create.mock.invocationCallOrder[0]!,
    );
    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(window.localStorage.getItem('agi.terms-accepted-version')).not.toBeNull();
    expect(
      Object.keys({ ...window.localStorage }).filter((key) => /age|marketing/i.test(key)),
    ).toEqual([]);
  });

  it('carries the agreement marker for an account the provider completes at creation', async () => {
    signUpState.create.mockImplementation(async () => {
      signUpState.status = 'complete';
      signUpState.unverifiedFields = [];
      signUpState.verifications.emailAddress.status = 'verified';
      return ok;
    });
    renderScreen();

    await submitEmail();

    await waitFor(() => expect(signUpState.finalize).toHaveBeenCalledTimes(1));
    expect(signUpState.verifications.sendEmailCode).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('agi.terms-accepted-version')).not.toBeNull();
  });

  it('mounts the challenge the account creation needs, as a mount point only', () => {
    renderScreen();
    const mount = document.getElementById('clerk-captcha');

    expect(mount).not.toBeNull();
    expect(mount?.children).toHaveLength(0);
  });

  it('asks for the address the way the platform expects to fill it', () => {
    renderScreen();
    const field = emailField();

    expect(field).not.toHaveFocus();
    expect(field).toHaveAttribute('type', 'email');
    expect(field).toHaveAttribute('name', 'email');
    expect(field).toHaveAttribute('inputmode', 'email');
    expect(field).toBeRequired();
    expect(field.getAttribute('autocomplete')).toContain('email');
  });

  it('submits on Enter without reaching for the button', async () => {
    renderScreen();

    await userEvent.type(emailField(), `${EMAIL}{Enter}`);

    await waitFor(() =>
      expect(signUpState.create).toHaveBeenCalledWith({
        emailAddress: EMAIL,
        legalAccepted: true,
      }),
    );
  });

  it('says what it is doing while the account is being checked', async () => {
    const gate = held<typeof ok>();
    signUpState.create.mockReturnValue(gate.promise);
    renderScreen();

    await submitEmail();

    expect(screen.getByTestId('auth-phase')).toHaveTextContent('Checking your account');
    gate.resolve(ok);
  });

  it('keeps the address on the screen after the server refuses it', async () => {
    signUpState.create.mockResolvedValue(
      vendorError({
        code: 'form_param_format_invalid',
        message: 'That address is not valid.',
        meta: { paramName: 'email_address' },
      }),
    );
    renderScreen();

    await submitEmail();

    expect(await screen.findByRole('alert')).toHaveTextContent('That address is not valid.');
    expect(emailField()).toHaveValue(EMAIL);
  });

  it('ties the message to the field rather than only announcing it somewhere', async () => {
    signUpState.create.mockResolvedValue(
      vendorError({
        code: 'form_param_format_invalid',
        message: 'That address is not valid.',
        meta: { paramName: 'email_address' },
      }),
    );
    renderScreen();

    await submitEmail();

    const field = emailField();
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(document.getElementById(field.getAttribute('aria-describedby') ?? '')).toHaveTextContent(
      'That address is not valid.',
    );
  });

  it('gives a rate limit its own screen with the wait the server asked for', async () => {
    signUpState.create.mockResolvedValue({
      error: { errors: [{ code: 'too_many_requests' }], status: 429, retryAfter: 2 },
    });
    renderScreen();

    await submitEmail();

    expect(await screen.findByRole('heading', { name: 'Too many attempts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again in 2s/ })).toBeDisabled();
  });

  it('hands a provider to the callback as a sign-in and says it is going there', async () => {
    renderScreen();

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Microsoft' }));

    await waitFor(() =>
      expect(signInState.sso).toHaveBeenCalledWith({
        strategy: 'oauth_microsoft',
        redirectUrl: REDIRECTS.signInCompleteUrl,
        redirectCallbackUrl: REDIRECTS.ssoCallbackUrl,
      }),
    );
    expect(signUpState.sso).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('agi.terms-accepted-version')).not.toBeNull();
    expect(screen.getByTestId('auth-phase')).toHaveTextContent('Taking you to your provider');
  });

  it('proves the address with the code, then collects the password the provider requires', async () => {
    signUpState.missingFields = ['password'];
    signUpState.unverifiedFields = [];
    signUpState.verifications.verifyEmailCode.mockImplementation(async () => {
      signUpState.verifications.emailAddress.status = 'verified';
      return ok;
    });
    signUpState.password.mockImplementation(async () => {
      signUpState.missingFields = [];
      signUpState.status = 'complete';
      return ok;
    });
    renderScreen();

    await submitEmail();

    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    expect(signUpState.verifications.sendEmailCode).toHaveBeenCalled();
    expect(signUpState.password).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Code'), '424242');

    expect(await screen.findByRole('heading', { name: 'Create a password' })).toBeInTheDocument();
    expect(document.getElementById('clerk-captcha')).not.toBeNull();
    expect(signUpState.finalize).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Password'), 'a long passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(signUpState.finalize).toHaveBeenCalled());
    expect(signUpState.password).toHaveBeenCalledWith({ password: 'a long passphrase' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('opens the session straight after the code when the provider asks for nothing more', async () => {
    signUpState.verifications.verifyEmailCode.mockImplementation(async () => {
      signUpState.unverifiedFields = [];
      signUpState.verifications.emailAddress.status = 'verified';
      signUpState.status = 'complete';
      return ok;
    });
    renderScreen();

    await submitEmail();
    await userEvent.type(await screen.findByLabelText('Code'), '424242');

    await waitFor(() => expect(signUpState.finalize).toHaveBeenCalledTimes(1));
    expect(signUpState.verifications.verifyEmailCode).toHaveBeenCalledWith({ code: '424242' });
    expect(signUpState.password).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Create a password' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('auth-phase')).toHaveTextContent('Signing you in');
  });

  it('keeps a live region in the tree before there is anything to announce', () => {
    renderScreen();
    const status = screen.getByTestId('auth-phase');

    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();
  });

  it('labels every control it renders', () => {
    renderScreen();

    for (const input of Array.from(document.querySelectorAll('input'))) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      expect(label?.textContent ?? '').not.toHaveLength(0);
    }
    for (const button of screen.getAllByRole('button')) {
      expect(button.textContent ?? '').not.toHaveLength(0);
    }
  });
});

describe('the one screen, for an address an account uses', () => {
  it('offers every way in the deployment has turned on, plus help', async () => {
    renderScreen(true);

    expect(emailField()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    for (const provider of PROVIDERS) {
      expect(screen.getByRole('button', { name: `Continue with ${provider.label}` })).toBeEnabled();
    }
    expect(
      await screen.findByRole('button', { name: /Sign in with a passkey or security key/ }),
    ).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help');
  });

  it('asks a password account for its password, with a way out of it', async () => {
    signInState.supportedFirstFactors = [
      { strategy: 'password' },
      { strategy: 'email_code' },
      { strategy: 'passkey' },
    ];
    renderScreen();

    await submitEmail();

    expect(await screen.findByLabelText('Password')).toHaveAttribute(
      'autocomplete',
      'current-password',
    );
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Try another way to sign in' })).toBeEnabled();
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
  });

  it('verifies a new device after a correct password instead of failing', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'password' }, { strategy: 'email_code' }];
    signInState.password.mockImplementation(async () => {
      signInState.status = 'needs_second_factor';
      signInState.supportedSecondFactors = [{ strategy: 'email_code' }];
      return ok;
    });
    signInState.mfa.verifyEmailCode.mockImplementation(async () => {
      signInState.status = 'complete';
      return ok;
    });
    renderScreen();
    await submitEmail();

    await userEvent.type(await screen.findByLabelText('Password'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('heading', { name: 'Verify this device' })).toBeInTheDocument();
    expect(
      screen.getByText(`You are signing in on a new device. We emailed a code to ${EMAIL}`),
    ).toBeInTheDocument();
    expect(signInState.mfa.sendEmailCode).toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Code'), '424242');

    await waitFor(() => expect(signInState.finalize).toHaveBeenCalled());
    expect(signInState.mfa.verifyEmailCode).toHaveBeenCalledWith({ code: '424242' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('emails a code when the account has no password, and takes it as a one-time code', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'email_code' }];
    renderScreen();

    await submitEmail();

    const code = await screen.findByLabelText(/code/i);
    expect(signInState.emailCode.sendCode).toHaveBeenCalled();
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toHaveAttribute('inputmode', 'numeric');
  });

  it('asks for the second factor the account holds and names the other ones it could use', async () => {
    signInState.status = 'needs_second_factor';
    signInState.supportedSecondFactors = [
      { strategy: 'totp' },
      { strategy: 'backup_code' },
      { strategy: 'phone_code', safeIdentifier: '+1 ••• 4321' },
    ];
    renderScreen();

    await submitEmail();

    const code = await screen.findByLabelText('Authenticator code');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(screen.getByRole('button', { name: 'Text me a code instead' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Use a backup code' })).toBeEnabled();
  });

  it('gives a locked account its own screen, separate from a suspended one', async () => {
    signInState.create.mockResolvedValue(vendorError({ code: 'user_locked' }));
    const locked = renderScreen();
    await submitEmail();
    const lockedHeading = await screen.findByRole('heading', { name: 'This account is locked' });
    expect(lockedHeading).toBeInTheDocument();
    locked.unmount();

    signInState.create.mockResolvedValue(vendorError({ code: 'user_banned' }));
    renderScreen();
    await submitEmail();

    expect(
      await screen.findByRole('heading', { name: 'This account is suspended' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Appeal this suspension' })).toHaveAttribute(
      'href',
      '/appeal',
    );
  });

  it('sends an address its organization has taken over to that organization, not to a code', async () => {
    signInState.supportedFirstFactors = [
      { strategy: 'enterprise_sso' },
      { strategy: 'password' },
      { strategy: 'email_code' },
    ];
    renderScreen();

    await submitEmail();

    await waitFor(() =>
      expect(signInState.sso).toHaveBeenCalledWith({
        identifier: EMAIL,
        strategy: 'enterprise_sso',
        redirectUrl: REDIRECTS.signInCompleteUrl,
        redirectCallbackUrl: REDIRECTS.ssoCallbackUrl,
      }),
    );
    expect(signInState.emailCode.sendCode).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Enter your password' })).toBeNull();
    expect(signInState.password).not.toHaveBeenCalled();
    expect(screen.getByTestId('auth-phase')).toHaveTextContent(
      'This address belongs to an organization',
    );
  });

  it('stays on the hand-off rather than dropping back to an idle form', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'enterprise_sso' }];
    renderScreen();

    await submitEmail();

    await waitFor(() => expect(screen.getByTestId('auth-phase')).not.toBeEmptyDOMElement());
    expect(screen.getByRole('button', { name: 'Working' })).toHaveAttribute('aria-busy', 'true');
  });

  it('answers an unreachable provider without blaming the account', async () => {
    signInState.create.mockResolvedValue({ error: { errors: [{ code: 'oops' }], status: 503 } });
    renderScreen();

    await submitEmail();

    expect(
      await screen.findByRole('heading', { name: 'That provider is not responding' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('auth-notice')).toHaveTextContent('Your account is fine');
  });

  it('keeps the code step usable after the code is sent again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      signInState.supportedFirstFactors = [{ strategy: 'email_code' }];
      renderScreen();
      await user.type(emailField(), EMAIL);
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await screen.findByLabelText('Code');

      for (let second = 0; second < AUTH_RESEND_COOLDOWN_SECONDS; second += 1) {
        await act(async () => {
          vi.advanceTimersByTime(ONE_SECOND_MS);
        });
      }
      await user.click(screen.getByRole('button', { name: 'Resend code' }));

      await waitFor(() => expect(signInState.emailCode.sendCode).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByLabelText('Code')).toBeEnabled());
      expect(screen.getByTestId('auth-phase')).toBeEmptyDOMElement();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the session on a retry without sending a code it already accepted', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'email_code' }];
    signInState.emailCode.verifyCode
      .mockImplementationOnce(async () => {
        signInState.status = 'complete';
        return ok;
      })
      .mockResolvedValue(vendorError({ code: 'verification_already_verified' }));
    signInState.finalize.mockResolvedValueOnce({ error: new TypeError('Failed to fetch') });
    renderScreen();
    await submitEmail();

    await userEvent.type(await screen.findByLabelText('Code'), '424242');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(signInState.finalize).toHaveBeenCalledTimes(2));
    expect(signInState.emailCode.verifyCode).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { name: 'This link was already used' })).toBeNull();
    expect(screen.getByTestId('auth-phase')).toHaveTextContent('Signing you in');
  });

  it('sends a password once even when Continue is pressed again while the session opens', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'password' }];
    signInState.password.mockImplementation(async () => {
      signInState.status = 'complete';
      return ok;
    });
    renderScreen();
    await submitEmail();

    await userEvent.type(await screen.findByLabelText('Password'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(signInState.finalize).toHaveBeenCalledTimes(1));

    act(() => {
      fireEvent.submit(screen.getByLabelText('Password').closest('form') as HTMLFormElement);
    });

    expect(signInState.password).toHaveBeenCalledTimes(1);
    expect(signInState.finalize).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('auth-phase')).toHaveTextContent('Signing you in');
  });
});
