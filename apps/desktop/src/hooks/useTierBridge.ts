import { useEffect } from 'react';
import { useTierStore } from '@agiworkforce/unified-chat';
import { normalizeUIPlanTier, type UIPlanTier } from '@agiworkforce/types';
import { useUnifiedAuthStore, selectPlan } from '../stores/auth';
import type { PlanTier } from '../lib/cloudAccountTypes';

function mapPlanTier(plan: PlanTier | null | undefined): UIPlanTier {
  return normalizeUIPlanTier(plan, 'byok');
}

export function useTierBridge(enabled = true): void {
  const planTier = useUnifiedAuthStore(selectPlan);
  const setTier = useTierStore((state) => state.setTier);

  useEffect(() => {
    if (!enabled) return;
    setTier(mapPlanTier(planTier));
  }, [enabled, planTier, setTier]);
}
