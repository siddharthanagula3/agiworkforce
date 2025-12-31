import 'server-only';

/**
 * LLM Cost Calculator
 * Calculates cost in cents based on provider, model, and token usage
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

// Pricing in dollars per 1M tokens (input/output)
const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-5-nano': { inputCostPer1MTokens: 0.05, outputCostPer1MTokens: 0.4 },
  'gpt-5-mini': { inputCostPer1MTokens: 0.25, outputCostPer1MTokens: 2.0 },
  'gpt-5.2': { inputCostPer1MTokens: 2.5, outputCostPer1MTokens: 10.0 },
  'gpt-5.2-pro': { inputCostPer1MTokens: 5.0, outputCostPer1MTokens: 15.0 },
  'gpt-5.2-chat': { inputCostPer1MTokens: 1.5, outputCostPer1MTokens: 6.0 },
  'gpt-5.2-codex': { inputCostPer1MTokens: 3.0, outputCostPer1MTokens: 12.0 },
  'gpt-5.1': { inputCostPer1MTokens: 2.0, outputCostPer1MTokens: 8.0 },
  'gpt-5.1-chat-latest': { inputCostPer1MTokens: 1.0, outputCostPer1MTokens: 4.0 },
  'gpt-5.1-thinking': { inputCostPer1MTokens: 3.0, outputCostPer1MTokens: 12.0 },
  'gpt-5.1-codex-max': { inputCostPer1MTokens: 4.0, outputCostPer1MTokens: 16.0 },

  // Anthropic Claude 4.5 (Current pricing as of 2025)
  'claude-sonnet-4-5': { inputCostPer1MTokens: 3.0, outputCostPer1MTokens: 15.0 }, // ≤200K tokens
  'claude-haiku-4-5': { inputCostPer1MTokens: 1.0, outputCostPer1MTokens: 5.0 },
  'claude-opus-4-5': { inputCostPer1MTokens: 5.0, outputCostPer1MTokens: 25.0 },

  // Google
  'gemini-2.0-flash': { inputCostPer1MTokens: 0.1, outputCostPer1MTokens: 0.4 },
  'gemini-2-flash': { inputCostPer1MTokens: 0.1, outputCostPer1MTokens: 0.4 },
  'gemini-3-pro': { inputCostPer1MTokens: 1.25, outputCostPer1MTokens: 5.0 },
  'gemini-3-flash': { inputCostPer1MTokens: 0.075, outputCostPer1MTokens: 0.3 },
  'gemini-3-deep-think': { inputCostPer1MTokens: 2.0, outputCostPer1MTokens: 8.0 },

  // XAI
  'grok-3-mini': { inputCostPer1MTokens: 0.3, outputCostPer1MTokens: 0.5 },
  'grok-4.1': { inputCostPer1MTokens: 0.5, outputCostPer1MTokens: 2.0 },
  'grok-4.1-fast': { inputCostPer1MTokens: 0.1, outputCostPer1MTokens: 0.4 },

  // Qwen
  'qwen3-max': { inputCostPer1MTokens: 0.5, outputCostPer1MTokens: 2.0 },

  // Moonshot
  'kimi-k2-thinking': { inputCostPer1MTokens: 0.3, outputCostPer1MTokens: 1.2 },

  // DeepSeek
  'deepseek-v3': { inputCostPer1MTokens: 0.028, outputCostPer1MTokens: 0.42 },
  'deepseek-reasoner': { inputCostPer1MTokens: 0.55, outputCostPer1MTokens: 2.2 },
  'deepseek-chat': { inputCostPer1MTokens: 0.14, outputCostPer1MTokens: 0.56 },
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

    // Try provider-specific fallbacks
    const fallbackPricing: Record<string, ModelPricing> = {
      openai: { inputCostPer1MTokens: 2.0, outputCostPer1MTokens: 8.0 },
      anthropic: { inputCostPer1MTokens: 3.0, outputCostPer1MTokens: 15.0 },
      google: { inputCostPer1MTokens: 1.25, outputCostPer1MTokens: 5.0 },
      xai: { inputCostPer1MTokens: 0.5, outputCostPer1MTokens: 2.0 },
      qwen: { inputCostPer1MTokens: 0.5, outputCostPer1MTokens: 2.0 },
      moonshot: { inputCostPer1MTokens: 0.3, outputCostPer1MTokens: 1.2 },
      deepseek: { inputCostPer1MTokens: 0.55, outputCostPer1MTokens: 2.2 },
    };

    return (
      fallbackPricing[provider.toLowerCase()] || {
        inputCostPer1MTokens: 1.0,
        outputCostPer1MTokens: 4.0,
      }
    );
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
}
