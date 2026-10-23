import {
  isFreeMediaCategory,
  orderedReadyFreeMedia,
  type FreeQuotaMediaCategory,
} from '@agiworkforce/cloud-contracts';
import { canUseBillingPlanCapability, type BillingPlanCapability } from '@agiworkforce/types';

export { isFreeMediaCategory, orderedReadyFreeMedia };

export const FREE_MEDIA_PLAN_CAPABILITY = {
  image: 'image_generation',
  video: 'video_generation',
} as const satisfies Record<FreeQuotaMediaCategory, BillingPlanCapability>;

export function freeMediaPlanIncludes(
  planTier: string | null | undefined,
  category: FreeQuotaMediaCategory,
): boolean {
  return canUseBillingPlanCapability(planTier, FREE_MEDIA_PLAN_CAPABILITY[category]);
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
