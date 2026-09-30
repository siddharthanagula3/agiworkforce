'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  accountSecurityVerifyPageHref,
  readPasskeyRequired,
} from '@agiworkforce/cloud-contracts/account-security';
import { DESKTOP_SIGN_IN_PATH, desktopSignInLink } from '@agiworkforce/local-runtime-contract';
import { Spinner } from '@agiworkforce/ui';
import { AuthStepFrame } from '@/features/auth/AuthStepFrame';
import { AUTH_ERROR_CLASS, AUTH_PRIMARY_BUTTON_CLASS } from '@/features/auth/authStyles';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useSession } from '@/lib/identity/client';
import { toUserMessage } from '@/lib/user-error-message';

const GRANT_PATH = '/api/auth/desktop/grant';
const HEADING = 'Return to AGI Cloud';
const DETAIL =
  'Your browser asks to open AGI Cloud. Allow it, and the desktop app finishes signing you in. You can close this tab afterwards.';
const OPEN_LABEL = 'Open AGI Cloud';
const PREPARING = 'Preparing your sign-in';
const GRANT_FAILED = 'This sign-in could not be handed to the desktop app. Try again.';
const INVALID_HEADING = 'Start from the desktop app';
const INVALID_DETAIL =
  'This link is missing part of the sign-in. Open AGI Cloud on your computer and choose Continue in your browser again.';

type HandoffState = { kind: 'preparing' } | { kind: 'ready' } | { kind: 'failed'; message: string };

type GrantResult = { kind: 'granted'; code: string } | { kind: 'passkey_required' };

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

async function requestGrant(challenge: string): Promise<GrantResult> {
  const response = await fetch(GRANT_PATH, {
    method: 'POST',
    credentials: 'include',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ challenge }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 403 && readPasskeyRequired(body)) return { kind: 'passkey_required' };
  const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined;
  if (!response.ok || typeof code !== 'string') {
    throw new Error(readErrorMessage(body) ?? GRANT_FAILED);
  }
  return { kind: 'granted', code };
}

function returnPathFor(challenge: string): string {
  return `${DESKTOP_SIGN_IN_PATH}?${new URLSearchParams({ challenge }).toString()}`;
}

function signInUrlFor(challenge: string): string {
  return `/login?${new URLSearchParams({ redirectTo: returnPathFor(challenge) }).toString()}`;
}

export function DesktopSignInHandoff({ challenge }: { challenge: string | null }) {
  const session = useSession();
  const [state, setState] = useState<HandoffState>({ kind: 'preparing' });
  const started = useRef(false);

  const handOff = useCallback(async (): Promise<HandoffState> => {
    if (challenge === null) return { kind: 'failed', message: GRANT_FAILED };
    try {
      const grant = await requestGrant(challenge);
      if (grant.kind === 'passkey_required') {
        window.location.assign(accountSecurityVerifyPageHref(returnPathFor(challenge)));
        return { kind: 'preparing' };
      }
      window.location.assign(desktopSignInLink(grant.code, challenge));
      return { kind: 'ready' };
    } catch (cause) {
      return { kind: 'failed', message: toUserMessage(cause, GRANT_FAILED) };
    }
  }, [challenge]);

  useEffect(() => {
    if (challenge === null || !session.isLoaded || started.current) return;
    started.current = true;
    if (!session.isSignedIn) {
      window.location.assign(signInUrlFor(challenge));
      return;
    }
    void handOff().then(setState);
  }, [challenge, handOff, session.isLoaded, session.isSignedIn]);

  if (challenge === null) {
    return (
      <AuthStepFrame heading={INVALID_HEADING} detail={<p>{INVALID_DETAIL}</p>}>
        {null}
      </AuthStepFrame>
    );
  }

  return (
    <AuthStepFrame heading={HEADING} detail={<p>{DETAIL}</p>}>
      {state.kind === 'preparing' ? (
        <p role="status" className="flex items-center justify-center gap-2 text-sm text-text-muted">
          <Spinner size="sm" />
          <span>{PREPARING}</span>
        </p>
      ) : (
        <>
          <button
            type="button"
            className={`${AUTH_PRIMARY_BUTTON_CLASS} w-full`}
            onClick={() => {
              setState({ kind: 'preparing' });
              void handOff().then(setState);
            }}
          >
            {OPEN_LABEL}
          </button>
          {state.kind === 'failed' ? (
            <p role="alert" className={AUTH_ERROR_CLASS}>
              {state.message}
            </p>
          ) : null}
        </>
      )}
    </AuthStepFrame>
  );
}
