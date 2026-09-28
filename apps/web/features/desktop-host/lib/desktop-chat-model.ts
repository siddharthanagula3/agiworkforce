'use client';

import { isFreeBillingPlanTier } from '@agiworkforce/types';
import { freeQuotaSelection } from '@/features/chat/lib/free-quota-selection';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { getBestAutoModeForTier } from '@shared/config/llm';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import { resolveSelectableModelId, useModelStore } from '@shared/stores/model-store';
import { useBillingStore } from '@shared/stores/web-auth-store';

export function desktopChatModelId(): string {
  const selected = resolveSelectableModelId(useModelStore.getState().selectedModelId);
  const billing = useBillingStore.getState();
  const tier = billing.subscription?.tier ?? 'free';
  const onFreePlan = isBillingPolicyReady(billing) && isFreeBillingPlanTier(tier);
  if (onFreePlan && !freeQuotaSelection(selected) && !FREE_TRIAL_MODELS.includes(selected)) {
    return getBestAutoModeForTier('free');
  }
  return selected;
}
