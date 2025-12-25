import { z } from 'zod';

export const PlanTierSchema = z.enum(['hobby', 'free', 'pro', 'max', 'enterprise']);

export const BillingIntervalSchema = z.enum(['monthly', 'annual']);

export const CheckoutRequestSchema = z.object({
  plan: PlanTierSchema,
  billingInterval: BillingIntervalSchema,
});

export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;
export type PlanTier = z.infer<typeof PlanTierSchema>;
export type BillingInterval = z.infer<typeof BillingIntervalSchema>;
