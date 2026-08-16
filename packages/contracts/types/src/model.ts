/**
 * Model Types
 *
 * High-level model configuration types for use across all surfaces.
 * These complement the detailed `model-catalog.ts` types with simpler
 * shapes commonly needed in UI components and settings.
 *
 * For the full model catalog schema (ModelMetadata, ProviderConfig, etc.),
 * see `model-catalog.ts`.
 *
 * @module model
 * @packageDocumentation
 */

import type { Provider } from './model-catalog';

/**
 * An LLM provider with its configuration and status.
 *
 * Used by the settings UI, model selector, and provider management screens.
 *
 * @example
 * ```typescript
 * const provider: ModelProvider = {
 *   id: 'anthropic',
 *   name: 'Anthropic',
 *   enabled: true,
 *   apiKeyConfigured: true,
 *   baseUrl: 'https://api.anthropic.com',
 *   models: providerModels.map(({ id }) => id),
 * };
 * ```
 */
export interface ModelProvider {
  id: Provider | string;

  name: string;

  enabled: boolean;

  apiKeyConfigured: boolean;

  baseUrl?: string;

  models?: string[];

  status?: 'connected' | 'error' | 'unchecked';

  error?: string;
}

/**
 * Configuration for a specific model selection.
 *
 * Captures the user's model choice along with generation parameters.
 * Used when sending requests to the LLM router.
 *
 * @example
 * ```typescript
 * const config: ModelConfig = {
 *   modelId: selectedModel.id,
 *   provider: selectedModel.provider,
 *   temperature: 0.7,
 *   maxTokens: 4096,
 *   topP: 1.0,
 * };
 * ```
 */
export interface ModelConfig {
  modelId: string;

  provider: Provider | string;

  temperature?: number;

  maxTokens?: number;

  topP?: number;

  topK?: number;

  frequencyPenalty?: number;

  presencePenalty?: number;

  stopSequences?: string[];

  enableThinking?: boolean;

  streaming?: boolean;

  systemPrompt?: string;
}

/**
 * Pricing information for a model.
 *
 * All costs are in USD per million tokens unless otherwise noted.
 *
 * @example
 * ```typescript
 * const pricing: ModelPricing = {
 *   modelId: selectedModel.id,
 *   inputCostPerMillion: 15.0,
 *   outputCostPerMillion: 75.0,
 *   cachedInputCostPerMillion: 1.5,
 *   cacheWriteCostPerMillion: 18.75,
 *   currency: 'USD',
 * };
 * ```
 */
export interface ModelPricing {
  modelId: string;

  inputCostPerMillion: number;

  outputCostPerMillion: number;

  cachedInputCostPerMillion?: number;

  cacheWriteCostPerMillion?: number;

  currency?: string;

  hasFreeTier?: boolean;

  freeMonthlyTokens?: number;
}
