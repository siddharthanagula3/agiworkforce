import { getPlanMaxAttachmentsPerMessage, normalizeBillingPlanTier } from '@agiworkforce/types';

export function photoSelectionLimitForPlan(tier: string | null | undefined): number {
  return getPlanMaxAttachmentsPerMessage(normalizeBillingPlanTier(tier));
}
