import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/runtimeEnvironment', () => ({
  isTauri: true,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
  isElectronHost: false,
}));

const clerk = {
  attemptPassword: vi.fn(),
  createIdentifierSignIn: vi.fn(),
  prepareEmailCode: vi.fn(),
  attemptEmailCode: vi.fn(),
  attemptSecondFactor: vi.fn(),
  prepareSecondFactor: vi.fn(),
  createSessionToken: vi.fn(),
  isNativeClerkSignInConfigured: vi.fn(() => true),
};

vi.mock('../../../services/clerkNativeAuth', async () => {
  const actual = await vi.importActual<typeof import('../../../services/clerkNativeAuth')>(
    '../../../services/clerkNativeAuth',
  );
  return {
    ...actual,
    attemptPassword: (...args: unknown[]) => clerk.attemptPassword(...args),
    createIdentifierSignIn: (...args: unknown[]) => clerk.createIdentifierSignIn(...args),
    prepareEmailCode: (...args: unknown[]) => clerk.prepareEmailCode(...args),
    attemptEmailCode: (...args: unknown[]) => clerk.attemptEmailCode(...args),
    attemptSecondFactor: (...args: unknown[]) => clerk.attemptSecondFactor(...args),
    prepareSecondFactor: (...args: unknown[]) => clerk.prepareSecondFactor(...args),
    createSessionToken: (...args: unknown[]) => clerk.createSessionToken(...args),
    isNativeClerkSignInConfigured: () => clerk.isNativeClerkSignInConfigured(),
    resetClerkClient: vi.fn(),
  };
});

const exchange = vi.fn();
vi.mock('../../../services/desktopNativeSignIn', async () => {
  const actual = await vi.importActual<typeof import('../../../services/desktopNativeSignIn')>(
    '../../../services/desktopNativeSignIn',
  );
  return {
    ...actual,
    exchangeClerkSessionForCloudCredential: (...args: unknown[]) => exchange(...args),
  };
});

const social = {
  beginSocialSignIn: vi.fn(),
  completeSocialSignIn: vi.fn(),
};
vi.mock('../../../services/desktopSocialSignIn', async () => {
  const actual = await vi.importActual<typeof import('../../../services/desktopSocialSignIn')>(
    '../../../services/desktopSocialSignIn',
  );
  return {
    ...actual,
    beginSocialSignIn: (...args: unknown[]) => social.beginSocialSignIn(...args),
    completeSocialSignIn: (...args: unknown[]) => social.completeSocialSignIn(...args),
  };
});

const openExternalUrl = vi.fn();
vi.mock('../../../utils/navigation', () => ({
  openExternalUrl: (...args: unknown[]) => openExternalUrl(...args),
  openPricingPage: vi.fn(),
}));

import { ClerkAuthError, type ClerkSignIn } from '../../../services/clerkNativeAuth';
import { NativeSignInExchangeError } from '../../../services/desktopNativeSignIn';
import { useAppModeStore } from '../../../stores/appModeStore';
import { useAuthStore } from '../../../stores/auth';
import { NativeSignInCard } from '../NativeSignInCard';

function signIn(overrides: Partial<ClerkSignIn> = {}): ClerkSignIn {
  return {
    id: 'sia_1',
    status: 'complete',
    identifier: 'demo@example.com',
    createdSessionId: 'sess_1',
    supportedFirstFactors: [],
    supportedSecondFactors: [],
    externalVerificationRedirectUrl: null,
    firstFactorVerificationStatus: null,
    ...overrides,
  };
}

const CONTINUE = /^continue$/i;

function submitEmail(email = 'demo@example.com') {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: CONTINUE }));
}

async function submitPassword(password = 'hunter2') {
  fireEvent.change(await screen.findByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: CONTINUE }));
}

function passwordAccount() {
  return signIn({
    status: 'needs_first_factor',
    createdSessionId: null,
    supportedFirstFactors: [{ strategy: 'password' }],
  });
}

describe('NativeSignInCard', () => {
  const completeNativeSignIn = vi.fn();
  const browserSignIn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    clerk.isNativeClerkSignInConfigured.mockReturnValue(true);
    completeNativeSignIn.mockResolvedValue({ error: null });
    browserSignIn.mockResolvedValue({ error: null });
    exchange.mockResolvedValue({
      accessToken: 'developer.token.value',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 3_600_000,
    });
    clerk.createSessionToken.mockResolvedValue('clerk.session.jwt');
    useAuthStore.setState({
      completeNativeSignIn,
      signIn: browserSignIn,
      isLoading: false,
      error: null,
    });
    useAppModeStore.setState({ mode: 'cloud' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks for the email first, inline, with no child window and no device code', () => {
    render(<NativeSignInCard />);

    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: CONTINUE })).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.queryByText(/checking/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/device code/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sign in through your browser instead/i }),
    ).toBeInTheDocument();
  });

  it('asks for a password only when the account has one', async () => {
    clerk.createIdentifierSignIn.mockResolvedValue(passwordAccount());

    render(<NativeSignInCard />);
    submitEmail();

    expect(await screen.findByLabelText('Password')).toBeInTheDocument();
    expect(clerk.createIdentifierSignIn).toHaveBeenCalledWith('demo@example.com');
    expect(screen.getByText('demo@example.com')).toBeInTheDocument();
  });

  it('signs in with a password and adopts the exchanged credential', async () => {
    clerk.createIdentifierSignIn.mockResolvedValue(passwordAccount());
    clerk.attemptPassword.mockResolvedValue(signIn());
    const onSuccess = vi.fn();

    render(<NativeSignInCard onSuccess={onSuccess} />);
    submitEmail();
    await submitPassword();

    await waitFor(() => expect(clerk.attemptPassword).toHaveBeenCalledWith('sia_1', 'hunter2'));
    await waitFor(() => expect(clerk.createSessionToken).toHaveBeenCalledWith('sess_1'));
    await waitFor(() => expect(exchange).toHaveBeenCalledWith('clerk.session.jwt'));
    await waitFor(() =>
      expect(completeNativeSignIn).toHaveBeenCalledWith({
        accessToken: 'developer.token.value',
        refreshToken: 'refresh-token',
      }),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it('shows a wrong-password failure as a password problem', async () => {
    clerk.attemptPassword.mockRejectedValue(
      new ClerkAuthError(
        'invalid_credentials',
        'That password is not correct for this email address.',
        {
          status: 422,
          clerkCode: 'form_password_incorrect',
        },
      ),
    );

    clerk.createIdentifierSignIn.mockResolvedValue(passwordAccount());

    render(<NativeSignInCard />);
    submitEmail();
    await submitPassword();

    const alert = await screen.findByTestId('native-sign-in-error');
    expect(alert).toHaveTextContent(/password is not correct/i);
    expect(completeNativeSignIn).not.toHaveBeenCalled();
  });

  it('presents a Clerk 5xx as a service fault, never as an account rejection', async () => {
    clerk.attemptPassword.mockRejectedValue(
      new ClerkAuthError(
        'server_error',
        'The AGI account service failed while signing you in (HTTP 500). This is a fault on the service, not a problem with your account or password. Please try again in a moment.',
        { status: 500 },
      ),
    );

    clerk.createIdentifierSignIn.mockResolvedValue(passwordAccount());

    render(<NativeSignInCard />);
    submitEmail();
    await submitPassword();

    const alert = await screen.findByTestId('native-sign-in-error');
    expect(alert).toHaveTextContent(/HTTP 500/);
    expect(alert).toHaveTextContent(/fault on the service/i);
    expect(alert.textContent ?? '').not.toMatch(/reject/i);
  });

  it('presents an exchange 5xx as a service fault, never as an account rejection', async () => {
    clerk.createIdentifierSignIn.mockResolvedValue(passwordAccount());
    clerk.attemptPassword.mockResolvedValue(signIn());
    exchange.mockRejectedValue(
      new NativeSignInExchangeError(
        'server_error',
        'AGI Cloud could not complete sign-in because its account service failed (HTTP 503). This is a service fault, not a rejection of your account. Please try again shortly.',
        503,
      ),
    );

    clerk.createIdentifierSignIn.mockResolvedValue(passwordAccount());

    render(<NativeSignInCard />);
    submitEmail();
    await submitPassword();

    const alert = await screen.findByTestId('native-sign-in-error');
    expect(alert).toHaveTextContent(/HTTP 503/);
    expect(alert).toHaveTextContent(/service fault, not a rejection/i);
  });

  it('shows a network failure as a connectivity problem', async () => {
    clerk.attemptPassword.mockRejectedValue(
      new ClerkAuthError('network', 'Could not reach the AGI account service: offline'),
    );

    clerk.createIdentifierSignIn.mockResolvedValue(passwordAccount());

    render(<NativeSignInCard />);
    submitEmail();
    await submitPassword();

    const alert = await screen.findByTestId('native-sign-in-error');
    expect(alert).toHaveTextContent(/could not reach the agi account service/i);
  });

  it('tells an unverified account to use the email code path', async () => {
    clerk.attemptPassword.mockRejectedValue(
      new ClerkAuthError(
        'email_unverified',
        'This email address has not been verified yet. Use "Email me a sign-in code" to verify it and sign in.',
        { status: 422, clerkCode: 'identifier_not_verified' },
      ),
    );

    clerk.createIdentifierSignIn.mockResolvedValue(passwordAccount());

    render(<NativeSignInCard />);
    submitEmail();
    await submitPassword();

    const alert = await screen.findByTestId('native-sign-in-error');
    expect(alert).toHaveTextContent(/has not been verified/i);
    expect(screen.getByRole('button', { name: /email me a code instead/i })).toBeInTheDocument();
  });

  it('validates each step locally before calling the account service', async () => {
    clerk.createIdentifierSignIn.mockResolvedValue(passwordAccount());

    render(<NativeSignInCard />);
    fireEvent.click(screen.getByRole('button', { name: CONTINUE }));

    expect(await screen.findByTestId('native-sign-in-error')).toHaveTextContent(
      /enter the email address/i,
    );
    expect(clerk.createIdentifierSignIn).not.toHaveBeenCalled();

    submitEmail();
    await screen.findByLabelText('Password');
    fireEvent.click(screen.getByRole('button', { name: CONTINUE }));

    expect(await screen.findByTestId('native-sign-in-error')).toHaveTextContent(
      /enter your password/i,
    );
    expect(clerk.attemptPassword).not.toHaveBeenCalled();
  });

  it('runs the email-code flow inline', async () => {
    clerk.createIdentifierSignIn.mockResolvedValue(
      signIn({
        status: 'needs_first_factor',
        createdSessionId: null,
        supportedFirstFactors: [
          { strategy: 'email_code', emailAddressId: 'idn_1', safeIdentifier: 'd***@e.com' },
        ],
      }),
    );
    clerk.prepareEmailCode.mockResolvedValue(
      signIn({ status: 'needs_first_factor', createdSessionId: null }),
    );
    clerk.attemptEmailCode.mockResolvedValue(signIn());

    render(<NativeSignInCard />);
    submitEmail();

    await waitFor(() => expect(clerk.prepareEmailCode).toHaveBeenCalledWith('sia_1', 'idn_1'));
    expect(await screen.findByTestId('native-sign-in-notice')).toHaveTextContent(/d\*\*\*@e\.com/);

    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: '424242' } });
    fireEvent.click(screen.getByRole('button', { name: CONTINUE }));

    await waitFor(() => expect(clerk.attemptEmailCode).toHaveBeenCalledWith('sia_1', '424242'));
    await waitFor(() => expect(completeNativeSignIn).toHaveBeenCalled());
  });

  it('reports a wrong email code without leaving the code step', async () => {
    clerk.createIdentifierSignIn.mockResolvedValue(
      signIn({
        status: 'needs_first_factor',
        createdSessionId: null,
        supportedFirstFactors: [{ strategy: 'email_code', emailAddressId: 'idn_1' }],
      }),
    );
    clerk.prepareEmailCode.mockResolvedValue(
      signIn({ status: 'needs_first_factor', createdSessionId: null }),
    );
    clerk.attemptEmailCode.mockRejectedValue(
      new ClerkAuthError('invalid_code', 'That sign-in code is not correct.', {
        status: 422,
        clerkCode: 'form_code_incorrect',
      }),
    );

    render(<NativeSignInCard />);
    submitEmail();

    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: CONTINUE }));

    expect(await screen.findByTestId('native-sign-in-error')).toHaveTextContent(
      /code is not correct/i,
    );
    expect(screen.getByLabelText('Code')).toBeInTheDocument();
  });

  it('says so plainly when an account offers no password and no email code', async () => {
    clerk.createIdentifierSignIn.mockResolvedValue(
      signIn({
        status: 'needs_first_factor',
        createdSessionId: null,
        supportedFirstFactors: [{ strategy: 'oauth_google' }],
      }),
    );

    render(<NativeSignInCard />);
    submitEmail();

    expect(await screen.findByTestId('native-sign-in-error')).toHaveTextContent(
      /cannot be signed in with a password or an email code/i,
    );
  });

  it('collects a TOTP second factor inline', async () => {
    clerk.createIdentifierSignIn.mockResolvedValue(passwordAccount());
    clerk.attemptPassword.mockResolvedValue(
      signIn({
        status: 'needs_second_factor',
        createdSessionId: null,
        supportedSecondFactors: [{ strategy: 'totp' }],
      }),
    );
    clerk.attemptSecondFactor.mockResolvedValue(signIn());

    render(<NativeSignInCard />);
    submitEmail();
    await submitPassword();

    fireEvent.change(await screen.findByLabelText('Authenticator code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: CONTINUE }));

    await waitFor(() =>
      expect(clerk.attemptSecondFactor).toHaveBeenCalledWith('sia_1', 'totp', '123456'),
    );
    await waitFor(() => expect(completeNativeSignIn).toHaveBeenCalled());
  });

  it('sends the SMS code automatically when phone_code is the only second factor', async () => {
    clerk.createIdentifierSignIn.mockResolvedValue(passwordAccount());
    clerk.attemptPassword.mockResolvedValue(
      signIn({
        status: 'needs_second_factor',
        createdSessionId: null,
        supportedSecondFactors: [
          { strategy: 'phone_code', phoneNumberId: 'idn_p', safeIdentifier: '+1 ••• 4242' },
        ],
      }),
    );
    clerk.prepareSecondFactor.mockResolvedValue(
      signIn({ status: 'needs_second_factor', createdSessionId: null }),
    );

    render(<NativeSignInCard />);
    submitEmail();
    await submitPassword();

    await waitFor(() =>
      expect(clerk.prepareSecondFactor).toHaveBeenCalledWith('sia_1', {
        strategy: 'phone_code',
        phoneNumberId: 'idn_p',
        safeIdentifier: '+1 ••• 4242',
      }),
    );
    expect(await screen.findByTestId('native-sign-in-notice')).toHaveTextContent(/sent a code/i);
  });

  it('refuses an unsupported second factor instead of showing a dead code box', async () => {
    clerk.createIdentifierSignIn.mockResolvedValue(passwordAccount());
    clerk.attemptPassword.mockResolvedValue(
      signIn({
        status: 'needs_second_factor',
        createdSessionId: null,
        supportedSecondFactors: [{ strategy: 'some_future_factor' }],
      }),
    );

    render(<NativeSignInCard />);
    submitEmail();
    await submitPassword();

    expect(await screen.findByTestId('native-sign-in-error')).toHaveTextContent(
      /second factor agi desktop cannot collect yet/i,
    );
    expect(screen.queryByLabelText('Authenticator code')).not.toBeInTheDocument();
  });

  it('refuses password reset visibly and hands it to the browser', async () => {
    clerk.createIdentifierSignIn.mockResolvedValue(passwordAccount());
    clerk.attemptPassword.mockResolvedValue(
      signIn({ status: 'needs_new_password', createdSessionId: null }),
    );

    render(<NativeSignInCard />);
    submitEmail();
    await submitPassword();

    const panel = await screen.findByTestId('password-reset-required');
    expect(panel).toHaveTextContent(/does not run password resets in the app/i);

    fireEvent.click(screen.getByRole('button', { name: /reset your password in your browser/i }));
    await waitFor(() => expect(openExternalUrl).toHaveBeenCalledOnce());
    expect(String(openExternalUrl.mock.calls[0]?.[0])).toMatch(/\/login$/);
  });

  it('shows a pending state with a cancel for social sign-in', async () => {
    social.beginSocialSignIn.mockResolvedValue({
      signIn: signIn({ status: 'needs_first_factor', createdSessionId: null }),
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    });

    render(<NativeSignInCard />);
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    const pending = await screen.findByTestId('sso-pending');
    expect(pending).toHaveTextContent(/waiting for google/i);
    expect(social.beginSocialSignIn).toHaveBeenCalledWith('oauth_google');

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByTestId('sso-pending')).not.toBeInTheDocument());
  });

  it('completes social sign-in from the deep-link callback', async () => {
    const pendingSignIn = signIn({ status: 'needs_first_factor', createdSessionId: null });
    social.beginSocialSignIn.mockResolvedValue({
      signIn: pendingSignIn,
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    });
    social.completeSocialSignIn.mockResolvedValue('clerk.session.jwt');
    const onSuccess = vi.fn();

    render(<NativeSignInCard onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    await screen.findByTestId('sso-pending');

    window.dispatchEvent(
      new CustomEvent('cloud-sso-callback', { detail: { rotatingTokenNonce: 'nonce-1' } }),
    );

    await waitFor(() =>
      expect(social.completeSocialSignIn).toHaveBeenCalledWith(pendingSignIn, 'nonce-1'),
    );
    await waitFor(() => expect(completeNativeSignIn).toHaveBeenCalled());
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it('surfaces a social callback error instead of hanging on pending', async () => {
    social.beginSocialSignIn.mockResolvedValue({
      signIn: signIn({ status: 'needs_first_factor', createdSessionId: null }),
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    });

    render(<NativeSignInCard />);
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    await screen.findByTestId('sso-pending');

    window.dispatchEvent(
      new CustomEvent('cloud-sso-error', {
        detail: {
          error: 'missing_rotating_token_nonce',
          error_description: 'The AGI Desktop callback URL is not allowlisted.',
        },
      }),
    );

    expect(await screen.findByTestId('native-sign-in-error')).toHaveTextContent(/not allowlisted/i);
    expect(screen.queryByTestId('sso-pending')).not.toBeInTheDocument();
  });

  it('falls back to browser approval when the build has no Clerk key', async () => {
    clerk.isNativeClerkSignInConfigured.mockReturnValue(false);

    render(<NativeSignInCard />);

    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.getByText(/in-app sign-in is not configured in this build/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /sign in through your browser instead/i }));
    await waitFor(() => expect(browserSignIn).toHaveBeenCalledWith('', ''));
  });

  it('keeps the browser-approval fallback reachable and reports its failures', async () => {
    browserSignIn.mockResolvedValue({ error: 'AGI Cloud sign-in was cancelled.' });

    render(<NativeSignInCard />);
    fireEvent.click(screen.getByRole('button', { name: /sign in through your browser instead/i }));

    expect(await screen.findByTestId('native-sign-in-error')).toHaveTextContent(/cancelled/i);
  });

  it('surfaces the stored session-expiry reason rather than a blank prompt', () => {
    useAuthStore.setState({ error: 'Your AGI Cloud session has expired. Please connect again.' });

    render(<NativeSignInCard />);

    expect(screen.getByRole('alert')).toHaveTextContent(/session has expired/i);
  });

  it('returns to Local Mode without an account', () => {
    render(<NativeSignInCard />);
    fireEvent.click(screen.getByRole('button', { name: /use local mode/i }));
    expect(useAppModeStore.getState().mode).toBe('local');
  });
});
