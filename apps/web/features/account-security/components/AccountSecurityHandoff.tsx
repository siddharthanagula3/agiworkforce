'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';

import {
  AUTH_ERROR_CLASS,
  AUTH_HINT_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
} from '@/features/auth/authStyles';
import { isPasskeyCancellation } from '@features/settings/lib/passkey-cancellation';
import { toUserMessage } from '@/lib/user-error-message';
import { canUseWebAuthn, verifyHandoffInBrowser } from '../lib/account-security-client';

export function AccountSecurityHandoff({ handoff }: { handoff: string }) {
  const [webAuthn, setWebAuthn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnUrl, setReturnUrl] = useState<string | null>(null);

  useEffect(() => {
    setWebAuthn(canUseWebAuthn());
  }, []);

  const verify = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const target = await verifyHandoffInBrowser(handoff);
      setReturnUrl(target);
      window.location.assign(target);
    } catch (cause) {
      if (!isPasskeyCancellation(cause)) {
        setError(toUserMessage(cause, 'That passkey or security key could not be verified.'));
      }
    } finally {
      setBusy(false);
    }
  }, [handoff]);

  if (returnUrl) {
    return (
      <div>
        <p className={AUTH_HINT_CLASS} role="status">
          You are verified. Return to the AGI app to keep going. You can close this tab.
        </p>
        <button
          type="button"
          className={AUTH_PRIMARY_BUTTON_CLASS}
          onClick={() => window.location.assign(returnUrl)}
        >
          Open the AGI app
        </button>
      </div>
    );
  }

  return (
    <div>
      {webAuthn === false ? (
        <p className={AUTH_HINT_CLASS}>
          This browser cannot use passkeys or security keys. Open the link in a browser that can.
        </p>
      ) : (
        <button
          type="button"
          className={AUTH_PRIMARY_BUTTON_CLASS}
          disabled={busy || webAuthn === null}
          onClick={() => void verify()}
        >
          {busy ? <Spinner size="sm" /> : null}
          Continue with passkey or security key
        </button>
      )}
      {error ? (
        <p role="alert" className={AUTH_ERROR_CLASS}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
