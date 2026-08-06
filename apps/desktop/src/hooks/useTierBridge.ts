/**
 * Bridges desktop's authOrchestrator → unified-chat's tierStore.
 *
 * Mount once at app top-level. Whenever the user's plan_tier changes
 * (subscription update, sign-in/out, BYOK toggle), the unified-chat
 * tierStore is patched so ModelSelector can gate the Max in-thread
 * provider switch correctly.
 */
import { useEffect } from 'react';
import { useTierStore } from '@agiworkforce/unified-chat';
import { normalizeUIPlanTier, type UIPlanTier } from '@agiworkforce/types';
import { useUnifiedAuthStore, selectPlan } from '../stores/auth';
import type { PlanTier } from '../lib/cloudAccountTypes';

/**
 * Map the Desktop account tier onto the canonical shared UI tier. Keeping the
 * exact managed tier matters: Max 15x, Team, and Enterprise have distinct
 * catalog capabilities and must not collapse to a lower local-only default.
 */
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
