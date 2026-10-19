import { ensureLimitedFreeMediaModel } from '@/src/features/model-picker/freeQuotaCatalogue';
import type { MobileImageGenerationRequestDecision } from './resolveMobileImageGenerationRequest';

export async function freeImageOfferFor(
  decision: MobileImageGenerationRequestDecision,
): Promise<{ model: string; prompt: string } | null> {
  if (decision.status !== 'blocked' || decision.code !== 'plan_required' || !decision.prompt) {
    return null;
  }
  const model = await ensureLimitedFreeMediaModel('image');
  return model ? { model, prompt: decision.prompt } : null;
}
