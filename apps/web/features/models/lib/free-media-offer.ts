import {
  catalogueFreeMediaOffer,
  isFreeMediaCategory,
  limitedFreeMedia,
  limitedOfferTerms,
  orderedReadyFreeMedia,
  readyFreeMediaOffer,
  type FreeMediaCategoryOffer,
  type FreeQuotaLimitedOffer,
  type FreeQuotaMediaCategory,
  type LimitedFreeMedia,
} from '@agiworkforce/cloud-contracts';

export {
  catalogueFreeMediaOffer,
  isFreeMediaCategory,
  limitedFreeMedia,
  limitedOfferTerms,
  orderedReadyFreeMedia,
  readyFreeMediaOffer,
  type FreeMediaCategoryOffer,
  type LimitedFreeMedia,
};
import {
  canUseBillingPlanCapability,
  formatUsageResetIn,
  type BillingPlanCapability,
} from '@agiworkforce/types';

export type FreeMediaAccess =
  { label: 'included' } | { label: 'limited'; lastDay: string | null } | { label: 'upgrade' };

export const FREE_MEDIA_LIMITED_LABEL = 'Limited';

export const FREE_MEDIA_PLAN_CAPABILITY = {
  image: 'image_generation',
  video: 'video_generation',
} as const satisfies Record<FreeQuotaMediaCategory, BillingPlanCapability>;

export type FreeMediaPlanStanding = 'included' | 'offer_eligible' | 'ineligible';

export function freeMediaPlanStanding(
  planTier: string | null | undefined,
  category: FreeQuotaMediaCategory,
): FreeMediaPlanStanding {
  if (canUseBillingPlanCapability(planTier, FREE_MEDIA_PLAN_CAPABILITY[category])) {
    return 'included';
  }
  return canUseBillingPlanCapability(planTier, 'managed_chat') ? 'offer_eligible' : 'ineligible';
}

const FREE_QUOTA_DAY_ZONE = 'UTC';

const CALENDAR_DAY: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: FREE_QUOTA_DAY_ZONE,
};

export function freeQuotaCalendarDay(isoDate: string, locale?: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? isoDate : date.toLocaleDateString(locale, CALENDAR_DAY);
}

export function freeMediaAccess(input: {
  planIncludes: boolean;
  offer: FreeMediaCategoryOffer | null;
}): FreeMediaAccess {
  if (input.planIncludes) return { label: 'included' };
  return input.offer ? { label: 'limited', lastDay: input.offer.lastDay } : { label: 'upgrade' };
}

export function freeMediaTodayLine(
  terms: Pick<FreeQuotaLimitedOffer, 'remainingToday' | 'resetsAt'>,
  nowMs: number = Date.now(),
): string | null {
  if (terms.remainingToday > 0) return null;
  const reset = formatUsageResetIn(terms.resetsAt, nowMs);
  return reset ? `Today's free limit is used. ${reset}.` : "Today's free limit is used.";
}

export function freeMediaOfferNote(
  limited: LimitedFreeMedia,
  nowMs: number = Date.now(),
): string | null {
  return freeMediaTodayLine(limited, nowMs);
}
