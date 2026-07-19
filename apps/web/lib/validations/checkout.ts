import { z } from 'zod';
import { SELF_SERVE_PAID_PLAN_TIERS } from '@agiworkforce/types';

export const PlanTierSchema = z.enum(SELF_SERVE_PAID_PLAN_TIERS);

export const BillingIntervalSchema = z.enum(['monthly', 'yearly']);

export const CheckoutRequestSchema = z
  .object({
    plan: PlanTierSchema,
    billingInterval: BillingIntervalSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.billingInterval === 'yearly' &&
      (value.plan === 'basic' || value.plan === 'max' || value.plan === 'max_15x')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['billingInterval'],
        message: `${value.plan} is available with monthly billing only`,
      });
    }
  });

export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;
export type PlanTier = z.infer<typeof PlanTierSchema>;
export type BillingInterval = z.infer<typeof BillingIntervalSchema>;
