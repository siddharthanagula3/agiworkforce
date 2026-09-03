'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BILLING_PLAN_PRICING, type SelfServePaidPlanTier } from '@agiworkforce/types';
import { useBillingStore } from '@shared/stores/web-auth-store';

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 30_000;

const SURFACE_GROUPS = [
  {
    label: 'Same account, same chats',
    surfaces: ['Web', 'Mobile', 'Desktop'],
    note: 'Cloud conversations follow your signed-in account.',
  },
  {
    label: 'Developer sessions',
    surfaces: ['CLI', 'VS Code'],
    note: 'Scoped to the workspace you run them in.',
  },
] as const;

function formatPeriodEnd(unixSeconds: number): string | null {
  const date = new Date(unixSeconds * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

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
  const plan = BILLING_PLAN_PRICING[expectedPlan];
  const planLabel = plan.label;

  const monthlyPriceUsd =
    'monthlyPriceUsd' in plan && typeof plan.monthlyPriceUsd === 'number'
      ? plan.monthlyPriceUsd
      : null;

  const periodEnd =
    planActivated && typeof subscription?.current_period_end === 'number'
      ? formatPeriodEnd(subscription.current_period_end)
      : null;
  const endsWithoutRenewal = subscription?.cancel_at_period_end === true;

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
      <div className="w-full max-w-xl">
        <div className="flex flex-col items-center text-center">
          <StatusMark activated={planActivated} />

          {planActivated ? (
            <>
              <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                You&rsquo;re all set.
              </h1>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-sm">
                <span
                  className="rounded-full px-3 py-1 font-semibold text-[var(--chat-accent-on-primary)]"
                  style={{ background: 'var(--chat-accent-primary, #c8892a)' }}
                >
                  {planLabel}
                </span>
                {monthlyPriceUsd !== null && monthlyPriceUsd > 0 ? (
                  <span className="text-muted-foreground">${monthlyPriceUsd}/month</span>
                ) : null}
                {periodEnd ? (
                  <>
                    <span aria-hidden="true" className="text-muted-foreground">
                      &middot;
                    </span>
                    <span className="text-muted-foreground">
                      {endsWithoutRenewal ? 'ends' : 'renews'} {periodEnd}
                    </span>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {checkoutState === 'paid'
                  ? 'Payment received.'
                  : checkoutState === 'confirmed'
                    ? 'Checkout confirmed.'
                    : 'Confirming checkout.'}
              </h1>
              <p className="mt-4 max-w-sm text-sm text-muted-foreground" aria-live="polite">
                {timedOut
                  ? `Your ${planLabel} plan is taking longer than usual to activate. Check Billing before trying another purchase, you have not been charged twice.`
                  : `Activating your ${planLabel} plan…`}
              </p>
            </>
          )}
        </div>

        {planActivated ? (
          <div className="mt-10 overflow-hidden rounded-2xl border border-border">
            {SURFACE_GROUPS.map((group, index) => (
              <div
                key={group.label}
                className={`flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 ${
                  index > 0 ? 'border-t border-border' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{group.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{group.note}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {group.surfaces.map((surface) => (
                    <span
                      key={surface}
                      className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground"
                    >
                      {surface}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {/*
            `border-transparent` on the filled button so it matches the outlined
            one's box exactly, without it the border makes the pair 2px
            different in height side by side. `py-3` keeps both at a 44px touch
            target when they stack on a phone, narrowing to 2.5 once they don't.
          */}
          <Link
            href="/chat"
            className="w-full rounded-lg border border-transparent px-5 py-3 text-center text-sm font-semibold text-[var(--chat-accent-on-primary)] no-underline transition-opacity hover:opacity-90 sm:w-auto sm:py-2.5"
            style={{ background: 'var(--chat-accent-primary, #c8892a)' }}
          >
            Start chatting
          </Link>
          <Link
            href="/settings/billing"
            className="w-full rounded-lg border border-border px-5 py-3 text-center text-sm font-semibold text-foreground no-underline transition-colors hover:bg-muted sm:w-auto sm:py-2.5"
          >
            View billing
          </Link>
        </div>
      </div>
    </main>
  );
}

function StatusMark({ activated }: { activated: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="relative flex h-16 w-16 items-center justify-center rounded-full"
      style={{
        background:
          'linear-gradient(135deg, var(--chat-accent-primary, #c8892a) 0%, var(--chat-accent-secondary, #21808d) 100%)',
      }}
    >
      {activated ? (
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden="true">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="white"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <span className="h-7 w-7 rounded-full border-[2.5px] border-white/35 border-t-white motion-safe:animate-spin" />
      )}
    </div>
  );
}
