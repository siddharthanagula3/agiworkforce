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
  planUsageComparisonLabel,
  type SelectablePaidPlan,
} from '@features/billing/lib/plan-display';
import { formatBillingDate } from '@features/billing/lib/billing-format';
import {
  billingOwnerPlanActionLabel,
  billingOwnerPlanChangeMessage,
} from '@features/billing/lib/subscription-owner-presentation';

function priceLabel(usd: number | null): string {
  if (usd === null) return 'Custom';
  if (usd === 0) return 'Free';
  return `${formatCatalogPrice(usd)}/month`;
}

type PeriodEndKind = 'renews' | 'trial' | 'ends';

function periodEndLabel(kind: PeriodEndKind): string {
  if (kind === 'trial') return 'Trial ends';
  return kind === 'ends' ? 'Access ends' : 'Renews';
}

const secondaryLinkClassName =
  'font-medium underline underline-offset-2 transition-colors hover:text-foreground';
const panelActionClassName =
  'mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted';

export function UpgradeChooser() {
  const { data: billing, isLoading } = useBillingData();
  const subscription = useBillingStore((s) => s.subscription);
  const billingPolicyReady = useBillingStore(isBillingPolicyReady);

  const ready = !isLoading && billingPolicyReady;
  const currentPlan = billing?.plan;
  const hasActivePaidPlan =
    billing != null &&
    !isFreeBillingPlanTier(billing.plan) &&
    ['active', 'trialing'].includes(billing.status ?? '');
  const ownerBlocked = hasActivePaidPlan && subscription?.subscription_source !== 'stripe';
  const paymentOverdue =
    billing != null &&
    !isFreeBillingPlanTier(billing.plan) &&
    ['past_due', 'unpaid'].includes(billing.status ?? '');

  const currentDisplay = getBillingPlanDisplay(currentPlan ?? 'free');
  const nextTier = ready ? getNextUpgradeTier(currentPlan) : null;
  const nextDisplay = nextTier ? getBillingPlanDisplay(nextTier) : null;
  const newFeatures = nextDisplay
    ? nextDisplay.features.filter((feature) => !currentDisplay.features.includes(feature))
    : [];
  const nextUsageComparison = nextTier ? planUsageComparisonLabel(nextTier) : null;

  const nextIndex = nextTier ? WEB_PAID_PLAN_ORDER.indexOf(nextTier) : -1;
  const secondaryTiers: readonly SelectablePaidPlan[] =
    nextIndex === -1
      ? []
      : WEB_PAID_PLAN_ORDER.slice(nextIndex + 1).filter((plan) => !isMax15xPlanTier(plan));

  const showProrationNote = ready && !ownerBlocked && hasActivePaidPlan && nextTier !== null;

  const rawUsedPercent = billing?.usage?.usedPercent;
  const usedPercent =
    typeof rawUsedPercent === 'number' && Number.isFinite(rawUsedPercent)
      ? Math.max(0, Math.min(100, Math.round(rawUsedPercent)))
      : null;
  const renewalDate = formatBillingDate(billing?.current_period_end ?? null);
  const periodEndKind: PeriodEndKind =
    billing?.status === 'canceled' || subscription?.cancel_at_period_end === true
      ? 'ends'
      : billing?.status === 'trialing'
        ? 'trial'
        : 'renews';
  const endingPaidPlan = periodEndKind === 'ends' && !isFreeBillingPlanTier(currentPlan);

  return (
    <div className="mx-auto w-full max-w-2xl px-6">
      <Link
        href="/chat"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back
      </Link>

      <h1 className="mt-6 text-display">Upgrade</h1>
      {showProrationNote ? (
        <p className="mt-2 text-sm text-muted-foreground">
          See what changes before you switch. An upgrade starts a new billing period today: you pay
          the new plan&rsquo;s price, minus a credit for the unused time on your current plan.
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
          <section
            data-testid="upgrade-current-plan"
            className="rounded-2xl border border-border bg-muted/30 p-5"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your plan
            </p>
            <div className="mt-2 flex items-baseline justify-between gap-4">
              <h2 className="text-h1">{currentDisplay.pricing.label}</h2>
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
                {periodEndLabel(periodEndKind)} {renewalDate}
              </p>
            ) : null}
            {endingPaidPlan && renewalDate ? (
              <p className="mt-1 text-sm text-muted-foreground">
                You keep {currentDisplay.pricing.label} until then. After that, your account moves
                to Free; your chats, projects and files stay.
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
          ) : paymentOverdue ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <p className="text-sm text-foreground">
                Your last {currentDisplay.pricing.label} payment didn&rsquo;t go through. Pay the
                open invoice or update your payment method in Billing, then come back to upgrade.
              </p>
              <Link href="/settings/billing" className={panelActionClassName}>
                Open billing
              </Link>
            </section>
          ) : !nextTier || !nextDisplay ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <p className="text-sm text-foreground">
                This is the top of our self-serve plans. Switch to a smaller plan, or manage or
                cancel your subscription, any time in Billing.
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
                  <h2 id="upgrade-recommended-title" className="text-h2">
                    {nextDisplay.pricing.label}
                  </h2>
                  <span className="text-lg font-semibold tracking-tight">
                    {priceLabel(nextDisplay.monthlyPriceUsd)}
                  </span>
                </div>
                {nextUsageComparison ? (
                  <p className="mt-1 text-sm text-muted-foreground">{nextUsageComparison}</p>
                ) : null}

                {newFeatures.length > 0 ? (
                  <ul className="mt-5 flex flex-col gap-2 text-sm text-muted-foreground">
                    <li className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      What changes
                    </li>
                    {newFeatures.map((feature) => (
                      <li key={feature} className="flex gap-2.5">
                        <span aria-hidden className="mt-px text-muted-foreground">
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
