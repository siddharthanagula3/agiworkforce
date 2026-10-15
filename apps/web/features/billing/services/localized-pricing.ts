import {
  LOCALIZED_PRICING_PATH,
  localizedPricingCatalogSchema,
  type LocalizedPricingCatalog,
} from '@agiworkforce/cloud-contracts';

export async function readLocalizedPricing(signal: AbortSignal): Promise<LocalizedPricingCatalog> {
  const response = await fetch(LOCALIZED_PRICING_PATH, { signal });
  if (!response.ok) throw new Error('Localized pricing is unavailable');
  const parsed = localizedPricingCatalogSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Localized pricing response is invalid');
  return parsed.data;
}
