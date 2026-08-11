/**
 * Native in-app sign-in for AGI Desktop.
 *
 * Replaces the device-authorization child window. That window carried no Clerk
 * browser cookie, so its approval button could never resolve ("Checking…"
 * forever), it rendered unstyled, and a backend 500 reached the user as "AGI
 * Cloud rejected the device sign-in request" — blaming the account for a server
 * fault. Desktop ships a browser engine; it can authenticate the user itself.
 *
 * What is native and what is not:
 * - Email + password and email one-time code run entirely in this form.
 * - Multi-factor (TOTP, SMS, backup code) runs entirely in this form.
 * - Password reset and account creation are refused HERE and handed to the web
 *   app with a visible button. They are separate ceremonies and half-building
 *   them is exactly the failure this work removes.
 * - Social/SSO opens the system browser, because Google, Microsoft, and Apple
 *   all refuse OAuth inside embedded webviews. It shows a pending state with a
 *   cancel, and returns through the `agiworkforce://sso-callback` deep link.
 *
 * Every failure renders its real cause. A 5xx is stated as a service fault and
 * never as a rejection.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Loader2, Lock, LogIn, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { WEB_APP_URL } from '../../api/config';
import { supportsLocalAppMode } from '../../lib/runtimeEnvironment';
import { openExternalUrl } from '../../utils/navigation';
import { useAppModeStore } from '../../stores/appModeStore';
import { selectAuthError, useAuthStore } from '../../stores/auth';
import {
  ClerkAuthError,
  attemptEmailCode,
  attemptSecondFactor,
  createIdentifierSignIn,
  createPasswordSignIn,
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
  SOCIAL_PROVIDERS,
  beginSocialSignIn,
  completeSocialSignIn,
} from '../../services/desktopSocialSignIn';

type Step = 'credentials' | 'email_code' | 'second_factor' | 'password_reset_required';

interface NativeSignInCardProps {
  onSuccess?: () => void;
}

interface SsoPending {
  providerLabel: string;
  signIn: ClerkSignIn;
}

/** A second factor Clerk can actually collect in this form. */
const SUPPORTED_SECOND_FACTORS = new Set(['totp', 'phone_code', 'backup_code']);

function secondFactorLabel(factor: ClerkSecondFactor): string {
  switch (factor.strategy) {
    case 'totp':
      return 'Authenticator app code';
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

/**
 * Turn any thrown value into the sentence the user should read.
 *
 * `ClerkAuthError` and `NativeSignInExchangeError` already carry honest,
 * specific text (including the server-fault wording for 5xx), so they are
 * passed through verbatim. Only a genuinely unknown throw gets a generic
 * message, and even that one says it is unexpected rather than blaming the
 * account.
 */
function describeFailure(error: unknown): string {
  if (error instanceof ClerkAuthError || error instanceof NativeSignInExchangeError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'AGI Desktop hit an unexpected problem while signing you in.';
}

export function NativeSignInCard({ onSuccess }: NativeSignInCardProps) {
  const completeNativeSignIn = useAuthStore((state) => state.completeNativeSignIn);
  const browserFallbackSignIn = useAuthStore((state) => state.signIn);
  const clearStoreError = useAuthStore((state) => state.clearError);
  const storeAuthError = useAuthStore(selectAuthError);
  const setMode = useAppModeStore((state) => state.setMode);

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [signIn, setSignIn] = useState<ClerkSignIn | null>(null);
  const [secondFactor, setSecondFactor] = useState<ClerkSecondFactor | null>(null);
  const [busy, setBusy] = useState<null | 'password' | 'code' | 'send_code' | 'mfa' | 'browser'>(
    null,
  );
  const [ssoPending, setSsoPending] = useState<SsoPending | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nativeConfigured = isNativeClerkSignInConfigured();
  const ssoPendingRef = useRef<SsoPending | null>(null);
  ssoPendingRef.current = ssoPending;

  // The auth store holds WHY a previous session ended ("…has expired",
  // "…no longer authorized"). Showing only this attempt's error would turn a
  // revoked session into an indistinguishable fresh sign-in prompt.
  const displayedError = error ?? storeAuthError;

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

  /** Common tail: Clerk session → durable AGI Cloud credential → app state. */
  const adoptClerkSession = useCallback(
    async (sessionId: string) => {
      const clerkSessionToken = await createSessionToken(sessionId);
      const credential = await exchangeClerkSessionForCloudCredential(clerkSessionToken);
      // The Clerk client credential has done its job; do not keep it around.
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

  /** Route a Clerk sign-in resource to the step that can advance it. */
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
          // Do not strand the user in a code box no factor can satisfy.
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
        // Refused on purpose, with a real way forward.
        setStep('password_reset_required');
        return;
      }

      if (next.status === 'needs_first_factor') {
        const emailFactor = findEmailCodeFactor(next);
        if (!emailFactor?.emailAddressId) {
          setError(
            'This account cannot be signed in with a password or an email code. Use a provider button above, or sign in through your browser.',
          );
          return;
        }
        const prepared = await prepareEmailCode(next.id, emailFactor.emailAddressId);
        setSignIn(prepared);
        setCode('');
        setStep('email_code');
        setNotice(`We sent a sign-in code to ${emailFactor.safeIdentifier ?? email}.`);
        return;
      }

      setError(
        'The AGI account service returned a sign-in state AGI Desktop does not handle. Use browser sign-in below.',
      );
    },
    [adoptClerkSession, email],
  );

  const submitPassword = useCallback(async () => {
    if (busy) return;
    if (!email.trim()) {
      setError('Enter the email address for your AGI account.');
      return;
    }
    if (!password) {
      setError('Enter your password, or use "Email me a sign-in code" instead.');
      return;
    }

    beginAttempt();
    setBusy('password');
    try {
      const created = await createPasswordSignIn(email.trim(), password);
      // Clear the password from component state the moment Clerk has it.
      setPassword('');
      await applySignInState(created);
    } catch (attemptError) {
      setError(describeFailure(attemptError));
    } finally {
      setBusy(null);
    }
  }, [applySignInState, beginAttempt, busy, email, password]);

  const sendEmailCode = useCallback(async () => {
    if (busy) return;
    if (!email.trim()) {
      setError('Enter the email address for your AGI account.');
      return;
    }

    beginAttempt();
    setBusy('send_code');
    try {
      const created = signIn ?? (await createIdentifierSignIn(email.trim()));
      const emailFactor = findEmailCodeFactor(created);
      if (!emailFactor?.emailAddressId) {
        setError('This account does not support email sign-in codes. Use your password instead.');
        return;
      }
      const prepared = await prepareEmailCode(created.id, emailFactor.emailAddressId);
      setSignIn(prepared);
      setCode('');
      setStep('email_code');
      setNotice(`We sent a sign-in code to ${emailFactor.safeIdentifier ?? email.trim()}.`);
    } catch (attemptError) {
      setError(describeFailure(attemptError));
    } finally {
      setBusy(null);
    }
  }, [beginAttempt, busy, email, signIn]);

  const submitEmailCode = useCallback(async () => {
    if (busy || !signIn) return;
    if (!code.trim()) {
      setError('Enter the code we emailed you.');
      return;
    }

    beginAttempt();
    setBusy('code');
    try {
      const attempted = await attemptEmailCode(signIn.id, code.trim());
      await applySignInState(attempted);
    } catch (attemptError) {
      setError(describeFailure(attemptError));
    } finally {
      setBusy(null);
    }
  }, [applySignInState, beginAttempt, busy, code, signIn]);

  const submitSecondFactor = useCallback(async () => {
    if (busy || !signIn || !secondFactor) return;
    if (!code.trim()) {
      setError('Enter your verification code.');
      return;
    }

    beginAttempt();
    setBusy('mfa');
    try {
      const attempted = await attemptSecondFactor(signIn.id, secondFactor.strategy, code.trim());
      await applySignInState(attempted);
    } catch (attemptError) {
      setError(describeFailure(attemptError));
    } finally {
      setBusy(null);
    }
  }, [applySignInState, beginAttempt, busy, code, secondFactor, signIn]);

  /* ---------------------------------------------------------------- */
  /* Social / SSO — the one hop out of the app, with a visible pending */
  /* state and a cancel.                                              */
  /* ---------------------------------------------------------------- */

  const startSocial = useCallback(
    async (strategy: string, label: string) => {
      if (busy || ssoPending) return;
      beginAttempt();
      try {
        const handle = await beginSocialSignIn(strategy);
        setSsoPending({ providerLabel: label, signIn: handle.signIn });
        setNotice(`Finish signing in with ${label} in your browser, then return here.`);
      } catch (attemptError) {
        setError(describeFailure(attemptError));
      }
    },
    [beginAttempt, busy, ssoPending],
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
        setNotice(`Completing ${pending.providerLabel} sign-in…`);
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

  /* ---------------------------------------------------------------- */
  /* Fallback: the original browser-approval device flow.             */
  /* ---------------------------------------------------------------- */

  const signInThroughBrowser = useCallback(async () => {
    if (busy) return;
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
  }, [beginAttempt, browserFallbackSignIn, busy, onSuccess]);

  const restart = useCallback(() => {
    setStep('credentials');
    setSignIn(null);
    setSecondFactor(null);
    setCode('');
    setPassword('');
    setError(null);
    setNotice(null);
    resetClerkClient();
  }, []);

  const isBusy = busy !== null;

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl shadow-black/5">
      {/* The AuthPage header carries the brand mark; repeating it here made
          the column read as two stacked logos. Keep the card content-first,
          matching the web embedded auth card. */}
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Sign in to AGI Cloud</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {step === 'credentials'
          ? supportsLocalAppMode
            ? 'Sign in right here. Local Mode keeps working without an account.'
            : 'Sign in right here to continue to AGI Cloud.'
          : step === 'email_code'
            ? 'Enter the code we emailed you.'
            : step === 'second_factor'
              ? 'One more step to confirm it is you.'
              : 'Your password needs to be reset before you can sign in.'}
      </p>

      {displayedError ? (
        <div
          role="alert"
          data-testid="native-sign-in-error"
          className="mt-5 rounded-lg border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-sm text-destructive"
        >
          {displayedError}
        </div>
      ) : null}

      {notice && !displayedError ? (
        <p
          role="status"
          data-testid="native-sign-in-notice"
          className="mt-5 rounded-lg border border-border bg-muted/35 px-3.5 py-3 text-sm text-muted-foreground"
        >
          {notice}
        </p>
      ) : null}

      {!nativeConfigured ? (
        <div className="mt-5 rounded-lg border border-border bg-muted/35 px-3.5 py-3 text-sm text-muted-foreground">
          In-app sign-in is not configured in this build, so AGI Desktop will sign you in through
          your browser instead.
        </div>
      ) : null}

      {ssoPending ? (
        <div
          className="mt-5 rounded-xl border border-border bg-muted/35 p-4"
          data-testid="sso-pending"
        >
          <div className="flex items-start gap-3">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Waiting for {ssoPending.providerLabel}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {ssoPending.providerLabel} does not allow sign-in inside an app window, so it opened
                in your browser. AGI Desktop finishes automatically when you come back.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-9 w-full"
            onClick={cancelSocial}
          >
            Cancel
          </Button>
        </div>
      ) : null}

      {nativeConfigured && !ssoPending && step === 'credentials' ? (
        <form
          className="mt-5 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitPassword();
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="agi-email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <Input
              id="agi-email"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              disabled={isBusy}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="agi-password" className="text-sm font-medium text-foreground">
              Password
            </label>
            <Input
              id="agi-password"
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={isBusy}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
            />
          </div>

          <Button
            type="submit"
            className="h-11 w-full"
            disabled={isBusy}
            aria-busy={busy === 'password'}
          >
            {busy === 'password' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <LogIn className="h-4 w-4" aria-hidden="true" />
            )}
            {busy === 'password' ? 'Signing in…' : 'Sign in'}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-10 w-full"
            disabled={isBusy}
            aria-busy={busy === 'send_code'}
            onClick={() => void sendEmailCode()}
          >
            {busy === 'send_code' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Mail className="h-4 w-4" aria-hidden="true" />
            )}
            {busy === 'send_code' ? 'Sending code…' : 'Email me a sign-in code'}
          </Button>
        </form>
      ) : null}

      {nativeConfigured && !ssoPending && step === 'email_code' ? (
        <form
          className="mt-5 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitEmailCode();
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="agi-email-code" className="text-sm font-medium text-foreground">
              Sign-in code
            </label>
            <Input
              id="agi-email-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              disabled={isBusy}
              onChange={(event) => setCode(event.target.value)}
              placeholder="6-digit code"
            />
          </div>
          <Button
            type="submit"
            className="h-11 w-full"
            disabled={isBusy}
            aria-busy={busy === 'code'}
          >
            {busy === 'code' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {busy === 'code' ? 'Verifying…' : 'Verify and sign in'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-9 w-full"
            disabled={isBusy}
            onClick={() => void sendEmailCode()}
          >
            Send a new code
          </Button>
        </form>
      ) : null}

      {nativeConfigured && !ssoPending && step === 'second_factor' && secondFactor ? (
        <form
          className="mt-5 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitSecondFactor();
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="agi-mfa-code" className="text-sm font-medium text-foreground">
              {secondFactorLabel(secondFactor)}
            </label>
            <Input
              id="agi-mfa-code"
              inputMode={secondFactor.strategy === 'backup_code' ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              autoFocus
              value={code}
              disabled={isBusy}
              onChange={(event) => setCode(event.target.value)}
              placeholder={secondFactor.strategy === 'backup_code' ? 'Backup code' : '6-digit code'}
            />
          </div>
          <Button
            type="submit"
            className="h-11 w-full"
            disabled={isBusy}
            aria-busy={busy === 'mfa'}
          >
            {busy === 'mfa' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {busy === 'mfa' ? 'Verifying…' : 'Verify and sign in'}
          </Button>
          {signIn && signIn.supportedSecondFactors.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {signIn.supportedSecondFactors
                .filter(
                  (factor) =>
                    SUPPORTED_SECOND_FACTORS.has(factor.strategy) &&
                    factor.strategy !== secondFactor.strategy,
                )
                .map((factor) => (
                  <Button
                    key={factor.strategy}
                    type="button"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
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
                          .catch((prepareError: unknown) =>
                            setError(describeFailure(prepareError)),
                          );
                      }
                    }}
                  >
                    Use {secondFactorLabel(factor).toLowerCase()}
                  </Button>
                ))}
            </div>
          ) : null}
        </form>
      ) : null}

      {nativeConfigured && !ssoPending && step === 'password_reset_required' ? (
        <div className="mt-5 space-y-3" data-testid="password-reset-required">
          <p className="text-sm leading-6 text-muted-foreground">
            AGI Cloud requires a new password for this account. AGI Desktop does not run password
            resets in the app — resetting a password proves ownership of your email, and that has to
            happen on the account service itself.
          </p>
          <Button
            type="button"
            className="h-10 w-full"
            onClick={() => void openExternalUrl(`${WEB_APP_URL}/login`)}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {'Reset your password in your browser'}
          </Button>
          <Button type="button" variant="ghost" className="h-9 w-full" onClick={restart}>
            Back to sign in
          </Button>
        </div>
      ) : null}

      {nativeConfigured && !ssoPending && step === 'credentials' ? (
        <>
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2">
            {SOCIAL_PROVIDERS.map((provider) => (
              <Button
                key={provider.id}
                type="button"
                variant="outline"
                className="h-10 w-full"
                disabled={isBusy}
                onClick={() => void startSocial(provider.strategy, provider.label)}
              >
                Continue with {provider.label}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-center text-xs leading-5 text-muted-foreground">
            {SOCIAL_PROVIDERS.map((provider) => provider.label).join(', ')} require their own
            sign-in page, so these open your browser and return here.
          </p>
        </>
      ) : null}

      {step !== 'credentials' && step !== 'password_reset_required' ? (
        <Button type="button" variant="ghost" className="mt-3 h-9 w-full" onClick={restart}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {'Use a different email'}
        </Button>
      ) : null}

      <div className="mt-6 space-y-2 border-t border-border pt-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
          <p className="text-xs leading-5 text-muted-foreground">
            Your password goes only to the AGI account service. AGI Desktop stores a short-lived,
            revocable session in your system credential vault — never your password.
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="h-9 w-full"
          disabled={isBusy}
          aria-busy={busy === 'browser'}
          onClick={() => void signInThroughBrowser()}
        >
          {busy === 'browser' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {busy === 'browser'
            ? 'Waiting for browser approval…'
            : 'Sign in through your browser instead'}
        </Button>

        {supportsLocalAppMode ? (
          <button
            type="button"
            onClick={() => setMode('local')}
            className="flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Use Local Mode
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default NativeSignInCard;
