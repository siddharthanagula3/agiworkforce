'use client';

/**
 * Bridges web's billing query → unified-chat's tierStore.
 *
 * Mount once in the chat layout / shell. Whenever the user's billing tier
 * changes, the unified-chat tierStore is patched so ModelSelector can gate
 * the Pro+ in-thread provider switch correctly.
 */
import { useEffect } from 'react';
import { useTierStore } from '@agiworkforce/unified-chat';
import type { UIPlanTier } from '@agiworkforce/types';
import { useBillingData, type BillingPlan } from '@features/billing/hooks/use-billing-queries';

function mapPlanTier(plan: BillingPlan | undefined): UIPlanTier {
  switch (plan) {
    case 'free':
      return 'byok';
    case 'hobby':
      return 'hobby';
    case 'pro':
      return 'pro';
    case 'pro_plus':
      return 'pro_plus';
    case 'max':
    case 'enterprise':
      return 'max';
    default:
      return 'byok';
  }
}

export function useTierBridge(): void {
  const billing = useBillingData();
  const setTier = useTierStore((state) => state.setTier);

  useEffect(() => {
    if (!billing.data) return;
    setTier(mapPlanTier(billing.data.plan));
  }, [billing.data, setTier]);
}
