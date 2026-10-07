import 'server-only';

import type { FreeQuotaMediaOffer } from '@agiworkforce/cloud-contracts';
import { withTimeout } from '@agiworkforce/utils';
import { logger } from '@/lib/logger';
import { loadFreePools } from './free-pools';
import { freeMediaOfferFor, sharedFreeQuotaContext } from './free-quota-catalogue';
import { readSharedFreeQuotaCatalogue } from './free-quota-catalogue-cache';

export const FREE_MEDIA_OFFER_RENDER_BUDGET_MS = 500;

export async function readFreeMediaOffer(): Promise<FreeQuotaMediaOffer> {
  const { limitedMediaOffer } = loadFreePools();
  const catalogue = limitedMediaOffer
    ? await readSharedFreeQuotaCatalogue(sharedFreeQuotaContext())
    : null;
  return {
    image: freeMediaOfferFor(catalogue, limitedMediaOffer, 'image'),
    video: freeMediaOfferFor(catalogue, limitedMediaOffer, 'video'),
  };
}

export async function readFreeMediaOfferForRender(): Promise<FreeQuotaMediaOffer | null> {
  try {
    return await withTimeout(readFreeMediaOffer, FREE_MEDIA_OFFER_RENDER_BUDGET_MS);
  } catch (error) {
    logger.error(
      { error },
      '[free-quota] the media offer could not be read; the page renders without it',
    );
    return null;
  }
}
