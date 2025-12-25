'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, LayoutDashboard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { ManageBillingButton } from '@/components/stripe/ManageBillingButton';
import { refreshSubscriptionStatus, type ClientSubscription } from '@/utils/subscription-client';

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams?.get('session_id');
  const [subscription, setSubscription] = useState<ClientSubscription | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [desktopAppError, setDesktopAppError] = useState(false);

  const MAX_POLL_ATTEMPTS = 10; // Poll for up to 30 seconds (10 attempts * 3 seconds)
  const POLL_INTERVAL = 3000; // 3 seconds

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    let timeout: NodeJS.Timeout | null = null;

    const pollSubscription = async () => {
      const sub = await refreshSubscriptionStatus();
      if (sub) {
        const activeStatuses = ['active', 'trialing'];
        if (activeStatuses.includes(sub.status)) {
          setSubscription(sub);
          setIsPolling(false);
          if (pollInterval) clearInterval(pollInterval);
          if (timeout) clearTimeout(timeout);
          return;
        }
      }

      // Track attempts internally to stop polling after max attempts
      let attempts = 0;
      const checkAttempts = () => {
        attempts++;
        if (attempts >= MAX_POLL_ATTEMPTS) {
          setIsPolling(false);
          if (pollInterval) clearInterval(pollInterval);
          if (timeout) clearTimeout(timeout);
        }
      };
      checkAttempts();
    };

    // Start polling immediately
    pollSubscription();

    // Set up interval polling
    pollInterval = setInterval(pollSubscription, POLL_INTERVAL);

    // Set timeout to stop polling after max attempts
    timeout = setTimeout(() => {
      setIsPolling(false);
      if (pollInterval) clearInterval(pollInterval);
    }, MAX_POLL_ATTEMPTS * POLL_INTERVAL);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (timeout) clearTimeout(timeout);
    };
  }, []);

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
              <span>Please wait</span>
            </div>
          </div>
        ) : subscription ? (
          <p className="text-lg text-zinc-400">
            Thank you for subscribing to AGI Workforce. Your account has been upgraded to the{' '}
            <span className="font-semibold text-white">{planTierDisplay}</span> plan.
          </p>
        ) : (
          <p className="text-lg text-zinc-400">
            Thank you for subscribing to AGI Workforce. Your account upgrade is being processed.
          </p>
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
                  If the app didn't open, make sure AGI Workforce Desktop is installed.
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
