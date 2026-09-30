import { ManagedMediaVideoGenerationRequestSchema } from '@agiworkforce/cloud-contracts';
import {
  chargeCreditsForMicrousd,
  customerChargeMicrousd,
  formatCreditsPerMillionTokens,
  getModelMetadataById,
  resolveEffectiveModelPricingForInputTokens,
  videoGenerationCostMicrousd,
  type ModelMetadata,
} from '@agiworkforce/types';

export interface TokenProfile {
  input: number;
  output: number;
}

export const TYPICAL_MESSAGE_TOKENS: Readonly<TokenProfile> = Object.freeze({
  input: 1_200,
  output: 450,
});

export const TYPICAL_RESEARCH_ROUND_TOKENS: Readonly<TokenProfile> = Object.freeze({
  input: 3_500,
  output: 650,
});

const RESEARCH_SEARCH_FEATURE = 'web_search_perplexity';

function isPublishedTokenPrice(pricing: { inputCost: number; outputCost: number }): boolean {
  return (
    Number.isFinite(pricing.inputCost) &&
    Number.isFinite(pricing.outputCost) &&
    pricing.inputCost >= 0 &&
    pricing.outputCost >= 0 &&
    pricing.inputCost + pricing.outputCost > 0
  );
}

function tokenCostMicrousd(model: ModelMetadata, tokens: TokenProfile, now: Date): number | null {
  const pricing = resolveEffectiveModelPricingForInputTokens(model, now, tokens.input);
  if (!isPublishedTokenPrice(pricing)) return null;
  return tokens.input * pricing.inputCost + tokens.output * pricing.outputCost;
}

export function estimateMessageCredits(modelId: string, now: Date = new Date()): number | null {
  const model = getModelMetadataById(modelId);
  if (!model) return null;
  const microusd = tokenCostMicrousd(model, TYPICAL_MESSAGE_TOKENS, now);
  return microusd === null ? null : chargeCreditsForMicrousd(microusd);
}

export function creditsPerMillionTokens(
  modelId: string,
  now: Date = new Date(),
): { input: number; output: number } | null {
  const model = getModelMetadataById(modelId);
  if (!model) return null;
  const pricing = resolveEffectiveModelPricingForInputTokens(model, now, 0);
  if (!isPublishedTokenPrice(pricing)) return null;
  return {
    input: formatCreditsPerMillionTokens(pricing.inputCost),
    output: formatCreditsPerMillionTokens(pricing.outputCost),
  };
}

export function researchSearchCredits(): number {
  return chargeCreditsForMicrousd(customerChargeMicrousd(RESEARCH_SEARCH_FEATURE));
}

export interface ResearchCreditEstimate {
  modelCredits: number;
  searchCredits: number;
  total: number;
}

export function estimateResearchCredits(
  input: { modelId: string; rounds: number; searches: number },
  now: Date = new Date(),
): ResearchCreditEstimate | null {
  const model = getModelMetadataById(input.modelId);
  if (!model || input.rounds <= 0) return null;
  const roundMicrousd = tokenCostMicrousd(model, TYPICAL_RESEARCH_ROUND_TOKENS, now);
  if (roundMicrousd === null) return null;
  const modelCredits = chargeCreditsForMicrousd(roundMicrousd * input.rounds);
  const searchCredits = researchSearchCredits() * Math.max(0, input.searches);
  return { modelCredits, searchCredits, total: modelCredits + searchCredits };
}

export function defaultVideoDurationSecs(): number {
  return ManagedMediaVideoGenerationRequestSchema.shape.duration_secs.parse(undefined);
}

export function estimateVideoCredits(input: {
  modelId: string;
  resolution: string;
  aspectRatio: string;
  durationSecs?: number;
}): number | null {
  const model = getModelMetadataById(input.modelId);
  if (!model) return null;
  const microusd = videoGenerationCostMicrousd({
    model,
    resolution: input.resolution,
    aspectRatio: input.aspectRatio,
    durationSecs: input.durationSecs ?? defaultVideoDurationSecs(),
    generateAudio: model.videoGeneration?.supportsAudio ?? false,
  });
  return microusd === null ? null : chargeCreditsForMicrousd(microusd);
}
