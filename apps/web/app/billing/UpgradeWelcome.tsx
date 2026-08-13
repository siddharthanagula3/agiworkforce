'use client';

/**
 * Post-checkout splash. Stripe's `success_url` returns here.
 *
 * The page this replaced showed "Payment successful! Your subscription has
 * been upgraded." directly above "Current Plan: FREE — No subscription". Both
 * came from the same render: Stripe redirects the browser back the instant the
 * card clears, which is typically before the `checkout.session.completed`
 * webhook has written the new tier. The old page read the tier once on mount
 * and never looked again, so it cheerfully contradicted itself and stayed that
 * way until a manual refresh.
 *
 * So this never states a plan it has not actually observed. Until the exact
 * checkout target becomes active/trialing it says the payment went through and
 * the plan is activating, which is exactly what is true. It re-checks on a
 * short interval and names the plan the moment the webhook lands.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BILLING_PLAN_PRICING, type SelfServePaidPlanTier } from '@agiworkforce/types';
import { useBillingStore } from '@shared/stores/web-auth-store';

/** How long to wait for the webhook before offering a manual way forward. */
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 30_000;

export function UpgradeWelcome({
  checkoutState,
  expectedPlan,
}: {
  checkoutState: 'paid' | 'confirmed' | 'processing';
  expectedPlan: SelfServePaidPlanTier;
}) {
  const subscription = useBillingStore((s) => s.subscription);
  const refreshUser = useBillingStore((s) => s.refreshUser);
  const [timedOut, setTimedOut] = useState(false);

  const tier = String(subscription?.tier ?? 'free').toLowerCase();
  const planActivated =
    tier === expectedPlan &&
    (subscription?.status === 'active' || subscription?.status === 'trialing');
  const planLabel = BILLING_PLAN_PRICING[expectedPlan].label;

  useEffect(() => {
    if (planActivated) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setTimedOut(true);
        clearInterval(timer);
        return;
      }
      void refreshUser();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [planActivated, refreshUser]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-full text-3xl"
          style={{
            background:
              'linear-gradient(135deg, var(--chat-accent-primary, #c8892a) 0%, var(--chat-accent-secondary, #21808d) 100%)',
          }}
        >
          ✦
        </div>

        {planActivated ? (
          <>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Welcome to {planLabel}.
            </h1>
            <p className="text-muted-foreground">
              Your plan is active for the managed features included on each supported surface. Cloud
              app chats stay with your signed-in account across Web, Mobile, and Desktop; CLI and VS
              Code developer sessions remain workspace-scoped.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {checkoutState === 'paid'
                ? 'Payment received.'
                : checkoutState === 'confirmed'
                  ? 'Checkout confirmed.'
                  : 'Confirming checkout.'}
            </h1>
            <p className="text-muted-foreground" aria-live="polite">
              {timedOut
                ? 'Your plan is taking longer than usual to activate. Check Billing before trying another purchase.'
                : `Activating your ${planLabel} plan…`}
            </p>
          </>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/chat"
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white no-underline"
            style={{ background: 'var(--chat-accent-primary, #c8892a)' }}
          >
            Start chatting
          </Link>
          <Link
            href="/settings/billing"
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground no-underline transition-colors hover:bg-muted"
          >
            View billing
          </Link>
        </div>
      </div>
    </main>
  );
}
