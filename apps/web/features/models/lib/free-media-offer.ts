import {
  FREE_QUOTA_MEDIA_CATEGORIES,
  type FreeQuotaCatalogue,
  type FreeQuotaLimitedOffer,
  type FreeQuotaMediaCategory,
  type FreeQuotaModel,
} from '@agiworkforce/cloud-contracts';
import {
  canUseBillingPlanCapability,
  formatUsageResetIn,
  type BillingPlanCapability,
} from '@agiworkforce/types';

export interface FreeMediaCategoryOffer {
  lastDay: string | null;
}

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
const ISO_DAY_LENGTH = 10;

const CALENDAR_DAY: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: FREE_QUOTA_DAY_ZONE,
};

export function isFreeMediaCategory(category: string): category is FreeQuotaMediaCategory {
  return (FREE_QUOTA_MEDIA_CATEGORIES as readonly string[]).includes(category);
}

export function freeQuotaCalendarDay(isoDate: string, locale?: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? isoDate : date.toLocaleDateString(locale, CALENDAR_DAY);
}

function lastServedDay(expiresOn: string): string | null {
  const firstRefusedDay = new Date(`${expiresOn}T00:00:00Z`);
  if (Number.isNaN(firstRefusedDay.getTime())) return null;
  firstRefusedDay.setUTCDate(firstRefusedDay.getUTCDate() - 1);
  return firstRefusedDay.toISOString().slice(0, ISO_DAY_LENGTH);
}

export function readyFreeMediaOffer(
  models: readonly Pick<FreeQuotaModel, 'category' | 'status' | 'expiresOn'>[],
  category: FreeQuotaMediaCategory,
): FreeMediaCategoryOffer | null {
  const ready = models.filter((model) => model.category === category && model.status === 'ready');
  if (ready.length === 0) return null;
  const ends = ready.flatMap((model) => (model.expiresOn === null ? [] : [model.expiresOn]));
  return {
    lastDay:
      ends.length === ready.length
        ? lastServedDay(
            ends.reduce((latest, candidate) => (candidate > latest ? candidate : latest)),
          )
        : null,
  };
}

export function freeMediaAccess(input: {
  planIncludes: boolean;
  offer: FreeMediaCategoryOffer | null;
}): FreeMediaAccess {
  if (input.planIncludes) return { label: 'included' };
  return input.offer ? { label: 'limited', lastDay: input.offer.lastDay } : { label: 'upgrade' };
}

export function limitedOfferTerms(
  catalogue: Pick<FreeQuotaCatalogue, 'limitedOffer'> | null,
  category: FreeQuotaMediaCategory,
): FreeQuotaLimitedOffer | null {
  return catalogue?.limitedOffer?.find((offer) => offer.category === category) ?? null;
}

export function catalogueFreeMediaOffer(
  catalogue: Pick<FreeQuotaCatalogue, 'models' | 'limitedOffer'> | null,
  category: FreeQuotaMediaCategory,
): FreeMediaCategoryOffer | null {
  if (!catalogue || !limitedOfferTerms(catalogue, category)) return null;
  return readyFreeMediaOffer(catalogue.models, category);
}

export function freeMediaTodayLine(
  terms: Pick<FreeQuotaLimitedOffer, 'remainingToday' | 'resetsAt'>,
  nowMs: number = Date.now(),
): string | null {
  if (terms.remainingToday > 0) return null;
  const reset = formatUsageResetIn(terms.resetsAt, nowMs);
  return reset ? `Today's free limit is used. ${reset}.` : "Today's free limit is used.";
}

export function orderedReadyFreeMedia(
  catalogue: Pick<FreeQuotaCatalogue, 'models' | 'mediaUseOrder'>,
  category?: FreeQuotaMediaCategory,
): FreeQuotaModel[] {
  const rank = new Map((catalogue.mediaUseOrder ?? []).map((key, index) => [key, index]));
  return catalogue.models
    .map((model, listed) => ({ model, listed }))
    .filter(
      ({ model }) =>
        model.status === 'ready' &&
        isFreeMediaCategory(model.category) &&
        (category === undefined || model.category === category),
    )
    .sort(
      (left, right) =>
        (rank.get(left.model.key) ?? Number.POSITIVE_INFINITY) -
          (rank.get(right.model.key) ?? Number.POSITIVE_INFINITY) || left.listed - right.listed,
    )
    .map(({ model }) => model);
}

export interface LimitedFreeMedia {
  lastDay: string | null;
  dailyCap: number;
  remainingToday: number;
  resetsAt: string;
}

export function limitedFreeMedia(
  catalogue: Pick<FreeQuotaCatalogue, 'models' | 'limitedOffer'> | null,
  category: FreeQuotaMediaCategory,
): LimitedFreeMedia | null {
  const terms = limitedOfferTerms(catalogue, category);
  const offer = catalogueFreeMediaOffer(catalogue, category);
  if (!terms || !offer) return null;
  return {
    lastDay: offer.lastDay,
    dailyCap: terms.dailyCap,
    remainingToday: terms.remainingToday,
    resetsAt: terms.resetsAt,
  };
}

export function freeMediaOfferNote(
  limited: LimitedFreeMedia,
  nowMs: number = Date.now(),
): string | null {
  return freeMediaTodayLine(limited, nowMs);
}
