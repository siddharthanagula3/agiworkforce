'use client';

import { useSession } from '@/lib/identity/client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ADULT_ELIGIBILITY_ERROR_CODES } from '@agiworkforce/cloud-contracts';

import { addCsrfHeaders } from '@/lib/client/csrf';
import { SIGN_UP_AGREEMENT_NOT_APPLICABLE_STATUS } from '@/lib/auth/new-account';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { beginChatHandoff } from '@/features/auth/chatHandoff';
import { NEW_CHAT_PATH } from '@/features/chat/lib/new-chat-entry';
import { AuthProgress } from '@/features/auth/AuthProgress';
import { AuthStepFrame } from '@/features/auth/AuthStepFrame';
import { buildLoginCompleteUrl } from '@/features/auth/authRoutes';
import { AUTH_MUTED_LINE_CLASS, AUTH_PRIMARY_BUTTON_CLASS } from '@/features/auth/authStyles';
import { useMarketingEmailGrant } from '@/features/auth/marketingEmailChoice';
import { clearSignupAttemptMarkers, hasCurrentTermsGateMarker } from '../signupAttemptMarkers';

const RECORD_TIMEOUT_MS = 20_000;
const AGE_REFUSED_STATUS = 403;
const AGE_REFUSAL_CODES: readonly string[] = Object.values(ADULT_ELIGIBILITY_ERROR_CODES);

async function refusedForAge(response: Response): Promise<boolean> {
  if (response.status !== AGE_REFUSED_STATUS) return false;
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' && AGE_REFUSAL_CODES.includes(code);
}

function useWorkspaceHandoff(redirectTo: string) {
  const [returned, setReturned] = useState(false);
  const leave = useCallback(() => {
    if (redirectTo === NEW_CHAT_PATH && !beginChatHandoff()) {
      setReturned(true);
      return;
    }
    window.location.replace(redirectTo);
  }, [redirectTo]);
  return { returned, leave };
}

function OpenWorkspace({ href }: { href: string }) {
  return (
    <AuthStepFrame heading="Continue to your workspace">
      <a className={AUTH_PRIMARY_BUTTON_CLASS} href={href}>
        Open chat
      </a>
    </AuthStepFrame>
  );
}

export function ContinueWithCurrentTerms({ redirectTo }: { redirectTo: string }) {
  const started = useRef(false);
  const { returned, leave } = useWorkspaceHandoff(redirectTo);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    clearSignupAttemptMarkers();
    leave();
  }, [leave]);

  if (returned) return <OpenWorkspace href={redirectTo} />;
  return (
    <AuthStepFrame heading="Finishing signing in">
      <AuthProgress label="Taking you to your workspace" />
    </AuthStepFrame>
  );
}

export function RecordTermsAcceptance({
  redirectTo,
  surface = 'web-signup',
}: {
  redirectTo: string;
  surface?: 'web-signup' | 'web-login';
}) {
  const { isLoaded, isSignedIn } = useSession();
  const router = useRouter();
  const { returned, leave } = useWorkspaceHandoff(redirectTo);
  const [failure, setFailure] = useState<'none' | 'retryable' | 'outdated'>('none');
  const attempted = useRef(false);
  const grantedOnThisScreen = useMarketingEmailGrant();

  const record = useCallback(async () => {
    setFailure('none');
    const marketingEmailNoticeVersion = surface === 'web-login' ? grantedOnThisScreen : null;
    try {
      const response = await fetch('/api/terms/accept', {
        method: 'POST',
        credentials: 'include',
        signal: AbortSignal.timeout(RECORD_TIMEOUT_MS),
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          surface,
          version: POLICY_LAST_UPDATED.terms,
          ...(marketingEmailNoticeVersion ? { marketingEmailNoticeVersion } : {}),
        }),
      });
      if (response.status === 409) {
        setFailure('outdated');
        return;
      }
      if (
        response.status === SIGN_UP_AGREEMENT_NOT_APPLICABLE_STATUS ||
        (await refusedForAge(response))
      ) {
        clearSignupAttemptMarkers();
        if (surface === 'web-login') router.refresh();
        else {
          window.location.replace(
            buildLoginCompleteUrl({ redirectTo, desktopSurface: false, authRetry: false }),
          );
        }
        return;
      }
      if (!response.ok) throw new Error(`terms acceptance failed: ${response.status}`);
      clearSignupAttemptMarkers();
      leave();
    } catch {
      setFailure('retryable');
    }
  }, [grantedOnThisScreen, leave, redirectTo, router, surface]);

  useEffect(() => {
    if (!isLoaded || attempted.current) return;
    attempted.current = true;
    if (!isSignedIn) {
      clearSignupAttemptMarkers();
      window.location.replace(
        buildLoginCompleteUrl({ redirectTo, desktopSurface: false, authRetry: true }),
      );
      return;
    }
    if (surface === 'web-signup' && !hasCurrentTermsGateMarker()) {
      clearSignupAttemptMarkers();
      window.location.replace(
        buildLoginCompleteUrl({ redirectTo, desktopSurface: false, authRetry: false }),
      );
      return;
    }
    void record();
  }, [isLoaded, isSignedIn, record, redirectTo, surface]);

  if (returned) return <OpenWorkspace href={redirectTo} />;

  if (failure === 'outdated') {
    return (
      <div className="flex flex-col" data-testid="terms-version-outdated">
        <p className={AUTH_MUTED_LINE_CLASS}>
          The policies changed after this page loaded. Reload to review and accept the current
          version.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={AUTH_PRIMARY_BUTTON_CLASS}
        >
          Reload and review current policies
        </button>
      </div>
    );
  }

  if (failure === 'retryable') {
    return (
      <div className="flex flex-col" data-testid="terms-record-failed">
        <p className={AUTH_MUTED_LINE_CLASS} role="alert">
          We could not record your agreement to the terms. Try again to continue.
        </p>
        <button type="button" onClick={() => void record()} className={AUTH_PRIMARY_BUTTON_CLASS}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <AuthProgress
      label={surface === 'web-login' ? 'Finishing signing in' : 'Finishing setting up your account'}
    />
  );
}
