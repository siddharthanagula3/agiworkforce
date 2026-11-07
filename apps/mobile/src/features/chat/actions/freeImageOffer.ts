import { ensureLimitedFreeMediaModel } from '@/src/features/model-picker/freeQuotaCatalogue';
import type { CloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';
import type { MobileImageGenerationRequestDecision } from './resolveMobileImageGenerationRequest';

export type FreeImageOffer =
  { status: 'offered'; model: string; prompt: string } | { status: 'not_offered' | 'unknown' };

export async function freeImageOfferFor(
  decision: MobileImageGenerationRequestDecision,
  account: CloudAccountEpoch,
): Promise<FreeImageOffer> {
  if (decision.status !== 'blocked' || decision.code !== 'plan_required' || !decision.prompt) {
    return { status: 'not_offered' };
  }
  const offer = await ensureLimitedFreeMediaModel('image', account);
  return offer.status === 'offered' ? { ...offer, prompt: decision.prompt } : offer;
}

export const FREE_IMAGE_OFFER_UNKNOWN_ALERT = {
  title: 'Could not check free image availability',
  message: 'Your prompt is still here. Check your connection or sign in again, then retry.',
};
