'use client';

import { useEffect, useRef, useState } from 'react';
import { useSignOut } from '@/lib/identity/client';
import { AuthProgress } from '@/features/auth/AuthProgress';
import { AuthStepFrame } from '@/features/auth/AuthStepFrame';
import { AUTH_PRIMARY_BUTTON_CLASS } from '@/features/auth/authStyles';

/**
 * A browser session the server rejects makes /login and /login/complete hand
 * off to each other forever. Signing out clears it before the one retry.
 */
export function StaleSessionRecovery({
  loginUrl,
  alreadyRetried,
}: {
  loginUrl: string;
  alreadyRetried: boolean;
}) {
  const signOut = useSignOut();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Second time through means signing out did not resolve it. Stop, and say
    // so, another lap would just be the same loop with extra steps.
    if (alreadyRetried || started.current) return;
    started.current = true;

    void signOut({ redirectUrl: loginUrl }).catch(() => setFailed(true));
  }, [alreadyRetried, loginUrl, signOut]);

  const stuck = alreadyRetried || failed;

  return (
    <AuthStepFrame
      heading={stuck ? 'We could not finish signing you in' : 'Finishing signing in'}
      detail={
        <p>
          {stuck
            ? 'Your browser is holding a sign-in this server will not accept. Clearing it did not help, so something else is wrong: clearing cookies for this site and signing in again usually fixes it.'
            : 'Your previous session has expired. Clearing it and returning you to sign-in.'}
        </p>
      }
    >
      {stuck ? (
        <a href={loginUrl} className={AUTH_PRIMARY_BUTTON_CLASS}>
          Back to sign-in
        </a>
      ) : (
        <AuthProgress label="One moment" />
      )}
    </AuthStepFrame>
  );
}
