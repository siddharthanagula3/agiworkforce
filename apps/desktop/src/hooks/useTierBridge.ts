/**
 * Bridges desktop's authOrchestrator → unified-chat's tierStore.
 *
 * Mount once at app top-level. Whenever the user's plan_tier changes
 * (subscription update, sign-in/out, BYOK toggle), the unified-chat
 * tierStore is patched so ModelSelector can gate the Pro+ in-thread
 * provider switch correctly.
 */
import { useEffect } from 'react';
import { useTierStore } from '@agiworkforce/unified-chat';
import type { UIPlanTier } from '@agiworkforce/types';
import { useUnifiedAuthStore, selectPlan } from '../stores/auth';
import type { PlanTier } from '../lib/supabase';

/**
 * Map the desktop's wider `PlanTier` (which includes `local-only`, `free`,
 * `enterprise`) onto the unified-chat `UIPlanTier`. `enterprise` collapses
 * to `max` for chat-feature gating; the legacy `free` ≡ `byok`.
 */
function mapPlanTier(plan: PlanTier | null | undefined): UIPlanTier {
  switch (plan) {
    case 'local-only':
      return 'local';
    case 'byok':
      return 'byok';
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
  const planTier = useUnifiedAuthStore(selectPlan);
  const setTier = useTierStore((state) => state.setTier);

  useEffect(() => {
    setTier(mapPlanTier(planTier));
  }, [planTier, setTier]);
}
