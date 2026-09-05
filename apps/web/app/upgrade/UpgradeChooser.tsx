'use client';

import Link from 'next/link';
import { getNextUpgradeTier, isFreeBillingPlanTier, isMax15xPlanTier } from '@agiworkforce/types';
import { Progress, Spinner } from '@agiworkforce/ui';
import { useBillingData } from '@features/billing/hooks/use-billing-queries';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import { useBillingStore } from '@shared/stores/web-auth-store';
import {
  WEB_PAID_PLAN_ORDER,
  getBillingPlanDisplay,
  formatCatalogPrice,
  type SelectablePaidPlan,
} from '@features/billing/lib/plan-display';
import {
  billingOwnerPlanActionLabel,
  billingOwnerPlanChangeMessage,
} from '@features/billing/lib/subscription-owner-presentation';

function priceLabel(usd: number | null): string {
  if (usd === null) return 'Custom';
  if (usd === 0) return 'Free';
  return `${formatCatalogPrice(usd)}/month`;
}

/** Same shape the billing panels use, so a date reads identically everywhere. */
function formatRenewalDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/**
 * Whether the period end is something to act on. A cancelled subscription ends
 * rather than renews, and saying "renews" there would be wrong.
 */
function periodEndLabel(status: string | null | undefined): string {
  return status === 'canceled' || status === 'cancelled' ? 'Access ends' : 'Renews';
}

const secondaryLinkClassName =
  'font-medium underline underline-offset-2 transition-colors hover:text-foreground';
const panelActionClassName =
  'mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted';

export function UpgradeChooser() {
  const { data: billing, isLoading } = useBillingData();
  const subscription = useBillingStore((s) => s.subscription);
  const billingPolicyReady = useBillingStore(isBillingPolicyReady);

  // Both hooks have to have settled before anything here is trustworthy. A
  // failed or still-in-flight /api/me read is not proof the account is on
  // Free, treating it that way is how a Max 15x subscriber previously saw
  // "Your current plan: Free" next to a $7 "upgrade" that was really a
  // downgrade. See shared/stores/billing-policy.ts.
  const ready = !isLoading && billingPolicyReady;
  const currentPlan = billing?.plan;
  const hasActivePaidPlan =
    billing != null &&
    !isFreeBillingPlanTier(billing.plan) &&
    ['active', 'trialing'].includes(billing.status ?? '');
  const ownerBlocked = hasActivePaidPlan && subscription?.subscription_source !== 'stripe';

  const currentDisplay = getBillingPlanDisplay(currentPlan ?? 'free');
  const nextTier = ready ? getNextUpgradeTier(currentPlan) : null;
  const nextDisplay = nextTier ? getBillingPlanDisplay(nextTier) : null;
  const newFeatures = nextDisplay
    ? nextDisplay.features.filter((feature) => !currentDisplay.features.includes(feature))
    : [];

  // Max 5x and Max 15x are one product at two capacities, chosen on the order
  // screen where the difference is priced against what the account already
  // paid, so 15x never appears as its own skip-ahead link here.
  const nextIndex = nextTier ? WEB_PAID_PLAN_ORDER.indexOf(nextTier) : -1;
  const secondaryTiers: readonly SelectablePaidPlan[] =
    nextIndex === -1
      ? []
      : WEB_PAID_PLAN_ORDER.slice(nextIndex + 1).filter((plan) => !isMax15xPlanTier(plan));

  const showProrationNote = ready && !ownerBlocked && nextTier !== null;

  // Rounded for display only; the raw value drives nothing here. A fractional
  // percentage reads as false precision on a plan summary.
  const rawUsedPercent = billing?.usage?.usedPercent;
  const usedPercent =
    typeof rawUsedPercent === 'number' && Number.isFinite(rawUsedPercent)
      ? Math.max(0, Math.min(100, Math.round(rawUsedPercent)))
      : null;
  const renewalDate = formatRenewalDate(billing?.current_period_end ?? null);

  return (
    <div className="mx-auto w-full max-w-2xl px-6">
      <Link
        href="/chat"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Upgrade</h1>
      {showProrationNote ? (
        <p className="mt-2 text-sm text-muted-foreground">
          See what changes before you switch. You only pay the difference for the rest of this
          billing period.
        </p>
      ) : null}

      {!ready ? (
        <div
          className="mt-12 flex items-center gap-3 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Spinner size="sm" aria-hidden="true" />
          <span>Checking your plan…</span>
        </div>
      ) : (
        <div className="mt-10 flex flex-col gap-6">
          {/* The page already fetched the period and the usage and then showed
              neither, so someone deciding whether to move plans could not see
              how much of the one they have they are actually using, or when it
              renews. Every value here comes from /api/usage; nothing is
              derived or assumed, and each part renders only when present. */}
          <section
            data-testid="upgrade-current-plan"
            className="rounded-2xl border border-border bg-muted/30 p-5"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your plan
            </p>
            <div className="mt-2 flex items-baseline justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight">
                {currentDisplay.pricing.label}
              </h2>
              <span className="text-sm text-muted-foreground">
                {priceLabel(currentDisplay.monthlyPriceUsd)}
              </span>
            </div>

            {usedPercent !== null ? (
              <div className="mt-5">
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">Usage this period</span>
                  <span className="font-medium tabular-nums" data-testid="upgrade-usage-percent">
                    {usedPercent}%
                  </span>
                </div>
                <Progress
                  value={usedPercent}
                  className="mt-2 h-1.5"
                  aria-label={`${usedPercent}% of this period's usage used`}
                />
              </div>
            ) : null}

            {renewalDate ? (
              <p className="mt-4 text-sm text-muted-foreground" data-testid="upgrade-renewal">
                {periodEndLabel(billing?.status)} {renewalDate}
              </p>
            ) : null}
          </section>

          {ownerBlocked ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <p className="text-sm text-foreground">
                {billingOwnerPlanChangeMessage(subscription?.subscription_source)}
              </p>
              <Link href="/settings/billing" className={panelActionClassName}>
                {billingOwnerPlanActionLabel(subscription?.subscription_source)}
              </Link>
            </section>
          ) : !nextTier || !nextDisplay ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <p className="text-sm text-foreground">
                This is the top of our self-serve plans. Manage or cancel your subscription any time
                in Billing.
              </p>
              <Link href="/settings/billing" className={panelActionClassName}>
                Manage billing
              </Link>
            </section>
          ) : (
            <>
              <section
                data-testid={`upgrade-recommended-${nextTier}`}
                aria-labelledby="upgrade-recommended-title"
                className="flex flex-col rounded-2xl border border-primary/40 bg-card p-6"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-primary">
                  Recommended next step
                </p>
                <div className="mt-3 flex items-baseline justify-between gap-4">
                  <h2 id="upgrade-recommended-title" className="text-xl font-semibold">
                    {nextDisplay.pricing.label}
                  </h2>
                  <span className="text-lg font-semibold tracking-tight">
                    {priceLabel(nextDisplay.monthlyPriceUsd)}
                  </span>
                </div>

                {newFeatures.length > 0 ? (
                  <ul className="mt-5 flex flex-col gap-2 text-sm text-muted-foreground">
                    <li className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      What changes
                    </li>
                    {newFeatures.map((feature) => (
                      <li key={feature} className="flex gap-2.5">
                        <span aria-hidden className="mt-px text-foreground/40">
                          ✓
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <Link
                  href={`/upgrade/${nextTier}`}
                  className="mt-6 flex h-10 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Continue with {nextDisplay.pricing.label}
                </Link>
              </section>

              {secondaryTiers.length > 0 ? (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1 text-sm">
                  <span className="text-muted-foreground">Or jump ahead:</span>
                  {secondaryTiers.map((plan) => {
                    const display = getBillingPlanDisplay(plan);
                    return (
                      <Link key={plan} href={`/upgrade/${plan}`} className={secondaryLinkClassName}>
                        {display.pricing.label} · {priceLabel(display.monthlyPriceUsd)}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
