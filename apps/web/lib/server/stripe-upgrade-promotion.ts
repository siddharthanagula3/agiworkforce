import 'server-only';

import type Stripe from 'stripe';
import { createError } from '@/lib/errors';

export interface UpgradePromotion {
  id: string;
  code: string;
  percentOff: number | null;
  amountOffCents: number | null;
  currency: string | null;
  duration: string;
  durationInMonths: number | null;
}

export type UpgradeDiscount = { discount: string } | { promotion_code: string };

const INVALID_PROMOTION = 'That promotion code is not valid.';

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function isLiveCoupon(
  coupon: string | Stripe.Coupon | Stripe.DeletedCoupon | null | undefined,
): coupon is Stripe.Coupon {
  return !!coupon && typeof coupon !== 'string' && coupon.deleted !== true;
}

export async function resolveUpgradePromotion(
  stripe: Stripe,
  code: string,
  customerId: string,
  nowMs = Date.now(),
): Promise<UpgradePromotion> {
  const page = await stripe.promotionCodes.list({
    code,
    active: true,
    limit: 1,
    expand: ['data.promotion.coupon'],
  });
  const promotion = page.data[0];
  const coupon = promotion?.promotion.coupon;
  if (!promotion || !isLiveCoupon(coupon)) throw createError.validation(INVALID_PROMOTION);
  if (!coupon.valid) throw createError.validation('That promotion code has ended.');
  if (promotion.expires_at !== null && promotion.expires_at * 1000 <= nowMs) {
    throw createError.validation('That promotion code has expired.');
  }
  if (promotion.max_redemptions !== null && promotion.times_redeemed >= promotion.max_redemptions) {
    throw createError.validation('That promotion code has been fully redeemed.');
  }
  const restrictedTo = idOf(promotion.customer);
  if (restrictedTo && restrictedTo !== customerId) throw createError.validation(INVALID_PROMOTION);
  if (promotion.restrictions.first_time_transaction) {
    throw createError.validation('That promotion code is only for a first purchase.');
  }

  return {
    id: promotion.id,
    code: promotion.code,
    percentOff: coupon.percent_off,
    amountOffCents: coupon.amount_off,
    currency: coupon.currency,
    duration: coupon.duration,
    durationInMonths: coupon.duration_in_months,
  };
}

export function upgradeDiscounts(
  subscription: Stripe.Subscription,
  promotion: UpgradePromotion,
): UpgradeDiscount[] {
  return [
    ...subscription.discounts.flatMap<UpgradeDiscount>((discount) => {
      const id = idOf(discount);
      return id ? [{ discount: id }] : [];
    }),
    { promotion_code: promotion.id },
  ];
}

export function promotionDiscountCents(
  lines: readonly Stripe.InvoiceLineItem[],
  promotion: UpgradePromotion,
): number {
  return lines.reduce(
    (total, line) =>
      total +
      (line.discount_amounts ?? []).reduce((sum, entry) => {
        const promotionCode =
          typeof entry.discount === 'string' ? null : idOf(entry.discount.promotion_code);
        return promotionCode === promotion.id ? sum + entry.amount : sum;
      }, 0),
    0,
  );
}
