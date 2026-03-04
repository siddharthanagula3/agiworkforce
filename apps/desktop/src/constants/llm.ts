/**
 * LLM Constants — thin shim over models.json (single source of truth)
 *
 * All model data lives in ./models.json. This file re-exports it
 * with the same named exports that the 29+ TS importers expect.
 *
 * To add a new model, edit models.json — not this file.
 */

import type { Provider } from '../types/provider';
import type { SubscriptionTier } from './planModels';
import modelsJson from './models.json';

// ---- Types (unchanged from original) ----

export interface ModelCapabilities {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  json: boolean;
  thinking: boolean;
  computerUse: boolean;
  agentic: boolean;
  imageGen: boolean;
  videoGen: boolean;
  search: boolean;
  research: boolean;
  codeExecution: boolean;
}

export interface ModelMetadata {
  id: string;
  apiModelId?: string;
  name: string;
  provider: Provider;
  modelType:
    | 'chat'
    | 'code'
    | 'reasoning'
    | 'multimodal'
    | 'image'
    | 'video'
    | 'search'
    | 'tts'
    | 'stt'
    | 'music';
  contextWindow: number;
  inputCost: number;
  outputCost: number;
  capabilities: ModelCapabilities;
  benchmarks?: {
    swebench?: number;
    humaneval?: number;
    mmlu?: number;
    gpqa?: number;
    aime?: number;
    sweBenchPro?: number;
    terminalBench2?: number;
    osWorldVerified?: number;
    gdpvalWinsOrTies?: number;
    ctfChallenges?: number;
    sweLancerIcDiamond?: number;
    aiderPolyglot?: number;
    tau2Telecom?: number;
  };
  speed: 'very-fast' | 'fast' | 'medium' | 'slow';
  quality: 'excellent' | 'good' | 'fair';
  qualityTier: 'fast' | 'balanced' | 'best';
  bestFor: string[];
  released?: string;
}

// ---- Derived data from JSON ----

const config = modelsJson;

export const MODEL_METADATA: Record<string, ModelMetadata> = config.models as unknown as Record<
  string,
  ModelMetadata
>;

export const PROVIDER_LABELS: Record<Provider, string> = Object.fromEntries(
  Object.entries(config.providers).map(([id, p]) => [id, p.label]),
) as Record<Provider, string>;

export const MODEL_PRESETS: Record<
  Provider,
  Array<{ value: string; label: string }>
> = config.modelPresets as unknown as Record<Provider, Array<{ value: string; label: string }>>;

export const THINKING_MODEL_VARIANTS: Record<string, string> = {};

export const PROVIDERS_IN_ORDER: Provider[] = config.providersInOrder as Provider[];

export const MODEL_CONTEXT_WINDOWS: Record<string, number> = Object.fromEntries(
  Object.entries(config.models).map(([id, m]) => [id, m.contextWindow]),
);

// ---- Tier logic (reads arrays from JSON) ----

const ECONOMY_MODELS = config.tierAllowedModels.economy;
const PRO_ADDITIONS = config.tierAllowedModels.pro_additions;
const FLAGSHIP_ADDITIONS = config.tierAllowedModels.flagship_additions;

export const TIER_ALLOWED_MODELS: Record<SubscriptionTier, string[]> = {
  free: [...ECONOMY_MODELS],
  hobby: [...ECONOMY_MODELS],
  pro: [...PRO_ADDITIONS, ...ECONOMY_MODELS],
  max: [...FLAGSHIP_ADDITIONS, ...PRO_ADDITIONS, ...ECONOMY_MODELS],
  enterprise: [...FLAGSHIP_ADDITIONS, ...PRO_ADDITIONS, ...ECONOMY_MODELS],
};

// ---- Helper functions (unchanged signatures) ----

export function getModelMetadata(modelId: string): ModelMetadata | null {
  return MODEL_METADATA[modelId] ?? null;
}

export function getAllModels(): ModelMetadata[] {
  return Object.values(MODEL_METADATA);
}

export function getProviderModels(provider: Provider): ModelMetadata[] {
  return getAllModels().filter((model) => model.provider === provider);
}

export function getModelContextWindow(modelId: string): number {
  return MODEL_CONTEXT_WINDOWS[modelId] ?? 128_000;
}

export function formatCost(inputCost?: number, outputCost?: number): string {
  if (inputCost === undefined && outputCost === undefined) {
    return 'N/A';
  }
  if (inputCost === 0 && outputCost === 0) {
    return 'Included';
  }
  const input = inputCost !== undefined ? `$${inputCost.toFixed(2)}` : 'N/A';
  const output = outputCost !== undefined ? `$${outputCost.toFixed(2)}` : 'N/A';
  return `${input}/${output} per 1M tokens`;
}

export function isModelAllowedForTier(modelId: string, tier: SubscriptionTier): boolean {
  const allowedModels = TIER_ALLOWED_MODELS[tier];
  return allowedModels?.includes(modelId) ?? false;
}

export function getAllowedModelsForTier(tier: SubscriptionTier): string[] {
  return TIER_ALLOWED_MODELS[tier] ?? TIER_ALLOWED_MODELS.free;
}

export function normalizeSubscriptionTier(
  tier: SubscriptionTier | string | null | undefined,
): SubscriptionTier {
  switch ((tier ?? '').toLowerCase()) {
    case 'hobby':
      return 'hobby';
    case 'pro':
      return 'pro';
    case 'max':
      return 'max';
    case 'enterprise':
      return 'enterprise';
    default:
      return 'free';
  }
}

export function getAllowedAutoModesForTier(
  tier: SubscriptionTier | string | null | undefined,
): string[] {
  const normalizedTier = normalizeSubscriptionTier(tier);

  if (normalizedTier === 'max' || normalizedTier === 'enterprise') {
    return ['auto-economy', 'auto-balanced', 'auto-premium'];
  }
  if (normalizedTier === 'pro') {
    return ['auto-economy', 'auto-balanced'];
  }
  return ['auto-economy'];
}

export function getBestAutoModeForTier(tier: SubscriptionTier | string | null | undefined): string {
  const allowedAutoModes = getAllowedAutoModesForTier(tier);
  return allowedAutoModes[allowedAutoModes.length - 1] ?? 'auto-economy';
}
