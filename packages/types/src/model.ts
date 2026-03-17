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

// ============================================================================
// Model Provider
// ============================================================================

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
 *   models: ['claude-opus-4-6', 'claude-sonnet-4-5'],
 * };
 * ```
 */
export interface ModelProvider {
  /** Provider identifier (matches `Provider` from model-catalog). */
  id: Provider | string;

  /** Human-readable provider name. */
  name: string;

  /** Whether this provider is enabled in settings. */
  enabled: boolean;

  /** Whether an API key has been configured for this provider. */
  apiKeyConfigured: boolean;

  /** Base URL for the provider API (overridable for proxies/custom endpoints). */
  baseUrl?: string;

  /** List of available model IDs for this provider. */
  models?: string[];

  /** Provider-level status. */
  status?: 'connected' | 'error' | 'unchecked';

  /** Error message if the provider is in error state. */
  error?: string;
}

// ============================================================================
// Model Config
// ============================================================================

/**
 * Configuration for a specific model selection.
 *
 * Captures the user's model choice along with generation parameters.
 * Used when sending requests to the LLM router.
 *
 * @example
 * ```typescript
 * const config: ModelConfig = {
 *   modelId: 'claude-opus-4-6',
 *   provider: 'anthropic',
 *   temperature: 0.7,
 *   maxTokens: 4096,
 *   topP: 1.0,
 * };
 * ```
 */
export interface ModelConfig {
  /** Model identifier (e.g., `"claude-opus-4-6"`, `"gpt-4o"`). */
  modelId: string;

  /** Provider identifier. */
  provider: Provider | string;

  /** Sampling temperature (0.0 to 2.0). */
  temperature?: number;

  /** Maximum tokens to generate. */
  maxTokens?: number;

  /** Top-p (nucleus) sampling parameter. */
  topP?: number;

  /** Top-k sampling parameter. */
  topK?: number;

  /** Frequency penalty (-2.0 to 2.0). */
  frequencyPenalty?: number;

  /** Presence penalty (-2.0 to 2.0). */
  presencePenalty?: number;

  /** Stop sequences that halt generation. */
  stopSequences?: string[];

  /** Whether to enable extended thinking / chain-of-thought. */
  enableThinking?: boolean;

  /** Whether to enable streaming responses. */
  streaming?: boolean;

  /** System prompt override. */
  systemPrompt?: string;
}

// ============================================================================
// Model Pricing
// ============================================================================

/**
 * Pricing information for a model.
 *
 * All costs are in USD per million tokens unless otherwise noted.
 *
 * @example
 * ```typescript
 * const pricing: ModelPricing = {
 *   modelId: 'claude-opus-4-6',
 *   inputCostPerMillion: 15.0,
 *   outputCostPerMillion: 75.0,
 *   cachedInputCostPerMillion: 1.5,
 *   currency: 'USD',
 * };
 * ```
 */
export interface ModelPricing {
  /** Model identifier. */
  modelId: string;

  /** Cost per million input tokens in USD. */
  inputCostPerMillion: number;

  /** Cost per million output tokens in USD. */
  outputCostPerMillion: number;

  /** Cost per million cached input tokens in USD (if supported). */
  cachedInputCostPerMillion?: number;

  /** Currency code (default: `"USD"`). */
  currency?: string;

  /** Whether this model has a free tier. */
  hasFreeTier?: boolean;

  /** Free tier token limit per month (if applicable). */
  freeMonthlyTokens?: number;
}
