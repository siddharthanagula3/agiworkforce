'use client';

import { useSession } from '@/lib/identity/client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';

import { addCsrfHeaders } from '@/lib/client/csrf';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { clearTermsGateMarker } from '../TermsGate';

export function ContinueWithCurrentTerms({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();

  useEffect(() => {
    clearTermsGateMarker();
    router.replace(redirectTo);
  }, [redirectTo, router]);

  return <p role="status">Finishing signing in…</p>;
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
  const [failure, setFailure] = useState<'none' | 'retryable' | 'outdated'>('none');
  const attempted = useRef(false);

  const record = useCallback(async () => {
    setFailure('none');
    try {
      const response = await fetch('/api/terms/accept', {
        method: 'POST',
        credentials: 'include',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ surface, version: POLICY_LAST_UPDATED.terms }),
      });
      if (response.status === 409) {
        setFailure('outdated');
        return;
      }
      if (!response.ok) throw new Error(`terms acceptance failed: ${response.status}`);
      clearTermsGateMarker();
      router.replace(redirectTo);
    } catch {
      setFailure('retryable');
    }
  }, [redirectTo, router, surface]);

  useEffect(() => {
    if (!isLoaded || attempted.current) return;
    attempted.current = true;
    if (!isSignedIn) {
      clearTermsGateMarker();
      router.replace(redirectTo);
      return;
    }
    void record();
  }, [isLoaded, isSignedIn, record, redirectTo, router]);

  if (failure === 'outdated') {
    return (
      <div
        className="flex flex-col items-center gap-4 text-center"
        data-testid="terms-version-outdated"
      >
        <p className="text-sm text-foreground">
          The policies changed after this page loaded. Reload to review and accept the current
          version.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Reload and review current policies
        </button>
      </div>
    );
  }

  if (failure === 'retryable') {
    return (
      <div
        className="flex flex-col items-center gap-4 text-center"
        data-testid="terms-record-failed"
      >
        <p className="text-sm text-foreground">
          We could not record your agreement to the terms. Try again to continue.
        </p>
        <button
          type="button"
          onClick={() => void record()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
      <Spinner size="lg" className="text-primary" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">Finishing setting up your account…</p>
    </div>
  );
}
