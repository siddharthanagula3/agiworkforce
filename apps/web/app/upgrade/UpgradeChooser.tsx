'use client';

import Link from 'next/link';
import { useBillingData } from '@features/billing/hooks/use-billing-queries';
import {
  WEB_PAID_PLAN_ORDER,
  getBillingPlanDisplay,
  formatCatalogPrice,
  type SelectablePaidPlan,
} from '@features/billing/lib/plan-display';

/**
 * Max 5x and Max 15x are one card, not two.
 *
 * They are the same product at two capacities, and the capacity is chosen on the
 * order screen where the difference is priced against what the account already
 * paid. Listing both here would ask for that choice twice.
 */
const LISTED_PLANS: readonly SelectablePaidPlan[] = WEB_PAID_PLAN_ORDER.filter(
  (plan) => plan !== 'max_15x',
);

export function UpgradeChooser() {
  const { data: billing, isLoading } = useBillingData();
  const currentPlan = billing?.plan;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-14">
      <Link
        href="/chat"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back
      </Link>

      <h1 className="mt-6 text-center text-4xl font-semibold tracking-tight">
        Plans that grow with you
      </h1>
      <p className="mt-3 text-center text-sm text-muted-foreground">
        Upgrade any time. You only pay the difference for the rest of your billing period.
      </p>

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {LISTED_PLANS.map((plan) => {
          const display = getBillingPlanDisplay(plan);
          const price = display.monthlyPriceUsd;
          const isCurrent = currentPlan === plan || (plan === 'max' && currentPlan === 'max_15x');

          return (
            <section
              key={plan}
              className="flex flex-col rounded-2xl border border-border bg-card p-6 transition-colors hover:border-foreground/20"
            >
              <h2 className="text-lg font-semibold">{display.pricing.label}</h2>

              <p className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight">
                  {price === null ? 'Custom' : formatCatalogPrice(price)}
                </span>
                {price === null ? null : (
                  <span className="text-sm text-muted-foreground">USD / month</span>
                )}
              </p>

              <div className="mt-6">
                {isLoading ? (
                  <span className="flex h-10 items-center justify-center rounded-lg border border-border text-sm text-muted-foreground">
                    Checking your plan…
                  </span>
                ) : isCurrent ? (
                  <span
                    data-testid={`current-plan-${plan}`}
                    className="flex h-10 items-center justify-center rounded-lg border border-border text-sm text-muted-foreground"
                  >
                    Current plan
                  </span>
                ) : (
                  <Link
                    href={`/upgrade/${plan}`}
                    className="flex h-10 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Get {display.pricing.label}
                  </Link>
                )}
              </div>

              <ul className="mt-6 flex flex-col gap-2.5 text-sm text-muted-foreground">
                {display.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5">
                    <span aria-hidden className="mt-px text-foreground/40">
                      ✓
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
