import 'server-only';

/**
 * LLM Cost Calculator
 * Calculates cost in cents based on provider, model, and token usage
 *
 * Last Updated: 2026-01-01
 *
 * To add new models (e.g., Claude 5, GPT-6, Grok-5, Gemini 3.5):
 * 1. Add the model to MODEL_PRICING with input/output costs per 1M tokens
 * 2. Update PROVIDER_DEFAULTS if the new model becomes the recommended default
 */

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ModelPricing {
  inputCostPer1MTokens: number; // Cost per 1M input tokens in dollars
  outputCostPer1MTokens: number; // Cost per 1M output tokens in dollars
}

// =============================================================================
// MODEL PRICING (Updated 2026-01-01)
// Prices in USD per 1M tokens (input / output)
// =============================================================================
const MODEL_PRICING: Record<string, ModelPricing> = {
  // ---------------------------------------------------------------------------
  // OpenAI (Updated 2026-01-01)
  // ---------------------------------------------------------------------------
  'gpt-5': { inputCostPer1MTokens: 1.25, outputCostPer1MTokens: 10.0 },
  'gpt-5-mini': { inputCostPer1MTokens: 0.25, outputCostPer1MTokens: 2.0 },
  'gpt-5-nano': { inputCostPer1MTokens: 0.05, outputCostPer1MTokens: 0.4 },
  o3: { inputCostPer1MTokens: 2.0, outputCostPer1MTokens: 8.0 },
  'o4-mini': { inputCostPer1MTokens: 1.1, outputCostPer1MTokens: 4.4 },
  // Legacy OpenAI
  'gpt-4o': { inputCostPer1MTokens: 2.5, outputCostPer1MTokens: 10.0 },
  'gpt-4o-mini': { inputCostPer1MTokens: 0.15, outputCostPer1MTokens: 0.6 },

  // ---------------------------------------------------------------------------
  // Anthropic Claude 4.5 (Updated 2026-01-01)
  // ---------------------------------------------------------------------------
  'claude-opus-4-5': { inputCostPer1MTokens: 5.0, outputCostPer1MTokens: 25.0 },
  'claude-sonnet-4-5': { inputCostPer1MTokens: 3.0, outputCostPer1MTokens: 15.0 },
  'claude-haiku-4-5': { inputCostPer1MTokens: 1.0, outputCostPer1MTokens: 5.0 },
  // Legacy Anthropic
  'claude-3-5-sonnet-20241022': { inputCostPer1MTokens: 3.0, outputCostPer1MTokens: 15.0 },

  // ---------------------------------------------------------------------------
  // Google Gemini (Updated 2026-01-01)
  // ---------------------------------------------------------------------------
  'gemini-3-pro': { inputCostPer1MTokens: 2.0, outputCostPer1MTokens: 12.0 },
  'gemini-3-flash': { inputCostPer1MTokens: 0.5, outputCostPer1MTokens: 3.0 },
  'gemini-3-deep-think': { inputCostPer1MTokens: 2.0, outputCostPer1MTokens: 12.0 },
  'gemini-2.5-pro': { inputCostPer1MTokens: 1.25, outputCostPer1MTokens: 10.0 },
  'gemini-2.5-flash': { inputCostPer1MTokens: 0.3, outputCostPer1MTokens: 2.5 },
  'gemini-2.0-flash': { inputCostPer1MTokens: 0.1, outputCostPer1MTokens: 0.4 },

  // ---------------------------------------------------------------------------
  // xAI Grok 4 (Updated 2026-01-01)
  // ---------------------------------------------------------------------------
  'grok-4': { inputCostPer1MTokens: 3.0, outputCostPer1MTokens: 15.0 },
  'grok-4-fast': { inputCostPer1MTokens: 0.2, outputCostPer1MTokens: 0.5 },
  'grok-4.1': { inputCostPer1MTokens: 0.2, outputCostPer1MTokens: 0.5 },

  // ---------------------------------------------------------------------------
  // DeepSeek (Updated 2026-01-01) - Best Value
  // ---------------------------------------------------------------------------
  'deepseek-v3.2': { inputCostPer1MTokens: 0.28, outputCostPer1MTokens: 0.42 },
  'deepseek-v3': { inputCostPer1MTokens: 0.27, outputCostPer1MTokens: 0.42 },
  'deepseek-chat': { inputCostPer1MTokens: 0.27, outputCostPer1MTokens: 0.42 },
  'deepseek-r1': { inputCostPer1MTokens: 0.55, outputCostPer1MTokens: 1.68 },
  'deepseek-reasoner': { inputCostPer1MTokens: 0.55, outputCostPer1MTokens: 1.68 },

  // ---------------------------------------------------------------------------
  // Qwen3 (Updated 2026-01-01)
  // ---------------------------------------------------------------------------
  'qwen3-max': { inputCostPer1MTokens: 1.2, outputCostPer1MTokens: 6.0 },
  'qwen3-coder': { inputCostPer1MTokens: 0.22, outputCostPer1MTokens: 0.95 },
  'qwen3-coder-plus': { inputCostPer1MTokens: 0.5, outputCostPer1MTokens: 2.0 },

  // ---------------------------------------------------------------------------
  // Moonshot Kimi K2 (Updated 2026-01-01)
  // ---------------------------------------------------------------------------
  'kimi-k2': { inputCostPer1MTokens: 0.6, outputCostPer1MTokens: 2.5 },
  'kimi-k2-thinking': { inputCostPer1MTokens: 0.6, outputCostPer1MTokens: 2.5 },
  'kimi-k2-thinking-turbo': { inputCostPer1MTokens: 1.15, outputCostPer1MTokens: 8.0 },

  // ---------------------------------------------------------------------------
  // Perplexity Sonar (Updated 2026-01-01)
  // Note: Perplexity also charges per-search fees not reflected here
  // ---------------------------------------------------------------------------
  sonar: { inputCostPer1MTokens: 1.0, outputCostPer1MTokens: 1.0 },
  'sonar-pro': { inputCostPer1MTokens: 3.0, outputCostPer1MTokens: 15.0 },
  'sonar-deep-research': { inputCostPer1MTokens: 2.0, outputCostPer1MTokens: 8.0 },
};

// =============================================================================
// PROVIDER DEFAULTS (Updated 2026-01-01)
// Used when a specific model is not found in MODEL_PRICING
// These should reflect the most commonly used/recommended model per provider
// =============================================================================
const PROVIDER_DEFAULTS: Record<string, ModelPricing> = {
  openai: { inputCostPer1MTokens: 1.25, outputCostPer1MTokens: 10.0 }, // GPT-5
  anthropic: { inputCostPer1MTokens: 3.0, outputCostPer1MTokens: 15.0 }, // Sonnet 4.5
  google: { inputCostPer1MTokens: 0.5, outputCostPer1MTokens: 3.0 }, // Gemini 3 Flash
  xai: { inputCostPer1MTokens: 0.2, outputCostPer1MTokens: 0.5 }, // Grok 4.1
  deepseek: { inputCostPer1MTokens: 0.27, outputCostPer1MTokens: 0.42 }, // V3
  qwen: { inputCostPer1MTokens: 1.2, outputCostPer1MTokens: 6.0 }, // Qwen3 Max
  moonshot: { inputCostPer1MTokens: 0.6, outputCostPer1MTokens: 2.5 }, // Kimi K2
  perplexity: { inputCostPer1MTokens: 2.0, outputCostPer1MTokens: 8.0 }, // Sonar Deep Research
  ollama: { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 0.0 }, // Local models
};

// Default fallback if provider is unknown
const FALLBACK_PRICING: ModelPricing = {
  inputCostPer1MTokens: 1.0,
  outputCostPer1MTokens: 4.0,
};

export class LLMCostCalculator {
  /**
   * Calculate cost in cents for token usage
   */
  static calculateCost(provider: string, model: string, usage: TokenUsage): number {
    const pricing = this.getPricing(provider, model);

    const inputCost = (usage.promptTokens / 1_000_000) * pricing.inputCostPer1MTokens;
    const outputCost = (usage.completionTokens / 1_000_000) * pricing.outputCostPer1MTokens;

    const totalCostDollars = inputCost + outputCost;
    // Convert to cents and round to nearest cent
    return Math.round(totalCostDollars * 100);
  }

  /**
   * Get pricing for a model
   */
  static getPricing(provider: string, model: string): ModelPricing {
    // Try exact model match first
    if (MODEL_PRICING[model]) {
      return MODEL_PRICING[model];
    }

    // Try provider-specific fallback
    const providerLower = provider.toLowerCase();
    if (PROVIDER_DEFAULTS[providerLower]) {
      return PROVIDER_DEFAULTS[providerLower];
    }

    // Ultimate fallback
    return FALLBACK_PRICING;
  }

  /**
   * Estimate cost before making request (for pre-check)
   */
  static estimateCost(
    provider: string,
    model: string,
    estimatedPromptTokens: number,
    estimatedCompletionTokens: number = 1000,
  ): number {
    return this.calculateCost(provider, model, {
      promptTokens: estimatedPromptTokens,
      completionTokens: estimatedCompletionTokens,
      totalTokens: estimatedPromptTokens + estimatedCompletionTokens,
    });
  }

  /**
   * Get input cost per million tokens for a model
   * Used for prompt caching calculations
   */
  static getInputCostPerMtok(provider: string, model: string): number {
    return this.getPricing(provider, model).inputCostPer1MTokens;
  }

  /**
   * Add a new model pricing at runtime
   * Useful for dynamically adding new models (e.g., Claude 5, GPT-6)
   */
  static addModelPricing(model: string, inputCost: number, outputCost: number): void {
    MODEL_PRICING[model] = {
      inputCostPer1MTokens: inputCost,
      outputCostPer1MTokens: outputCost,
    };
  }

  /**
   * Get all available model names
   */
  static getAvailableModels(): string[] {
    return Object.keys(MODEL_PRICING);
  }
}
