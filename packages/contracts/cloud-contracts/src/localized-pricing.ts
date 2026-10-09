import { z } from 'zod';

export const LOCALIZED_PRICING_PATH = '/api/pricing/localized';

export const localizedPriceEntrySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[a-z]{3}$/i),
  localized: z.boolean(),
  checkoutReady: z.boolean(),
});

export type LocalizedPriceEntry = z.infer<typeof localizedPriceEntrySchema>;

const localizedPlanPricesSchema = z.object({
  monthly: localizedPriceEntrySchema.optional(),
  yearly: localizedPriceEntrySchema.optional(),
});

export const localizedPricingCatalogSchema = z.object({
  country: z.string().min(2).max(2),
  requestedCurrency: z.string().regex(/^[a-z]{3}$/i),
  plans: z.object({
    basic: localizedPlanPricesSchema,
    pro: localizedPlanPricesSchema,
    max: localizedPlanPricesSchema,
    max_15x: localizedPlanPricesSchema,
    team: localizedPlanPricesSchema,
    team_premium: localizedPlanPricesSchema.optional(),
  }),
});

export type LocalizedPricingCatalog = z.infer<typeof localizedPricingCatalogSchema>;
export type LocalizedPlanPrices = LocalizedPricingCatalog['plans'];
export type LocalizedPricedPlan = keyof LocalizedPlanPrices;
