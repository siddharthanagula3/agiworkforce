import {
  FREE_MODEL_PROMOTION_PATH,
  FreeModelPromotionResponseSchema,
  type FreeModelPromotionOffer,
} from '@agiworkforce/cloud-contracts';
import { platformRequestHeaders } from '../../platformHeaders';
import { FREE_TRIAL_GATEWAY } from './freeTrialClient';

export async function fetchFreeModelPromotion(
  token: string,
): Promise<FreeModelPromotionOffer | null> {
  const response = await fetch(`${FREE_TRIAL_GATEWAY}${FREE_MODEL_PROMOTION_PATH}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...platformRequestHeaders(),
    },
  });
  if (!response.ok) return null;
  const parsed = FreeModelPromotionResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success ? parsed.data.promotion : null;
}
