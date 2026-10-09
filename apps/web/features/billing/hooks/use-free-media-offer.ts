'use client';

import { useEffect, useState } from 'react';
import {
  FREE_QUOTA_MEDIA_OFFER_PATH,
  FreeQuotaMediaOfferSchema,
  type FreeQuotaMediaOffer,
} from '@agiworkforce/cloud-contracts';

export const NO_FREE_MEDIA_OFFER: FreeQuotaMediaOffer = { image: null, video: null };

export function useFreeMediaOffer(enabled = true): FreeQuotaMediaOffer {
  const [offer, setOffer] = useState<FreeQuotaMediaOffer>(NO_FREE_MEDIA_OFFER);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetch(FREE_QUOTA_MEDIA_OFFER_PATH, { signal: controller.signal })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((value: unknown) => {
        const parsed = FreeQuotaMediaOfferSchema.safeParse(value);
        setOffer(parsed.success ? parsed.data : NO_FREE_MEDIA_OFFER);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled]);

  return offer;
}
