'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { addCsrfHeaders } from '@/lib/client/csrf';

/**
 * The durable half of the signup clickwrap.
 *
 * It only mounts behind `<TermsGate>` on /signup/complete, so it runs with the
 * terms having been ticked in this browser session — either on /signup before
 * the Clerk card appeared, or on /signup/complete itself for an account Clerk
 * transferred here from the /login card. It writes that fact against the
 * account, which is only possible once Clerk has a session.
 *
 * What this does NOT guarantee, so nobody reads a promise into it later:
 *
 * - It is not universal. Accounts that existed before this shipped have no
 *   record, and nothing yet re-prompts them — no production code reads
 *   `profiles.terms_version`, so a missing record goes unnoticed. Closing that
 *   needs an authenticated enforcement point (proxy.ts or /api/me) and a product
 *   call on whether to wall off existing users.
 * - Two branches below reach the app with nothing written: no Clerk session (no
 *   account to attribute it to), and the explicit "Continue without recording"
 *   after a failed write.
 * - The server takes the client's word for it. /api/terms/accept writes for any
 *   signed-in caller; there is no signed proof from the gate that the box was
 *   rendered and ticked.
 *
 * A failure is shown rather than swallowed: continuing silently would leave an
 * account with no proof of assent and nothing to indicate it. The escape hatch
 * is explicit and user-driven, and the server has already logged the failure.
 */
export function RecordTermsAcceptance({ redirectTo }: { redirectTo: string }) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const attempted = useRef(false);

  const record = useCallback(async () => {
    setFailed(false);
    try {
      const response = await fetch('/api/terms/accept', {
        method: 'POST',
        credentials: 'include',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ surface: 'web-signup' }),
      });
      if (!response.ok) throw new Error(`terms acceptance failed: ${response.status}`);
      router.replace(redirectTo);
    } catch {
      setFailed(true);
    }
  }, [redirectTo, router]);

  useEffect(() => {
    if (!isLoaded || attempted.current) return;
    attempted.current = true;
    // No session means no account to attribute the acceptance to — the
    // destination's own auth gate decides what happens next.
    if (!isSignedIn) {
      router.replace(redirectTo);
      return;
    }
    void record();
  }, [isLoaded, isSignedIn, record, redirectTo, router]);

  if (failed) {
    return (
      <div
        className="flex flex-col items-center gap-4 text-center"
        data-testid="terms-record-failed"
      >
        <p className="text-sm text-foreground">
          We could not record your agreement to the terms. Your account was created.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void record()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => router.replace(redirectTo)}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Continue without recording
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4" role="status">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-primary" />
      <p className="text-sm text-muted-foreground">Finishing setting up your account…</p>
    </div>
  );
}
