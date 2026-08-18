'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@shared/stores/query-client';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { UpgradeOrderPanel } from '@features/billing/components/UpgradeOrderPanel';
import type { SelfServeIndividualPlanTier } from '@agiworkforce/types';
import { getBillingPlanDisplay, formatCatalogPrice } from '@features/billing/lib/plan-display';

const MAX_CAPACITIES: readonly SelfServeIndividualPlanTier[] = ['max', 'max_15x'];

export function UpgradeOrderScreen({
  plan,
  billingInterval,
}: {
  plan: SelfServeIndividualPlanTier;
  billingInterval: 'monthly' | 'yearly';
}) {
  // Max is one product sold at two capacities, so landing on either one keeps
  // the other switchable here instead of sending the user back to choose again.
  const [selected, setSelected] = useState<SelfServeIndividualPlanTier>(plan);
  const [upgraded, setUpgraded] = useState(false);
  const queryClient = useQueryClient();
  const refreshBillingAccount = useBillingStore((s) => s.refreshUser);

  const capacities = MAX_CAPACITIES.includes(plan) ? MAX_CAPACITIES : [];
  const display = getBillingPlanDisplay(selected);

  async function handleUpgraded() {
    setUpgraded(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.all() }),
      refreshBillingAccount(),
    ]);
  }

  if (upgraded) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">You&rsquo;re on {display.pricing.label}.</h1>
        <p className="text-sm text-muted-foreground">
          Your new capacity is active. It can take a moment to appear everywhere.
        </p>
        <Link href="/chat" className="underline underline-offset-2">
          Back to chat
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-6 py-12">
      <div>
        <Link
          href="/upgrade"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Upgrade
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{display.pricing.label}</h1>
      </div>

      {capacities.length > 0 ? (
        <div role="group" aria-label="Capacity" className="grid grid-cols-2 gap-3">
          {capacities.map((capacity) => {
            const capacityDisplay = getBillingPlanDisplay(capacity);
            const price = capacityDisplay.monthlyPriceUsd;
            return (
              <button
                key={capacity}
                type="button"
                aria-pressed={selected === capacity}
                onClick={() => setSelected(capacity)}
                className={`rounded-2xl border p-4 text-left text-sm transition-colors ${
                  selected === capacity
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card hover:border-foreground/20'
                }`}
              >
                <span className="block font-medium">{capacityDisplay.pricing.label}</span>
                <span className="mt-1 block text-muted-foreground">
                  {price === null ? 'Contact sales' : `${formatCatalogPrice(price)}/month + tax`}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <UpgradeOrderPanel
        plan={selected}
        billingInterval={billingInterval}
        returnPath={
          billingInterval === 'yearly'
            ? `/upgrade/${selected}?interval=yearly`
            : `/upgrade/${selected}`
        }
        onUpgraded={() => void handleUpgraded()}
      />
    </div>
  );
}
