import { z } from 'zod';

// Fix 7: pro_plus removed from locked 6-tier product definition.
// Locked tiers: free, hobby, pro, max, team, enterprise.
export const PlanTierSchema = z.enum(['hobby', 'free', 'pro', 'max', 'enterprise']);

export const BillingIntervalSchema = z.enum(['monthly', 'yearly']);

export const CheckoutRequestSchema = z.object({
  plan: PlanTierSchema,
  billingInterval: BillingIntervalSchema,
});

export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;
export type PlanTier = z.infer<typeof PlanTierSchema>;
export type BillingInterval = z.infer<typeof BillingIntervalSchema>;
