'use client';

import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import { beginBrowserSignIn } from '@/features/desktop-host/lib/browser-sign-in';
import { AuthStepFrame } from '@/features/auth/AuthStepFrame';
import {
  AUTH_ERROR_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
  AUTH_STANDALONE_LINK_CLASS,
  AUTH_STEP_LINKS_CLASS,
} from '@/features/auth/authStyles';
import { useIdentityTicketSignIn } from '@/features/auth/identityAuthAdapter';

const REDEEM_PATH = '/api/auth/desktop/redeem';
const SIGNING_IN = 'Signing you in';
const FAILED_HEADING = 'Sign-in did not finish';
const INCOMPLETE = 'This sign-in link is incomplete. Start again from your browser.';
const REDEEM_FAILED = 'This sign-in could not be finished. Start again from your browser.';
const RETRY_LABEL = 'Continue in your browser';
const SIGN_IN_HERE = 'Sign in here instead';

interface SignInGrant {
  code: string;
  verifier: string;
}

function takeGrantFromLocation(): SignInGrant | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  window.history.replaceState(null, '', window.location.pathname);
  const code = params.get('code');
  const verifier = params.get('verifier');
  return code && verifier ? { code, verifier } : null;
}

function readErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return null;
}

async function redeemGrant(grant: SignInGrant): Promise<string> {
  const response = await fetch(REDEEM_PATH, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(grant),
  });
  const body: unknown = await response.json().catch(() => null);
  const ticket =
    body && typeof body === 'object' ? (body as { ticket?: unknown }).ticket : undefined;
  if (!response.ok || typeof ticket !== 'string') {
    throw new Error(readErrorMessage(body) ?? REDEEM_FAILED);
  }
  return ticket;
}

export function DesktopSignInComplete({
  completeUrl,
  loginUrl,
}: {
  completeUrl: string;
  loginUrl: string;
}) {
  const { ready, signInWithTicket } = useIdentityTicketSignIn();
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    const grant = takeGrantFromLocation();
    const finish = async (): Promise<string | null> => {
      if (!grant) return INCOMPLETE;
      try {
        return await signInWithTicket(await redeemGrant(grant), completeUrl);
      } catch (cause) {
        return cause instanceof Error && cause.message ? cause.message : REDEEM_FAILED;
      }
    };
    void finish().then(setFailure);
  }, [ready, signInWithTicket, completeUrl]);

  if (failure === null) {
    return (
      <AuthStepFrame heading={SIGNING_IN}>
        <p role="status" className="flex items-center justify-center">
          <Spinner size="sm" aria-label={SIGNING_IN} />
        </p>
      </AuthStepFrame>
    );
  }

  return (
    <AuthStepFrame heading={FAILED_HEADING}>
      <p role="alert" className={AUTH_ERROR_CLASS}>
        {failure}
      </p>
      <button
        type="button"
        className={`${AUTH_PRIMARY_BUTTON_CLASS} w-full`}
        onClick={() => void beginBrowserSignIn()}
      >
        {RETRY_LABEL}
      </button>
      <div className={AUTH_STEP_LINKS_CLASS}>
        <a className={AUTH_STANDALONE_LINK_CLASS} href={loginUrl}>
          {SIGN_IN_HERE}
        </a>
      </div>
    </AuthStepFrame>
  );
}
