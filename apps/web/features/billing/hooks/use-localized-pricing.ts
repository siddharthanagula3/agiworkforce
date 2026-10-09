'use client';

import { useEffect, useState } from 'react';
import {
  LOCALIZED_PRICING_PATH,
  localizedPricingCatalogSchema,
  type LocalizedPricingCatalog,
  type LocalizedPricingStatus,
} from '@features/billing/lib/localized-pricing';

export interface LocalizedPricingState {
  localizedPricing: LocalizedPricingCatalog | null;
  pricingStatus: LocalizedPricingStatus;
}

// Display the exact same trusted country-derived Stripe prices that Checkout
// validates server-side. A malformed/unavailable response falls back to the
// public USD catalog without changing the charged amount.
export function useLocalizedPricing(enabled = true): LocalizedPricingState {
  const [localizedPricing, setLocalizedPricing] = useState<LocalizedPricingCatalog | null>(null);
  const [pricingStatus, setPricingStatus] = useState<LocalizedPricingStatus>('loading');

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetch(LOCALIZED_PRICING_PATH, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Localized pricing is unavailable');
        return response.json();
      })
      .then((value: unknown) => {
        const parsed = localizedPricingCatalogSchema.safeParse(value);
        if (!parsed.success) throw new Error('Localized pricing response is invalid');
        setLocalizedPricing(parsed.data);
        setPricingStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setPricingStatus('error');
      });
    return () => controller.abort();
  }, [enabled]);

  return { localizedPricing, pricingStatus };
}
