import { z } from 'zod';
import {
  BILLING_INTERVALS,
  MAX_PURCHASABLE_SEATS,
  MIN_PURCHASABLE_SEATS,
  SELF_SERVE_PAID_PLAN_TIERS,
  billingIntervalsForPlan,
  getBillingPlanPricing,
  isPerSeatBillingPlan,
  planOffersBillingInterval,
  type TeamSeatQuantities,
} from '@agiworkforce/types';

export const PlanTierSchema = z.enum(SELF_SERVE_PAID_PLAN_TIERS);

export const BillingIntervalSchema = z.enum(BILLING_INTERVALS);

export function unsoldBillingIntervalMessage(plan: string, interval: BillingInterval): string {
  return `${getBillingPlanPricing(plan).label} is not sold with ${interval} billing. Choose ${billingIntervalsForPlan(plan).join(' or ')} billing.`;
}

const SeatedPlanRequestSchema = z
  .object({
    plan: PlanTierSchema,
    billingInterval: BillingIntervalSchema,
    seats: z.number().int().min(MIN_PURCHASABLE_SEATS).max(MAX_PURCHASABLE_SEATS).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!planOffersBillingInterval(value.plan, value.billingInterval)) {
      context.addIssue({
        code: 'custom',
        path: ['billingInterval'],
        message: unsoldBillingIntervalMessage(value.plan, value.billingInterval),
      });
    }

    const perSeat = isPerSeatBillingPlan(value.plan);
    if (perSeat && value.seats === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['seats'],
        message: `${value.plan} is billed per seat; a seat count is required`,
      });
    }
    if (!perSeat && value.seats !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['seats'],
        message: `${value.plan} is not billed per seat; remove the seat count`,
      });
    }
  });

export const PromotionCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9]+$/, 'Promotion codes use letters and numbers only');

export const CheckoutRequestSchema = SeatedPlanRequestSchema.safeExtend({
  premiumSeats: z.number().int().min(0).max(MAX_PURCHASABLE_SEATS).optional(),
}).superRefine((value, context) => {
  if (value.premiumSeats === undefined) return;
  if (!isPerSeatBillingPlan(value.plan)) {
    context.addIssue({
      code: 'custom',
      path: ['premiumSeats'],
      message: `${value.plan} has no seat types; remove the Premium seat count`,
    });
    return;
  }
  if (value.seats !== undefined && value.premiumSeats > value.seats) {
    context.addIssue({
      code: 'custom',
      path: ['premiumSeats'],
      message: `Premium seats are part of the seat count; choose at most ${value.seats}`,
    });
  }
});

export const UpgradePreviewRequestSchema = SeatedPlanRequestSchema.safeExtend({
  promotionCode: PromotionCodeSchema.optional(),
});

export const UpgradeApplyRequestSchema = SeatedPlanRequestSchema.safeExtend({
  previewToken: z.string().min(1).max(4096),
  promotionCode: PromotionCodeSchema.optional(),
});

export function resolveCheckoutQuantity(request: {
  plan: string;
  seats?: number | undefined;
}): number {
  if (!isPerSeatBillingPlan(request.plan)) return 1;
  return request.seats ?? MIN_PURCHASABLE_SEATS;
}

export function resolveCheckoutSeatQuantities(request: {
  plan: string;
  seats?: number | undefined;
  premiumSeats?: number | undefined;
}): TeamSeatQuantities {
  const total = resolveCheckoutQuantity(request);
  const premium = isPerSeatBillingPlan(request.plan)
    ? Math.min(request.premiumSeats ?? 0, total)
    : 0;
  return { standard: total - premium, premium };
}

export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;
export type UpgradePreviewRequest = z.infer<typeof UpgradePreviewRequestSchema>;
export type UpgradeApplyRequest = z.infer<typeof UpgradeApplyRequestSchema>;
export type PlanTier = z.infer<typeof PlanTierSchema>;
export type BillingInterval = z.infer<typeof BillingIntervalSchema>;
