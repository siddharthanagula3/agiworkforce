'use client';

import { useState } from 'react';
import { useSignOut } from '@/lib/identity/client';
import { useAuthStore } from '@shared/stores/authentication-store';
import { clearTermsGateMarker } from '@/app/signup/TermsGate';
import { AUTH_FOOTER_LINK_CLASS } from '@/features/auth/authStyles';

export function TermsReviewSignOut() {
  const signOut = useSignOut();
  const logout = useAuthStore((state) => state.logout);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function leave() {
    setPending(true);
    setFailed(false);
    try {
      clearTermsGateMarker();
      await logout();
      await signOut({ redirectUrl: '/login' });
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`${AUTH_FOOTER_LINK_CLASS} min-h-11 px-4 text-sm underline disabled:opacity-50`}
        onClick={() => void leave()}
        disabled={pending}
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
      {failed ? (
        <p role="alert" className="mt-2 text-sm text-danger-text">
          We couldn’t sign you out. Please try again.
        </p>
      ) : null}
    </>
  );
}
