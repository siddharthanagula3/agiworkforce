import {
  BILLING_PLAN_PRODUCT_LIMITS,
  getPlanMaxAttachmentsPerMessage,
  normalizeBillingPlanTier,
} from '@agiworkforce/types';
import { photoSelectionLimitForPlan } from '@/src/features/chat/utils/photoSelectionLimit';

const TIERS = Object.keys(BILLING_PLAN_PRODUCT_LIMITS);

describe('photos a person can pick at once', () => {
  it.each(TIERS)('follows the files-per-message limit of the %s plan', (tier) => {
    expect(photoSelectionLimitForPlan(tier)).toBe(getPlanMaxAttachmentsPerMessage(tier));
    expect(photoSelectionLimitForPlan(tier)).toBeGreaterThan(0);
  });

  it('gives an unknown or missing plan the default plan limit, never an unlimited picker', () => {
    const fallback = getPlanMaxAttachmentsPerMessage(normalizeBillingPlanTier(null));

    expect(fallback).toBeGreaterThan(0);
    expect(photoSelectionLimitForPlan(null)).toBe(fallback);
    expect(photoSelectionLimitForPlan(undefined)).toBe(fallback);
    expect(photoSelectionLimitForPlan('not-a-plan')).toBe(fallback);
  });
});
