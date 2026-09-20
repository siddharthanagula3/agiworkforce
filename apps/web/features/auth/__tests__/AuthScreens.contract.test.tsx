import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  create: vi.fn(),
  verifications: { sendEmailCode: vi.fn(), verifyEmailCode: vi.fn() },
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
import type { AuthMode } from '../authContract';

const PROVIDERS = resolveAuthProviders('google,microsoft,apple');
const EMAIL = 'person@example.com';
const REDIRECTS = {
  completeUrl: '/login/complete?redirectTo=%2Fchat',
  switchUrl: '/signup',
  ssoCallbackUrl: '/auth/sso-callback?redirectTo=%2Fchat',
};

const ok = { error: null };

function vendorError(error: Record<string, unknown>) {
  return { error: { errors: [error] } };
}

function renderScreen(mode: AuthMode, passkeySignIn = false) {
  return render(
    <AuthLayout>
      <AuthFlow
        mode={mode}
        providers={PROVIDERS}
        passkeySignIn={passkeySignIn}
        redirects={mode === 'login' ? REDIRECTS : { ...REDIRECTS, switchUrl: '/login' }}
      />
    </AuthLayout>,
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
  for (const fn of [
    signInState.create,
    signInState.password,
    signInState.emailCode.sendCode,
    signInState.emailCode.verifyCode,
    signInState.resetPasswordEmailCode.sendCode,
    signInState.mfa.sendPhoneCode,
    signInState.mfa.sendEmailCode,
    signInState.sso,
    signInState.passkey,
    signInState.finalize,
    signInState.reset,
    signUpState.create,
    signUpState.verifications.sendEmailCode,
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

describe('sign-up screen', () => {
  it('carries the brand, the address field, every configured provider and the way to sign in', () => {
    renderScreen('signup');

    const brand = screen.getByRole('link', { name: 'AGI' });
    expect(brand).toHaveAttribute('href', '/');
    expect(brand.querySelector('svg')).not.toBeNull();

    expect(emailField()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();

    for (const provider of PROVIDERS) {
      const button = screen.getByRole('button', { name: `Continue with ${provider.label}` });
      expect(button.querySelector('svg')).not.toBeNull();
    }

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('states the agreement and links both policies from the screen itself', () => {
    renderScreen('signup');

    const footer = screen.getByTestId('auth-legal-footer');
    expect(within(footer).getByRole('link', { name: 'Terms of Use' })).toHaveAttribute(
      'href',
      CANONICAL_POLICY_ROUTES.terms,
    );
    expect(within(footer).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      CANONICAL_POLICY_ROUTES.privacy,
    );
    expect(footer).toHaveTextContent('By signing up, you agree to the');
  });

  it('mounts a challenge only where an account is created, and only as a mount point', () => {
    const { unmount } = renderScreen('signup');
    const mount = document.getElementById('clerk-captcha');

    expect(mount).not.toBeNull();
    expect(mount?.children).toHaveLength(0);
    unmount();

    renderScreen('login');
    expect(document.getElementById('clerk-captcha')).toBeNull();
  });

  it('asks for the address the way the platform expects to fill it', () => {
    renderScreen('signup');
    const field = emailField();

    expect(field).toHaveFocus();
    expect(field).toHaveAttribute('type', 'email');
    expect(field).toHaveAttribute('name', 'email');
    expect(field).toHaveAttribute('inputmode', 'email');
    expect(field).toBeRequired();
    expect(field.getAttribute('autocomplete')).toContain('email');
  });

  it('submits on Enter without reaching for the button', async () => {
    renderScreen('signup');

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
    renderScreen('signup');

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
    renderScreen('signup');

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
    renderScreen('signup');

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
    renderScreen('signup');

    await submitEmail();

    expect(await screen.findByRole('heading', { name: 'Too many attempts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again in 2s/ })).toBeDisabled();
  });

  it('offers the sign-in screen when the address already has an account', async () => {
    signUpState.create.mockResolvedValue(
      vendorError({ code: 'form_identifier_exists', meta: { paramName: 'email_address' } }),
    );
    renderScreen('signup');

    await submitEmail();

    expect(await screen.findByRole('link', { name: 'Log in instead.' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('hands a provider sign-up to the callback the page chose and says it is going there', async () => {
    renderScreen('signup');

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Microsoft' }));

    await waitFor(() =>
      expect(signUpState.sso).toHaveBeenCalledWith({
        strategy: 'oauth_microsoft',
        redirectUrl: REDIRECTS.completeUrl,
        redirectCallbackUrl: REDIRECTS.ssoCallbackUrl,
        legalAccepted: true,
      }),
    );
    expect(screen.getByTestId('auth-phase')).toHaveTextContent('Taking you to your provider');
  });

  it('keeps a live region in the tree before there is anything to announce', () => {
    renderScreen('signup');
    const status = screen.getByTestId('auth-phase');

    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();
  });

  it('labels every control it renders', () => {
    renderScreen('signup');

    for (const input of Array.from(document.querySelectorAll('input'))) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      expect(label?.textContent ?? '').not.toHaveLength(0);
    }
    for (const button of screen.getAllByRole('button')) {
      expect(button.textContent ?? '').not.toHaveLength(0);
    }
  });
});

describe('sign-in screen', () => {
  it('offers every way in the deployment has turned on, plus help and the way to sign up', async () => {
    renderScreen('login', true);

    expect(emailField()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    for (const provider of PROVIDERS) {
      expect(screen.getByRole('button', { name: `Continue with ${provider.label}` })).toBeEnabled();
    }
    expect(
      await screen.findByRole('button', { name: /Sign in with a passkey or security key/ }),
    ).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help');
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup');
  });

  it('asks a password account for its password, with a way out of it', async () => {
    signInState.supportedFirstFactors = [
      { strategy: 'password' },
      { strategy: 'email_code' },
      { strategy: 'passkey' },
    ];
    renderScreen('login');

    await submitEmail();

    expect(await screen.findByLabelText('Password')).toHaveAttribute(
      'autocomplete',
      'current-password',
    );
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Try another way to sign in' })).toBeEnabled();
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
  });

  it('emails a code when the account has no password, and takes it as a one-time code', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'email_code' }];
    renderScreen('login');

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
    renderScreen('login');

    await submitEmail();

    const code = await screen.findByLabelText('Authenticator code');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(screen.getByRole('button', { name: 'Text me a code instead' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Use a backup code' })).toBeEnabled();
  });

  it('gives a locked account its own screen, separate from a suspended one', async () => {
    signInState.create.mockResolvedValue(vendorError({ code: 'user_locked' }));
    const locked = renderScreen('login');
    await submitEmail();
    const lockedHeading = await screen.findByRole('heading', { name: 'This account is locked' });
    expect(lockedHeading).toBeInTheDocument();
    locked.unmount();

    signInState.create.mockResolvedValue(vendorError({ code: 'user_banned' }));
    renderScreen('login');
    await submitEmail();

    expect(
      await screen.findByRole('heading', { name: 'This account is suspended' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contact support' })).toBeInTheDocument();
  });

  it('sends an address its organization has taken over to that organization, not to a code', async () => {
    signInState.supportedFirstFactors = [
      { strategy: 'enterprise_sso' },
      { strategy: 'password' },
      { strategy: 'email_code' },
    ];
    renderScreen('login');

    await submitEmail();

    await waitFor(() =>
      expect(signInState.sso).toHaveBeenCalledWith({
        identifier: EMAIL,
        strategy: 'enterprise_sso',
        redirectUrl: REDIRECTS.completeUrl,
        redirectCallbackUrl: REDIRECTS.ssoCallbackUrl,
      }),
    );
    expect(signInState.emailCode.sendCode).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByTestId('auth-phase')).toHaveTextContent(
      'This address belongs to an organization',
    );
  });

  it('stays on the hand-off rather than dropping back to an idle form', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'enterprise_sso' }];
    renderScreen('login');

    await submitEmail();

    await waitFor(() => expect(screen.getByTestId('auth-phase')).not.toBeEmptyDOMElement());
    expect(screen.getByRole('button', { name: 'Working' })).toHaveAttribute('aria-busy', 'true');
  });

  it('answers an unreachable provider without blaming the account', async () => {
    signInState.create.mockResolvedValue({ error: { errors: [{ code: 'oops' }], status: 503 } });
    renderScreen('login');

    await submitEmail();

    expect(
      await screen.findByRole('heading', { name: 'That provider is not responding' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('auth-notice')).toHaveTextContent('Your account is fine');
  });
});
