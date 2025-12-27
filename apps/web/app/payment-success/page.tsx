'use client';

import { useEffect, useState, Suspense, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, LayoutDashboard, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { ManageBillingButton } from '@/components/stripe/ManageBillingButton';
import {
  refreshSubscriptionStatus,
  syncSubscriptionFromStripe,
  type ClientSubscription,
} from '@/utils/subscription-client';

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams?.get('session_id');
  const [subscription, setSubscription] = useState<ClientSubscription | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [syncAttempted, setSyncAttempted] = useState(false);
  const [desktopAppError, setDesktopAppError] = useState(false);
  const attemptsRef = useRef(0);
  const syncTriggeredRef = useRef(false);

  const MAX_POLL_ATTEMPTS = 15; // Poll for up to 45 seconds (15 attempts * 3 seconds)
  const POLL_INTERVAL = 3000; // 3 seconds
  const SYNC_TRIGGER_ATTEMPT = 3; // Trigger sync after 3 failed attempts (9 seconds)

  const isValidSubscription = useCallback((sub: ClientSubscription | null): boolean => {
    if (!sub) return false;
    const activeStatuses = ['active', 'trialing'];
    return activeStatuses.includes(sub.status) && sub.plan_tier !== 'free';
  }, []);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    let timeout: NodeJS.Timeout | null = null;
    let isMounted = true;

    const pollSubscription = async () => {
      if (!isMounted) return;

      // First, try direct DB fetch
      let sub = await refreshSubscriptionStatus();

      // If we have a valid subscription, we're done
      if (isValidSubscription(sub)) {
        if (isMounted) {
          setSubscription(sub);
          setIsPolling(false);
        }
        if (pollInterval) clearInterval(pollInterval);
        if (timeout) clearTimeout(timeout);
        return;
      }

      // Track attempts
      attemptsRef.current += 1;

      // After a few failed attempts, trigger a sync from Stripe
      // This handles the case where the webhook is delayed
      if (attemptsRef.current >= SYNC_TRIGGER_ATTEMPT && !syncTriggeredRef.current) {
        syncTriggeredRef.current = true;
        if (isMounted) setSyncAttempted(true);

        try {
          // Call sync-subscription API to force sync from Stripe
          const syncResult = await syncSubscriptionFromStripe();

          if (syncResult && isValidSubscription(syncResult)) {
            if (isMounted) {
              setSubscription(syncResult);
              setIsPolling(false);
            }
            if (pollInterval) clearInterval(pollInterval);
            if (timeout) clearTimeout(timeout);
            return;
          }
        } catch (error) {
          console.warn('[payment-success] Sync attempt failed:', error);
          // Continue polling even if sync fails
        }
      }

      // Max attempts reached
      if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
        // Last-ditch effort: one more sync attempt
        if (!syncTriggeredRef.current) {
          try {
            const syncResult = await syncSubscriptionFromStripe();
            if (syncResult && isValidSubscription(syncResult)) {
              sub = syncResult;
            }
          } catch {
            // Ignore final sync error
          }
        }

        if (isMounted) {
          // Set whatever subscription we have (even if not ideal)
          if (sub) {
            setSubscription(sub);
          }
          setIsPolling(false);
        }
        if (pollInterval) clearInterval(pollInterval);
        if (timeout) clearTimeout(timeout);
      }
    };

    // Start polling immediately
    pollSubscription();

    // Set up interval polling
    pollInterval = setInterval(pollSubscription, POLL_INTERVAL);

    // Set timeout to stop polling after max attempts
    timeout = setTimeout(() => {
      if (isMounted) setIsPolling(false);
      if (pollInterval) clearInterval(pollInterval);
    }, MAX_POLL_ATTEMPTS * POLL_INTERVAL);

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
      if (timeout) clearTimeout(timeout);
    };
  }, [isValidSubscription]);

  // Manual retry function for user-triggered refresh
  const handleManualRetry = async () => {
    setIsPolling(true);
    attemptsRef.current = 0;
    syncTriggeredRef.current = false;
    setSyncAttempted(false);

    try {
      const syncResult = await syncSubscriptionFromStripe();
      if (isValidSubscription(syncResult)) {
        setSubscription(syncResult);
        setIsPolling(false);
        return;
      }
    } catch (error) {
      console.warn('[payment-success] Manual retry failed:', error);
    }

    // If sync didn't work, try direct fetch
    const sub = await refreshSubscriptionStatus();
    if (isValidSubscription(sub)) {
      setSubscription(sub);
    }
    setIsPolling(false);
  };

  const handleOpenDesktopApp = () => {
    try {
      // Try to open the desktop app via protocol handler
      window.location.href = 'agiworkforce://open';

      // If protocol handler doesn't work, show error after a short delay
      setTimeout(() => {
        setDesktopAppError(true);
      }, 1000);
    } catch (error) {
      console.error('Failed to open desktop app:', error);
      setDesktopAppError(true);
    }
  };

  const planTierDisplay = subscription?.plan_tier
    ? subscription.plan_tier.charAt(0).toUpperCase() + subscription.plan_tier.slice(1)
    : 'your plan';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4">
      <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center text-center space-y-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10 ring-1 ring-green-500/50">
          <CheckCircle className="h-10 w-10 text-green-500" />
        </div>

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Payment Successful!</h1>

        {isPolling ? (
          <div className="space-y-2">
            <p className="text-lg text-zinc-400">Updating your subscription...</p>
            <div className="flex items-center justify-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{syncAttempted ? 'Syncing with Stripe...' : 'Please wait'}</span>
            </div>
          </div>
        ) : subscription ? (
          <p className="text-lg text-zinc-400">
            Thank you for subscribing to AGI Workforce. Your account has been upgraded to the{' '}
            <span className="font-semibold text-white">{planTierDisplay}</span> plan.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-lg text-zinc-400">
              Thank you for your payment! Your subscription is being processed.
            </p>
            <p className="text-sm text-zinc-500">
              If your plan doesn&apos;t update automatically, click below to refresh.
            </p>
            <Button
              onClick={handleManualRetry}
              variant="outline"
              className="border-zinc-700 hover:bg-zinc-800"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Subscription Status
            </Button>
          </div>
        )}

        {sessionId && (
          <p className="text-sm text-zinc-600 font-mono">Session ID: {sessionId.slice(-8)}</p>
        )}

        <div className="flex flex-col gap-3 w-full pt-4">
          <Link href="/dashboard" className="w-full">
            <Button className="w-full h-11 bg-white text-black hover:bg-zinc-200 font-medium">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Go to Dashboard
            </Button>
          </Link>

          <div className="w-full">
            <ManageBillingButton />
          </div>

          <div className="pt-4 border-t border-zinc-900/50 w-full mt-2">
            {desktopAppError ? (
              <div className="space-y-2">
                <button
                  onClick={handleOpenDesktopApp}
                  className="w-full inline-flex h-9 items-center justify-center text-sm font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Open Desktop App
                </button>
                <p className="text-xs text-zinc-600">
                  If the app didn&apos;t open, make sure AGI Workforce Desktop is installed.
                </p>
              </div>
            ) : (
              <button
                onClick={handleOpenDesktopApp}
                className="w-full inline-flex h-9 items-center justify-center text-sm font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Open Desktop App
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4">
          <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center text-center space-y-6">
            <Loader2 className="h-10 w-10 animate-spin text-zinc-400" />
            <p className="text-lg text-zinc-400">Loading...</p>
          </div>
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  );
}
