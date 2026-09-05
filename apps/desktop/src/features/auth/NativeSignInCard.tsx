import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthProviderId } from '@agiworkforce/client-runtime';
import { Spinner } from '@/ui/Spinner';
import { WEB_APP_URL } from '../../api/config';
import { supportsLocalAppMode } from '../../lib/runtimeEnvironment';
import { openExternalUrl } from '../../utils/navigation';
import { useAppModeStore } from '../../stores/appModeStore';
import { selectAuthError, useAuthStore } from '../../stores/auth';
import {
  ClerkAuthError,
  attemptEmailCode,
  attemptPassword,
  attemptSecondFactor,
  createIdentifierSignIn,
  createSessionToken,
  findEmailCodeFactor,
  isNativeClerkSignInConfigured,
  prepareEmailCode,
  prepareSecondFactor,
  resetClerkClient,
  type ClerkSecondFactor,
  type ClerkSignIn,
} from '../../services/clerkNativeAuth';
import {
  NativeSignInExchangeError,
  exchangeClerkSessionForCloudCredential,
} from '../../services/desktopNativeSignIn';
import {
  beginSocialSignIn,
  completeSocialSignIn,
  configuredSocialProviders,
  socialSignInStrategy,
} from '../../services/desktopSocialSignIn';
import { AuthDivider } from './AuthDivider';
import { AuthField } from './AuthField';
import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthPasswordField } from './AuthPasswordField';
import { AuthProviderButtons } from './AuthProviderButtons';
import { AuthStepFrame } from './AuthStepFrame';
import { AuthSubmitButton } from './AuthSubmitButton';
import {
  AUTH_ASIDE_CLASS,
  AUTH_DETAIL_ROW_CLASS,
  AUTH_ERROR_CLASS,
  AUTH_FOOTER_LINK_CLASS,
  AUTH_QUIET_BUTTON_CLASS,
  AUTH_QUIET_LINKS_CLASS,
  AUTH_STEP_LINKS_CLASS,
  AUTH_SWITCH_CLASS,
} from './authStyles';

type Step = 'email' | 'password' | 'email_code' | 'second_factor' | 'password_reset_required';

type Busy = null | 'email' | 'password' | 'code' | 'send_code' | 'mfa' | 'browser';

interface NativeSignInCardProps {
  onSuccess?: () => void;
}

interface SsoPending {
  providerLabel: string;
  signIn: ClerkSignIn;
}

const SUPPORTED_SECOND_FACTORS = new Set(['totp', 'phone_code', 'backup_code']);
const PASSWORD_FACTOR = 'password';
const WEB_SIGNUP_PATH = '/signup';
const DESKTOP_SURFACE_QUERY = 'surface=desktop';

const HEADINGS: Readonly<Record<Step, string>> = {
  email: 'Welcome back',
  password: 'Enter your password',
  email_code: 'Check your inbox',
  second_factor: 'Confirm it is you',
  password_reset_required: 'Set a new password',
};

const EMAIL_FIELD_LABEL = 'Email address';
const PASSWORD_FIELD_LABEL = 'Password';
const CODE_FIELD_LABEL = 'Code';
const CONTINUE_LABEL = 'Continue';

function secondFactorLabel(factor: ClerkSecondFactor): string {
  switch (factor.strategy) {
    case 'totp':
      return 'Authenticator code';
    case 'phone_code':
      return factor.safeIdentifier
        ? `Text message to ${factor.safeIdentifier}`
        : 'Text message code';
    case 'backup_code':
      return 'Backup code';
    default:
      return factor.strategy;
  }
}

function describeFailure(error: unknown): string {
  if (error instanceof ClerkAuthError || error instanceof NativeSignInExchangeError) {
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'AGI Desktop hit an unexpected problem while signing you in.';
}

export function NativeSignInCard({ onSuccess }: NativeSignInCardProps) {
  const completeNativeSignIn = useAuthStore((state) => state.completeNativeSignIn);
  const browserFallbackSignIn = useAuthStore((state) => state.signIn);
  const clearStoreError = useAuthStore((state) => state.clearError);
  const storeAuthError = useAuthStore(selectAuthError);
  const setMode = useAppModeStore((state) => state.setMode);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [signIn, setSignIn] = useState<ClerkSignIn | null>(null);
  const [secondFactor, setSecondFactor] = useState<ClerkSecondFactor | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [ssoPending, setSsoPending] = useState<SsoPending | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nativeConfigured = isNativeClerkSignInConfigured();
  const providers = configuredSocialProviders();
  const ssoPendingRef = useRef<SsoPending | null>(null);
  ssoPendingRef.current = ssoPending;

  const displayedError = error ?? storeAuthError;
  const isBusy = busy !== null;

  useEffect(() => {
    return () => {
      resetClerkClient();
    };
  }, []);

  const beginAttempt = useCallback(() => {
    setError(null);
    setNotice(null);
    clearStoreError();
  }, [clearStoreError]);

  const adoptClerkSession = useCallback(
    async (sessionId: string) => {
      const clerkSessionToken = await createSessionToken(sessionId);
      const credential = await exchangeClerkSessionForCloudCredential(clerkSessionToken);
      resetClerkClient();
      const result = await completeNativeSignIn({
        accessToken: credential.accessToken,
        ...(credential.refreshToken ? { refreshToken: credential.refreshToken } : {}),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onSuccess?.();
    },
    [completeNativeSignIn, onSuccess],
  );

  const sendEmailCodeFor = useCallback(
    async (created: ClerkSignIn) => {
      const emailFactor = findEmailCodeFactor(created);
      if (!emailFactor?.emailAddressId) {
        setError('This account does not support email sign-in codes. Use your password instead.');
        return;
      }
      const prepared = await prepareEmailCode(created.id, emailFactor.emailAddressId);
      setSignIn(prepared);
      setCode('');
      setStep('email_code');
      setNotice(`We sent a code to ${emailFactor.safeIdentifier ?? email.trim()}.`);
    },
    [email],
  );

  const applySignInState = useCallback(
    async (next: ClerkSignIn) => {
      setSignIn(next);

      if (next.status === 'complete' && next.createdSessionId) {
        await adoptClerkSession(next.createdSessionId);
        return;
      }

      if (next.status === 'needs_second_factor') {
        const usable = next.supportedSecondFactors.filter((factor) =>
          SUPPORTED_SECOND_FACTORS.has(factor.strategy),
        );
        const chosen = usable.find((factor) => factor.strategy === 'totp') ?? usable[0] ?? null;
        if (!chosen) {
          setError(
            'This account requires a second factor AGI Desktop cannot collect yet. Finish signing in through your browser.',
          );
          return;
        }
        setSecondFactor(chosen);
        setCode('');
        setStep('second_factor');
        if (chosen.strategy === 'phone_code') {
          const prepared = await prepareSecondFactor(next.id, chosen);
          setSignIn(prepared);
          setNotice('We sent a code to your phone.');
        }
        return;
      }

      if (next.status === 'needs_new_password') {
        setStep('password_reset_required');
        return;
      }

      if (next.status === 'needs_first_factor') {
        if (next.supportedFirstFactors.some((factor) => factor.strategy === PASSWORD_FACTOR)) {
          setPassword('');
          setStep('password');
          return;
        }
        if (!findEmailCodeFactor(next)) {
          setError(
            'This account cannot be signed in with a password or an email code. Use a provider button above, or sign in through your browser.',
          );
          return;
        }
        await sendEmailCodeFor(next);
        return;
      }

      setError(
        'The AGI account service returned a sign-in state AGI Desktop does not handle. Use browser sign-in below.',
      );
    },
    [adoptClerkSession, sendEmailCodeFor],
  );

  const submitEmail = useCallback(async () => {
    if (isBusy) return;
    if (!email.trim()) {
      setError('Enter the email address for your AGI account.');
      return;
    }

    beginAttempt();
    setBusy('email');
    try {
      await applySignInState(await createIdentifierSignIn(email.trim()));
    } catch (attemptError) {
      setError(describeFailure(attemptError));
    } finally {
      setBusy(null);
    }
  }, [applySignInState, beginAttempt, email, isBusy]);

  const submitPassword = useCallback(async () => {
    if (isBusy || !signIn) return;
    if (!password) {
      setError('Enter your password, or ask for an email code instead.');
      return;
    }

    beginAttempt();
    setBusy('password');
    try {
      const attempted = await attemptPassword(signIn.id, password);
      setPassword('');
      await applySignInState(attempted);
    } catch (attemptError) {
      setError(describeFailure(attemptError));
    } finally {
      setBusy(null);
    }
  }, [applySignInState, beginAttempt, isBusy, password, signIn]);

  const sendEmailCode = useCallback(async () => {
    if (isBusy) return;
    if (!email.trim()) {
      setError('Enter the email address for your AGI account.');
      return;
    }

    beginAttempt();
    setBusy('send_code');
    try {
      await sendEmailCodeFor(signIn ?? (await createIdentifierSignIn(email.trim())));
    } catch (attemptError) {
      setError(describeFailure(attemptError));
    } finally {
      setBusy(null);
    }
  }, [beginAttempt, email, isBusy, sendEmailCodeFor, signIn]);

  const submitEmailCode = useCallback(async () => {
    if (isBusy || !signIn) return;
    if (!code.trim()) {
      setError('Enter the code we emailed you.');
      return;
    }

    beginAttempt();
    setBusy('code');
    try {
      await applySignInState(await attemptEmailCode(signIn.id, code.trim()));
    } catch (attemptError) {
      setError(describeFailure(attemptError));
    } finally {
      setBusy(null);
    }
  }, [applySignInState, beginAttempt, code, isBusy, signIn]);

  const submitSecondFactor = useCallback(async () => {
    if (isBusy || !signIn || !secondFactor) return;
    if (!code.trim()) {
      setError('Enter your verification code.');
      return;
    }

    beginAttempt();
    setBusy('mfa');
    try {
      await applySignInState(
        await attemptSecondFactor(signIn.id, secondFactor.strategy, code.trim()),
      );
    } catch (attemptError) {
      setError(describeFailure(attemptError));
    } finally {
      setBusy(null);
    }
  }, [applySignInState, beginAttempt, code, isBusy, secondFactor, signIn]);

  const startSocial = useCallback(
    async (provider: AuthProviderId, label: string) => {
      if (isBusy || ssoPending) return;
      beginAttempt();
      try {
        const handle = await beginSocialSignIn(socialSignInStrategy(provider));
        setSsoPending({ providerLabel: label, signIn: handle.signIn });
        setNotice(`Finish signing in with ${label} in your browser, then return here.`);
      } catch (attemptError) {
        setError(describeFailure(attemptError));
      }
    },
    [beginAttempt, isBusy, ssoPending],
  );

  const cancelSocial = useCallback(() => {
    setSsoPending(null);
    setNotice(null);
    resetClerkClient();
  }, []);

  useEffect(() => {
    const onCallback = (event: Event) => {
      const detail = (event as CustomEvent<{ rotatingTokenNonce?: string }>).detail;
      const pending = ssoPendingRef.current;
      if (!pending || !detail?.rotatingTokenNonce) return;

      void (async () => {
        setNotice(`Completing ${pending.providerLabel} sign-in...`);
        try {
          const clerkSessionToken = await completeSocialSignIn(
            pending.signIn,
            detail.rotatingTokenNonce as string,
          );
          const credential = await exchangeClerkSessionForCloudCredential(clerkSessionToken);
          resetClerkClient();
          const result = await completeNativeSignIn({
            accessToken: credential.accessToken,
            ...(credential.refreshToken ? { refreshToken: credential.refreshToken } : {}),
          });
          setSsoPending(null);
          setNotice(null);
          if (result.error) {
            setError(result.error);
            return;
          }
          onSuccess?.();
        } catch (callbackError) {
          setSsoPending(null);
          setNotice(null);
          setError(describeFailure(callbackError));
        }
      })();
    };

    const onCallbackError = (event: Event) => {
      const detail = (event as CustomEvent<{ error?: string; error_description?: string }>).detail;
      if (!ssoPendingRef.current) return;
      setSsoPending(null);
      setNotice(null);
      setError(
        detail?.error_description ||
          `The provider sign-in failed${detail?.error ? `: ${detail.error}` : '.'}`,
      );
    };

    window.addEventListener('cloud-sso-callback', onCallback);
    window.addEventListener('cloud-sso-error', onCallbackError);
    return () => {
      window.removeEventListener('cloud-sso-callback', onCallback);
      window.removeEventListener('cloud-sso-error', onCallbackError);
    };
  }, [completeNativeSignIn, onSuccess]);

  const signInThroughBrowser = useCallback(async () => {
    if (isBusy) return;
    beginAttempt();
    setBusy('browser');
    try {
      const result = await browserFallbackSignIn('', '');
      if (result.error) {
        setError(result.error);
        return;
      }
      onSuccess?.();
    } catch (fallbackError) {
      setError(describeFailure(fallbackError));
    } finally {
      setBusy(null);
    }
  }, [beginAttempt, browserFallbackSignIn, isBusy, onSuccess]);

  const restart = useCallback(() => {
    setStep('email');
    setSignIn(null);
    setSecondFactor(null);
    setCode('');
    setPassword('');
    setError(null);
    setNotice(null);
    resetClerkClient();
  }, []);

  const detail =
    step === 'password' || step === 'email_code' ? (
      <div className={AUTH_DETAIL_ROW_CLASS}>
        <span>{step === 'email_code' ? `We sent a code to ${email.trim()}` : email.trim()}</span>
        <button type="button" className={AUTH_QUIET_BUTTON_CLASS} onClick={restart}>
          Edit
        </button>
      </div>
    ) : step === 'second_factor' && secondFactor ? (
      <p className="text-center">{secondFactorLabel(secondFactor)}</p>
    ) : undefined;

  const messages = (
    <>
      {displayedError ? (
        <p role="alert" data-testid="native-sign-in-error" className={AUTH_ERROR_CLASS}>
          {displayedError}
        </p>
      ) : null}
      {notice && !displayedError ? (
        <p role="status" data-testid="native-sign-in-notice" className={AUTH_ASIDE_CLASS}>
          {notice}
        </p>
      ) : null}
    </>
  );

  const footer = (
    <>
      <AuthLegalFooter />
      <div className={AUTH_QUIET_LINKS_CLASS}>
        <button
          type="button"
          className={AUTH_FOOTER_LINK_CLASS}
          disabled={isBusy}
          aria-busy={busy === 'browser' || undefined}
          onClick={() => void signInThroughBrowser()}
        >
          {busy === 'browser'
            ? 'Waiting for browser approval...'
            : 'Sign in through your browser instead'}
        </button>
        {supportsLocalAppMode ? (
          <button type="button" className={AUTH_FOOTER_LINK_CLASS} onClick={() => setMode('local')}>
            Use Local Mode
          </button>
        ) : null}
      </div>
      {supportsLocalAppMode ? (
        <p className={AUTH_ASIDE_CLASS}>Local Mode stays available without an account.</p>
      ) : null}
    </>
  );

  if (!nativeConfigured) {
    return (
      <AuthStepFrame heading={HEADINGS.email} footer={footer}>
        <p className={AUTH_ASIDE_CLASS}>
          In-app sign-in is not configured in this build, so AGI Desktop signs you in through your
          browser instead.
        </p>
        {messages}
      </AuthStepFrame>
    );
  }

  if (ssoPending) {
    return (
      <div data-testid="sso-pending">
        <AuthStepFrame
          heading={`Waiting for ${ssoPending.providerLabel}`}
          detail={
            <p className="text-center">
              {ssoPending.providerLabel} does not allow sign-in inside an app window, so it opened
              in your browser. AGI Desktop finishes when you come back.
            </p>
          }
          footer={footer}
        >
          <div className="flex justify-center">
            <Spinner size="default" />
          </div>
          {messages}
          <div className={AUTH_STEP_LINKS_CLASS}>
            <button type="button" className={AUTH_QUIET_BUTTON_CLASS} onClick={cancelSocial}>
              Cancel
            </button>
          </div>
        </AuthStepFrame>
      </div>
    );
  }

  if (step === 'password_reset_required') {
    return (
      <AuthStepFrame heading={HEADINGS[step]} detail={detail} footer={footer}>
        <div data-testid="password-reset-required">
          <p className={AUTH_ASIDE_CLASS}>
            AGI Desktop does not run password resets in the app. Resetting one proves you own the
            email, so it happens on the account service itself.
          </p>
          {messages}
          <button
            type="button"
            className={AUTH_QUIET_BUTTON_CLASS}
            onClick={() => void openExternalUrl(`${WEB_APP_URL}/login`)}
          >
            Reset your password in your browser
          </button>
        </div>
        <div className={AUTH_STEP_LINKS_CLASS}>
          <button type="button" className={AUTH_QUIET_BUTTON_CLASS} onClick={restart}>
            Use a different email
          </button>
        </div>
      </AuthStepFrame>
    );
  }

  if (step === 'second_factor' && secondFactor) {
    return (
      <AuthStepFrame heading={HEADINGS[step]} detail={detail} footer={footer}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitSecondFactor();
          }}
        >
          <AuthField
            label={secondFactorLabel(secondFactor)}
            inputMode={secondFactor.strategy === 'backup_code' ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            autoFocus
            value={code}
            disabled={isBusy}
            onChange={(event) => setCode(event.target.value)}
          />
          {messages}
          <AuthSubmitButton label={CONTINUE_LABEL} busy={busy === 'mfa'} disabled={isBusy} />
        </form>
        <div className={AUTH_STEP_LINKS_CLASS}>
          {signIn?.supportedSecondFactors
            .filter(
              (factor) =>
                SUPPORTED_SECOND_FACTORS.has(factor.strategy) &&
                factor.strategy !== secondFactor.strategy,
            )
            .map((factor) => (
              <button
                key={factor.strategy}
                type="button"
                className={AUTH_QUIET_BUTTON_CLASS}
                disabled={isBusy}
                onClick={() => {
                  setSecondFactor(factor);
                  setCode('');
                  setNotice(null);
                  if (factor.strategy === 'phone_code' && signIn) {
                    void prepareSecondFactor(signIn.id, factor)
                      .then((prepared) => {
                        setSignIn(prepared);
                        setNotice('We sent a code to your phone.');
                      })
                      .catch((prepareError: unknown) => setError(describeFailure(prepareError)));
                  }
                }}
              >
                Use {secondFactorLabel(factor).toLowerCase()}
              </button>
            ))}
          <button type="button" className={AUTH_QUIET_BUTTON_CLASS} onClick={restart}>
            Use a different email
          </button>
        </div>
      </AuthStepFrame>
    );
  }

  if (step === 'email_code') {
    return (
      <AuthStepFrame heading={HEADINGS[step]} detail={detail} footer={footer}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitEmailCode();
          }}
        >
          <AuthField
            label={CODE_FIELD_LABEL}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            disabled={isBusy}
            onChange={(event) => setCode(event.target.value)}
          />
          {messages}
          <AuthSubmitButton label={CONTINUE_LABEL} busy={busy === 'code'} disabled={isBusy} />
        </form>
        <div className={AUTH_STEP_LINKS_CLASS}>
          <button
            type="button"
            className={AUTH_QUIET_BUTTON_CLASS}
            disabled={isBusy}
            onClick={() => void sendEmailCode()}
          >
            Send a new code
          </button>
        </div>
      </AuthStepFrame>
    );
  }

  if (step === 'password') {
    return (
      <AuthStepFrame heading={HEADINGS[step]} detail={detail} footer={footer}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitPassword();
          }}
        >
          <AuthPasswordField
            label={PASSWORD_FIELD_LABEL}
            value={password}
            disabled={isBusy}
            autoComplete="current-password"
            onChange={setPassword}
          />
          {messages}
          <AuthSubmitButton label={CONTINUE_LABEL} busy={busy === 'password'} disabled={isBusy} />
        </form>
        <div className={AUTH_STEP_LINKS_CLASS}>
          <button
            type="button"
            className={AUTH_QUIET_BUTTON_CLASS}
            disabled={isBusy}
            aria-busy={busy === 'send_code' || undefined}
            onClick={() => void sendEmailCode()}
          >
            Email me a code instead
          </button>
        </div>
      </AuthStepFrame>
    );
  }

  return (
    <AuthStepFrame heading={HEADINGS.email} footer={footer}>
      <AuthProviderButtons
        providers={providers}
        pending={null}
        disabled={isBusy}
        onStart={(provider) => {
          const chosen = providers.find((candidate) => candidate.id === provider);
          if (chosen) void startSocial(chosen.id, chosen.label);
        }}
      />

      <AuthDivider />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submitEmail();
        }}
      >
        <AuthField
          label={EMAIL_FIELD_LABEL}
          type="email"
          inputMode="email"
          autoComplete="username"
          autoFocus
          value={email}
          disabled={isBusy}
          onChange={(event) => setEmail(event.target.value)}
        />
        {messages}
        <AuthSubmitButton label={CONTINUE_LABEL} busy={busy === 'email'} disabled={isBusy} />
      </form>

      <p className={AUTH_SWITCH_CLASS}>
        Don&apos;t have an account?{' '}
        <button
          type="button"
          className={AUTH_QUIET_BUTTON_CLASS}
          onClick={() =>
            void openExternalUrl(`${WEB_APP_URL}${WEB_SIGNUP_PATH}?${DESKTOP_SURFACE_QUERY}`)
          }
        >
          Sign up
        </button>
      </p>
    </AuthStepFrame>
  );
}

export default NativeSignInCard;
