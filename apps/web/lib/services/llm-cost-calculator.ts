import 'server-only';

/**
 * LLM Cost Calculator
 * Calculates cost in cents based on provider, model, and token usage
 *
 * Last Updated: 2026-01-28
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
// MODEL PRICING (Updated 2026-01-28)
// Prices in USD per 1M tokens (input / output)
// =============================================================================
const MODEL_PRICING: Record<string, ModelPricing> = {
  // ---------------------------------------------------------------------------
  // OpenAI (Updated 2026-01-28)
  // https://platform.openai.com/docs/models
  // ---------------------------------------------------------------------------
  // GPT-5 Pro (Flagship)
  'gpt-5-pro': { inputCostPer1MTokens: 5.0, outputCostPer1MTokens: 30.0 },
  // GPT-5.2 Family
  'gpt-5.2': { inputCostPer1MTokens: 1.75, outputCostPer1MTokens: 14.0 },
  'gpt-5.2-pro': { inputCostPer1MTokens: 3.5, outputCostPer1MTokens: 28.0 },
  'gpt-5.2-codex': { inputCostPer1MTokens: 1.75, outputCostPer1MTokens: 14.0 },
  // GPT-5 Family
  'gpt-5': { inputCostPer1MTokens: 1.25, outputCostPer1MTokens: 10.0 },
  'gpt-5-mini': { inputCostPer1MTokens: 0.25, outputCostPer1MTokens: 2.0 },
  'gpt-5-nano': { inputCostPer1MTokens: 0.05, outputCostPer1MTokens: 0.4 },
  // O-Series Reasoning
  o3: { inputCostPer1MTokens: 2.0, outputCostPer1MTokens: 8.0 },
  'o3-pro': { inputCostPer1MTokens: 4.0, outputCostPer1MTokens: 16.0 },
  'o4-mini': { inputCostPer1MTokens: 1.1, outputCostPer1MTokens: 4.4 },
  // Legacy OpenAI
  'gpt-4o': { inputCostPer1MTokens: 2.5, outputCostPer1MTokens: 10.0 },
  'gpt-4o-mini': { inputCostPer1MTokens: 0.15, outputCostPer1MTokens: 0.6 },
  // Image Generation
  'dall-e-3': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 40.0 },
  'gpt-image-1': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 40.0 },
  'gpt-image-1.5': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 80.0 },
  // TTS
  'tts-1': { inputCostPer1MTokens: 15.0, outputCostPer1MTokens: 0.0 },
  'tts-1-hd': { inputCostPer1MTokens: 30.0, outputCostPer1MTokens: 0.0 },
  // STT
  'whisper-1': { inputCostPer1MTokens: 0.006, outputCostPer1MTokens: 0.0 },
  // Video Generation (Sora)
  'sora-2': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 100.0 }, // ~$0.10/sec
  'sora-2-pro': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 500.0 },

  // ---------------------------------------------------------------------------
  // Anthropic Claude 4.5 (Updated 2026-01-03)
  // https://platform.claude.com/docs/en/about-claude/models/overview
  // ---------------------------------------------------------------------------
  'claude-opus-4-5-20251101': { inputCostPer1MTokens: 5.0, outputCostPer1MTokens: 25.0 },
  'claude-opus-4-5': { inputCostPer1MTokens: 5.0, outputCostPer1MTokens: 25.0 },
  'claude-sonnet-4-5-20250929': { inputCostPer1MTokens: 3.0, outputCostPer1MTokens: 15.0 },
  'claude-sonnet-4-5': { inputCostPer1MTokens: 3.0, outputCostPer1MTokens: 15.0 },
  'claude-haiku-4-5-20251001': { inputCostPer1MTokens: 1.0, outputCostPer1MTokens: 5.0 },
  'claude-haiku-4-5': { inputCostPer1MTokens: 1.0, outputCostPer1MTokens: 5.0 },
  // Legacy Claude 4.x
  'claude-opus-4-1': { inputCostPer1MTokens: 15.0, outputCostPer1MTokens: 75.0 },
  'claude-opus-4': { inputCostPer1MTokens: 15.0, outputCostPer1MTokens: 75.0 },
  'claude-sonnet-4': { inputCostPer1MTokens: 3.0, outputCostPer1MTokens: 15.0 },
  // Legacy Claude 3.x
  'claude-3-7-sonnet': { inputCostPer1MTokens: 3.0, outputCostPer1MTokens: 15.0 },
  'claude-3-5-sonnet-20241022': { inputCostPer1MTokens: 3.0, outputCostPer1MTokens: 15.0 },
  'claude-3-haiku': { inputCostPer1MTokens: 0.25, outputCostPer1MTokens: 1.25 },

  // ---------------------------------------------------------------------------
  // Google Gemini (Updated 2026-01-28)
  // https://ai.google.dev/gemini-api/docs/models
  // ---------------------------------------------------------------------------
  // Gemini 3 Series (Latest)
  'gemini-3-ultra': { inputCostPer1MTokens: 3.5, outputCostPer1MTokens: 14.0 },
  'gemini-3-pro-preview': { inputCostPer1MTokens: 2.0, outputCostPer1MTokens: 12.0 },
  'gemini-3-flash-preview': { inputCostPer1MTokens: 0.5, outputCostPer1MTokens: 3.0 },
  // Gemini 2.5 Series
  'gemini-2.5-pro': { inputCostPer1MTokens: 1.25, outputCostPer1MTokens: 10.0 },
  'gemini-2.5-flash': { inputCostPer1MTokens: 0.3, outputCostPer1MTokens: 2.5 },
  'gemini-2.5-flash-lite': { inputCostPer1MTokens: 0.15, outputCostPer1MTokens: 1.0 },
  // Legacy Gemini 2.0
  'gemini-2.0-flash': { inputCostPer1MTokens: 0.1, outputCostPer1MTokens: 0.4 },
  // Image Generation (Imagen 4)
  'imagen-4': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 40.0 },
  'imagen-4-ultra': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 80.0 },
  'imagen-4.0-generate-001': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 40.0 },
  'imagen-4.0-ultra-generate-001': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 80.0 },
  // Video Generation (Veo)
  'veo-3': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 750.0 },
  'veo-3.1-generate-preview': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 750.0 }, // $0.75/sec
  'veo-3.0-generate-preview': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 750.0 },

  // ---------------------------------------------------------------------------
  // xAI Grok 4 (Updated 2026-01-28)
  // https://docs.x.ai/docs/models
  // ---------------------------------------------------------------------------
  'grok-4': { inputCostPer1MTokens: 3.0, outputCostPer1MTokens: 15.0 },
  'grok-4-fast-reasoning': { inputCostPer1MTokens: 0.2, outputCostPer1MTokens: 0.5 },
  'grok-4-fast-non-reasoning': { inputCostPer1MTokens: 0.2, outputCostPer1MTokens: 0.5 },
  'grok-code-fast-1': { inputCostPer1MTokens: 0.2, outputCostPer1MTokens: 1.5 },
  // Vision
  'grok-2-vision-1212': { inputCostPer1MTokens: 0.5, outputCostPer1MTokens: 1.5 },
  // Image Generation
  'grok-2-image-1212': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 30.0 },

  // ---------------------------------------------------------------------------
  // DeepSeek (Updated 2026-02-07) - Best Value
  // https://api-docs.deepseek.com/quick_start/pricing
  // ---------------------------------------------------------------------------
  'deepseek-chat': { inputCostPer1MTokens: 0.28, outputCostPer1MTokens: 0.42 },
  'deepseek-reasoner': { inputCostPer1MTokens: 0.55, outputCostPer1MTokens: 2.19 },
  'deepseek-r1': { inputCostPer1MTokens: 0.55, outputCostPer1MTokens: 2.19 },

  // ---------------------------------------------------------------------------
  // Qwen (Updated 2026-02-07)
  // https://www.alibabacloud.com/help/en/model-studio/models
  // ---------------------------------------------------------------------------
  'qwen-max': { inputCostPer1MTokens: 1.2, outputCostPer1MTokens: 6.0 },
  'qwen-plus': { inputCostPer1MTokens: 0.4, outputCostPer1MTokens: 1.2 },
  'qwen-turbo': { inputCostPer1MTokens: 0.1, outputCostPer1MTokens: 0.3 },
  'qwen-flash': { inputCostPer1MTokens: 0.05, outputCostPer1MTokens: 0.15 },
  // Coding
  'qwen-coder': { inputCostPer1MTokens: 0.3, outputCostPer1MTokens: 1.5 },
  'qwen-coder-plus': { inputCostPer1MTokens: 0.5, outputCostPer1MTokens: 2.0 },
  'qwen-coder-flash': { inputCostPer1MTokens: 0.22, outputCostPer1MTokens: 0.95 },
  // Vision
  'qwen3-vl-plus': { inputCostPer1MTokens: 0.8, outputCostPer1MTokens: 3.0 },
  'qwen3-vl-flash': { inputCostPer1MTokens: 0.3, outputCostPer1MTokens: 1.2 },
  // Reasoning
  'qwq-plus': { inputCostPer1MTokens: 1.0, outputCostPer1MTokens: 5.0 },
  // Image Generation
  'qwen-image-max': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 35.0 },

  // ---------------------------------------------------------------------------
  // ZhipuAI GLM (Updated 2026-02-26)
  // https://open.bigmodel.cn/dev/howuse/model
  // ---------------------------------------------------------------------------
  'glm-4.7': { inputCostPer1MTokens: 0.35, outputCostPer1MTokens: 0.35 },
  'glm-4.6v': { inputCostPer1MTokens: 0.5, outputCostPer1MTokens: 0.5 },
  'glm-4.6v-flash': { inputCostPer1MTokens: 0.1, outputCostPer1MTokens: 0.1 },

  // ---------------------------------------------------------------------------
  // Moonshot Kimi K2.5 (Updated 2026-01-28)
  // ---------------------------------------------------------------------------
  'kimi-k2.5': { inputCostPer1MTokens: 0.8, outputCostPer1MTokens: 3.5 },
  'kimi-k2.5-thinking': { inputCostPer1MTokens: 0.8, outputCostPer1MTokens: 3.5 },
  'kimi-k2.5-turbo': { inputCostPer1MTokens: 1.25, outputCostPer1MTokens: 8.5 },

  // ---------------------------------------------------------------------------
  // Perplexity Sonar (Updated 2026-01-28)
  // https://docs.perplexity.ai/getting-started/models
  // Note: Perplexity also charges per-search fees not reflected here
  // ---------------------------------------------------------------------------
  sonar: { inputCostPer1MTokens: 1.0, outputCostPer1MTokens: 1.0 },
  'sonar-pro': { inputCostPer1MTokens: 3.0, outputCostPer1MTokens: 15.0 },
  'sonar-reasoning': { inputCostPer1MTokens: 1.0, outputCostPer1MTokens: 5.0 },
  'sonar-reasoning-pro': { inputCostPer1MTokens: 2.0, outputCostPer1MTokens: 8.0 },
  'sonar-deep-research': { inputCostPer1MTokens: 2.0, outputCostPer1MTokens: 8.0 },

  // ---------------------------------------------------------------------------
  // Third-party Image Generation (Updated 2026-01-28)
  // ---------------------------------------------------------------------------
  'flux-1.1-pro': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 40.0 },
  'flux-2-pro': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 60.0 },
  'ideogram-2': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 20.0 },

  // ---------------------------------------------------------------------------
  // Music Generation (Credit-based, use 0 for now)
  // ---------------------------------------------------------------------------
  'suno-v4': { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 0.0 },
  udio: { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 0.0 },
};

// =============================================================================
// PROVIDER DEFAULTS (Updated 2026-01-28)
// Used when a specific model is not found in MODEL_PRICING
// These should reflect the most commonly used/recommended model per provider
// =============================================================================
const PROVIDER_DEFAULTS: Record<string, ModelPricing> = {
  openai: { inputCostPer1MTokens: 1.75, outputCostPer1MTokens: 14.0 }, // GPT-5.2
  anthropic: { inputCostPer1MTokens: 3.0, outputCostPer1MTokens: 15.0 }, // Sonnet 4.5
  google: { inputCostPer1MTokens: 0.5, outputCostPer1MTokens: 3.0 }, // Gemini 3 Flash
  xai: { inputCostPer1MTokens: 0.2, outputCostPer1MTokens: 0.5 }, // Grok 4 Fast
  deepseek: { inputCostPer1MTokens: 0.28, outputCostPer1MTokens: 0.42 }, // V3.2
  qwen: { inputCostPer1MTokens: 1.2, outputCostPer1MTokens: 6.0 }, // Qwen Max
  zhipuai: { inputCostPer1MTokens: 0.35, outputCostPer1MTokens: 0.35 }, // GLM-4.7
  moonshot: { inputCostPer1MTokens: 0.8, outputCostPer1MTokens: 3.5 }, // Kimi K2.5
  perplexity: { inputCostPer1MTokens: 2.0, outputCostPer1MTokens: 8.0 }, // Sonar Deep Research
  ollama: { inputCostPer1MTokens: 0.0, outputCostPer1MTokens: 0.0 }, // Local models
};

// Default fallback if provider is unknown
const FALLBACK_PRICING: ModelPricing = {
  inputCostPer1MTokens: 1.0,
  outputCostPer1MTokens: 4.0,
};

import { logger } from '@/lib/logger';

export class LLMCostCalculator {
  /**
   * Calculate cost in cents for token usage
   * @throws Never - returns 0 on error for safety
   */
  static calculateCost(provider: string, model: string, usage: TokenUsage): number {
    try {
      // Validate inputs
      if (!provider || typeof provider !== 'string') {
        logger.warn({ provider, model }, 'LLM cost calculator: Invalid provider, using fallback');
        return this.calculateWithFallback(usage);
      }

      if (!model || typeof model !== 'string') {
        logger.warn({ provider, model }, 'LLM cost calculator: Invalid model, using fallback');
        return this.calculateWithFallback(usage);
      }

      if (
        !usage ||
        typeof usage.promptTokens !== 'number' ||
        typeof usage.completionTokens !== 'number'
      ) {
        logger.warn({ provider, model, usage }, 'LLM cost calculator: Invalid usage data');
        return 0;
      }

      // Validate token counts are non-negative
      const promptTokens = Math.max(0, usage.promptTokens);
      const completionTokens = Math.max(0, usage.completionTokens);

      const pricing = this.getPricing(provider, model);

      const inputCost = (promptTokens / 1_000_000) * pricing.inputCostPer1MTokens;
      const outputCost = (completionTokens / 1_000_000) * pricing.outputCostPer1MTokens;

      const totalCostDollars = inputCost + outputCost;
      // Convert to cents and round to nearest cent
      return Math.round(totalCostDollars * 100);
    } catch (error) {
      logger.error({ error, provider, model }, 'LLM cost calculator: Unexpected error');
      return 0;
    }
  }

  /**
   * Calculate cost using fallback pricing
   */
  private static calculateWithFallback(usage: TokenUsage): number {
    const promptTokens = Math.max(0, usage?.promptTokens || 0);
    const completionTokens = Math.max(0, usage?.completionTokens || 0);

    const inputCost = (promptTokens / 1_000_000) * FALLBACK_PRICING.inputCostPer1MTokens;
    const outputCost = (completionTokens / 1_000_000) * FALLBACK_PRICING.outputCostPer1MTokens;

    return Math.round((inputCost + outputCost) * 100);
  }

  /**
   * Get pricing for a model
   * Always returns valid pricing (never throws)
   */
  static getPricing(provider: string, model: string): ModelPricing {
    try {
      // Try exact model match first
      if (model && MODEL_PRICING[model]) {
        return MODEL_PRICING[model];
      }

      // Try provider-specific fallback
      if (provider) {
        const providerLower = provider.toLowerCase();
        if (PROVIDER_DEFAULTS[providerLower]) {
          logger.debug({ provider, model }, 'LLM cost calculator: Using provider default pricing');
          return PROVIDER_DEFAULTS[providerLower];
        }
      }

      // Ultimate fallback
      logger.debug({ provider, model }, 'LLM cost calculator: Using ultimate fallback pricing');
      return FALLBACK_PRICING;
    } catch {
      return FALLBACK_PRICING;
    }
  }

  /**
   * Estimate cost before making request (for pre-check)
   * @throws Never - returns 0 on error for safety
   */
  static estimateCost(
    provider: string,
    model: string,
    estimatedPromptTokens: number,
    estimatedCompletionTokens: number = 1000,
  ): number {
    try {
      // Validate inputs
      if (typeof estimatedPromptTokens !== 'number' || estimatedPromptTokens < 0) {
        logger.warn(
          { estimatedPromptTokens },
          'LLM cost calculator: Invalid prompt tokens estimate',
        );
        return 0;
      }

      if (typeof estimatedCompletionTokens !== 'number' || estimatedCompletionTokens < 0) {
        estimatedCompletionTokens = 1000; // Use default
      }

      return this.calculateCost(provider, model, {
        promptTokens: estimatedPromptTokens,
        completionTokens: estimatedCompletionTokens,
        totalTokens: estimatedPromptTokens + estimatedCompletionTokens,
      });
    } catch (error) {
      logger.error({ error, provider, model }, 'LLM cost calculator: Error in estimateCost');
      return 0;
    }
  }

  /**
   * Get input cost per million tokens for a model
   * Used for prompt caching calculations
   */
  static getInputCostPerMtok(provider: string, model: string): number {
    try {
      return this.getPricing(provider, model).inputCostPer1MTokens;
    } catch {
      return FALLBACK_PRICING.inputCostPer1MTokens;
    }
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
