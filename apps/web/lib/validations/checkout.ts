import { z } from 'zod';

export const PlanTierSchema = z.enum(['basic', 'pro', 'max', 'team']);

export const BillingIntervalSchema = z.enum(['monthly', 'yearly']);

/** Only meaningful for `plan: 'basic'`, which prices in USD or INR instead of by interval. */
export const CheckoutCurrencySchema = z.enum(['usd', 'inr']);

export const CheckoutRequestSchema = z.object({
  plan: PlanTierSchema,
  billingInterval: BillingIntervalSchema,
  currency: CheckoutCurrencySchema.optional(),
});

export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;
export type PlanTier = z.infer<typeof PlanTierSchema>;
export type BillingInterval = z.infer<typeof BillingIntervalSchema>;
export type CheckoutCurrency = z.infer<typeof CheckoutCurrencySchema>;
