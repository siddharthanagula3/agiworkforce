'use client';

import { useEffect } from 'react';
import { useTierStore } from '@agiworkforce/unified-chat';
import { normalizeUIPlanTier } from '@agiworkforce/types';
import { useBillingData, type BillingPlan } from '@features/billing/hooks/use-billing-queries';

function mapPlanTier(plan: BillingPlan | undefined) {
  return normalizeUIPlanTier(plan, 'free');
}

export function useTierBridge(): void {
  const billing = useBillingData();
  const setTier = useTierStore((state) => state.setTier);

  useEffect(() => {
    if (!billing.data) return;
    setTier(mapPlanTier(billing.data.plan));
  }, [billing.data, setTier]);
}
