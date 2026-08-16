import { z } from 'zod';
import {
  MAX_PURCHASABLE_SEATS,
  MIN_PURCHASABLE_SEATS,
  SELF_SERVE_PAID_PLAN_TIERS,
  isPerSeatBillingPlan,
} from '@agiworkforce/types';

export const PlanTierSchema = z.enum(SELF_SERVE_PAID_PLAN_TIERS);

export const BillingIntervalSchema = z.enum(['monthly', 'yearly']);

const MONTHLY_ONLY_PLANS = new Set(['basic', 'max', 'max_15x']);

export const CheckoutRequestSchema = z
  .object({
    plan: PlanTierSchema,
    billingInterval: BillingIntervalSchema,
    seats: z.number().int().min(MIN_PURCHASABLE_SEATS).max(MAX_PURCHASABLE_SEATS).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.billingInterval === 'yearly' && MONTHLY_ONLY_PLANS.has(value.plan)) {
      context.addIssue({
        code: 'custom',
        path: ['billingInterval'],
        message: `${value.plan} is available with monthly billing only`,
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

export const UpgradeApplyRequestSchema = CheckoutRequestSchema.safeExtend({
  previewToken: z.string().min(1).max(4096),
});

export function resolveCheckoutQuantity(request: {
  plan: string;
  seats?: number | undefined;
}): number {
  if (!isPerSeatBillingPlan(request.plan)) return 1;
  return request.seats ?? MIN_PURCHASABLE_SEATS;
}

export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;
export type UpgradeApplyRequest = z.infer<typeof UpgradeApplyRequestSchema>;
export type PlanTier = z.infer<typeof PlanTierSchema>;
export type BillingInterval = z.infer<typeof BillingIntervalSchema>;
