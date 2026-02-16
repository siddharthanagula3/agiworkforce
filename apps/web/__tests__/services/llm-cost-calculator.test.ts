import { describe, it, expect, afterEach } from 'vitest';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';

describe('LLMCostCalculator', () => {
  // =========================================================================
  // calculateCost Tests - Anthropic Models
  // =========================================================================
  describe('calculateCost - Anthropic Models', () => {
    it('should calculate cost for claude-opus-4-5', () => {
      const cost = LLMCostCalculator.calculateCost('anthropic', 'claude-opus-4-5', {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      });

      // claude-opus-4-5: $5.0/1M input, $25.0/1M output
      // (1000/1M * 5.0 + 500/1M * 25.0) * 100 = (0.005 + 0.0125) * 100 = 1.75 cents
      // Rounded to nearest cent = 2
      expect(cost).toBe(2);
    });

    it('should calculate cost for claude-sonnet-4-5', () => {
      const cost = LLMCostCalculator.calculateCost('anthropic', 'claude-sonnet-4-5', {
        promptTokens: 10000,
        completionTokens: 2000,
        totalTokens: 12000,
      });

      // claude-sonnet-4-5: $3.0/1M input, $15.0/1M output
      // (10000/1M * 3.0 + 2000/1M * 15.0) * 100 = (0.03 + 0.03) * 100 = 6 cents
      expect(cost).toBe(6);
    });

    it('should calculate cost for claude-haiku-4-5', () => {
      const cost = LLMCostCalculator.calculateCost('anthropic', 'claude-haiku-4-5', {
        promptTokens: 50000,
        completionTokens: 10000,
        totalTokens: 60000,
      });

      // claude-haiku-4-5: $1.0/1M input, $5.0/1M output
      // (50000/1M * 1.0 + 10000/1M * 5.0) * 100 = (0.05 + 0.05) * 100 = 10 cents
      expect(cost).toBe(10);
    });

    it('should calculate cost for legacy claude-3-7-sonnet', () => {
      const cost = LLMCostCalculator.calculateCost('anthropic', 'claude-3-7-sonnet', {
        promptTokens: 5000,
        completionTokens: 1000,
        totalTokens: 6000,
      });

      // claude-3-7-sonnet: $3.0/1M input, $15.0/1M output
      // (5000/1M * 3.0 + 1000/1M * 15.0) * 100 = (0.015 + 0.015) * 100 = 3 cents
      expect(cost).toBe(3);
    });
  });

  // =========================================================================
  // calculateCost Tests - OpenAI Models
  // =========================================================================
  describe('calculateCost - OpenAI Models', () => {
    it('should calculate cost for gpt-5.2', () => {
      const cost = LLMCostCalculator.calculateCost('openai', 'gpt-5.2', {
        promptTokens: 10000,
        completionTokens: 2000,
        totalTokens: 12000,
      });

      // gpt-5.2: $1.75/1M input, $14.0/1M output
      // (10000/1M * 1.75 + 2000/1M * 14.0) * 100 = (0.0175 + 0.028) * 100 = 4.55 cents
      // Rounded = 5
      expect(cost).toBe(5);
    });

    it('should calculate cost for gpt-5-nano (cheapest OpenAI)', () => {
      const cost = LLMCostCalculator.calculateCost('openai', 'gpt-5-nano', {
        promptTokens: 100000,
        completionTokens: 10000,
        totalTokens: 110000,
      });

      // gpt-5-nano: $0.05/1M input, $0.4/1M output
      // (100000/1M * 0.05 + 10000/1M * 0.4) * 100 = (0.005 + 0.004) * 100 = 0.9 cents
      // Rounded = 1
      expect(cost).toBe(1);
    });

    it('should calculate cost for o3 reasoning model', () => {
      const cost = LLMCostCalculator.calculateCost('openai', 'o3', {
        promptTokens: 5000,
        completionTokens: 2000,
        totalTokens: 7000,
      });

      // o3: $2.0/1M input, $8.0/1M output
      // (5000/1M * 2.0 + 2000/1M * 8.0) * 100 = (0.01 + 0.016) * 100 = 2.6 cents
      // Rounded = 3
      expect(cost).toBe(3);
    });
  });

  // =========================================================================
  // calculateCost Tests - Google Models
  // =========================================================================
  describe('calculateCost - Google Models', () => {
    it('should calculate cost for gemini-3-pro-preview', () => {
      const cost = LLMCostCalculator.calculateCost('google', 'gemini-3-pro-preview', {
        promptTokens: 20000,
        completionTokens: 5000,
        totalTokens: 25000,
      });

      // gemini-3-pro-preview: $2.0/1M input, $12.0/1M output
      // (20000/1M * 2.0 + 5000/1M * 12.0) * 100 = (0.04 + 0.06) * 100 = 10 cents
      expect(cost).toBe(10);
    });

    it('should calculate cost for gemini-2.5-flash', () => {
      const cost = LLMCostCalculator.calculateCost('google', 'gemini-2.5-flash', {
        promptTokens: 50000,
        completionTokens: 10000,
        totalTokens: 60000,
      });

      // gemini-2.5-flash: $0.3/1M input, $2.5/1M output
      // (50000/1M * 0.3 + 10000/1M * 2.5) * 100 = (0.015 + 0.025) * 100 = 4 cents
      expect(cost).toBe(4);
    });

    it('should calculate cost for gemini-2.5-flash-lite (budget option)', () => {
      const cost = LLMCostCalculator.calculateCost('google', 'gemini-2.5-flash-lite', {
        promptTokens: 100000,
        completionTokens: 20000,
        totalTokens: 120000,
      });

      // gemini-2.5-flash-lite: $0.15/1M input, $1.0/1M output
      // (100000/1M * 0.15 + 20000/1M * 1.0) * 100 = (0.015 + 0.02) * 100 = 3.5 cents
      // Rounded = 4
      expect(cost).toBe(4);
    });
  });

  // =========================================================================
  // calculateCost Tests - xAI (Grok) Models
  // =========================================================================
  describe('calculateCost - xAI Models', () => {
    it('should calculate cost for grok-4-fast-reasoning', () => {
      const cost = LLMCostCalculator.calculateCost('xai', 'grok-4-fast-reasoning', {
        promptTokens: 50000,
        completionTokens: 10000,
        totalTokens: 60000,
      });

      // grok-4-fast-reasoning: $0.2/1M input, $0.5/1M output
      // (50000/1M * 0.2 + 10000/1M * 0.5) * 100 = (0.01 + 0.005) * 100 = 1.5 cents
      // Rounded = 2
      expect(cost).toBe(2);
    });

    it('should calculate cost for grok-4 (full model)', () => {
      const cost = LLMCostCalculator.calculateCost('xai', 'grok-4', {
        promptTokens: 10000,
        completionTokens: 2000,
        totalTokens: 12000,
      });

      // grok-4: $3.0/1M input, $15.0/1M output
      // (10000/1M * 3.0 + 2000/1M * 15.0) * 100 = (0.03 + 0.03) * 100 = 6 cents
      expect(cost).toBe(6);
    });
  });

  // =========================================================================
  // calculateCost Tests - DeepSeek Models (Best Value)
  // =========================================================================
  describe('calculateCost - DeepSeek Models', () => {
    it('should calculate cost for deepseek-chat (best value)', () => {
      const cost = LLMCostCalculator.calculateCost('deepseek', 'deepseek-chat', {
        promptTokens: 100000,
        completionTokens: 20000,
        totalTokens: 120000,
      });

      // deepseek-chat: $0.28/1M input, $0.42/1M output
      // (100000/1M * 0.28 + 20000/1M * 0.42) * 100 = (0.028 + 0.0084) * 100 = 3.64 cents
      // Rounded = 4
      expect(cost).toBe(4);
    });

    it('should calculate cost for deepseek-r1 (reasoning)', () => {
      const cost = LLMCostCalculator.calculateCost('deepseek', 'deepseek-r1', {
        promptTokens: 50000,
        completionTokens: 10000,
        totalTokens: 60000,
      });

      // deepseek-r1: $0.55/1M input, $2.19/1M output
      // (50000/1M * 0.55 + 10000/1M * 2.19) * 100 = (0.0275 + 0.0219) * 100 = 4.94 cents
      // Rounded = 5
      expect(cost).toBe(5);
    });
  });

  // =========================================================================
  // calculateCost Tests - Qwen Models
  // =========================================================================
  describe('calculateCost - Qwen Models', () => {
    it('should calculate cost for qwen-flash (ultra cheap)', () => {
      const cost = LLMCostCalculator.calculateCost('qwen', 'qwen-flash', {
        promptTokens: 500000,
        completionTokens: 100000,
        totalTokens: 600000,
      });

      // qwen-flash: $0.05/1M input, $0.15/1M output
      // (500000/1M * 0.05 + 100000/1M * 0.15) * 100 = (0.025 + 0.015) * 100 = 4 cents
      expect(cost).toBe(4);
    });

    it('should calculate cost for qwen-max', () => {
      const cost = LLMCostCalculator.calculateCost('qwen', 'qwen-max', {
        promptTokens: 10000,
        completionTokens: 5000,
        totalTokens: 15000,
      });

      // qwen-max: $1.2/1M input, $6.0/1M output
      // (10000/1M * 1.2 + 5000/1M * 6.0) * 100 = (0.012 + 0.03) * 100 = 4.2 cents
      // Rounded = 4
      expect(cost).toBe(4);
    });
  });

  // =========================================================================
  // Fallback Pricing Tests
  // =========================================================================
  describe('Fallback Pricing', () => {
    it('should use provider default for unknown model', () => {
      const cost = LLMCostCalculator.calculateCost('anthropic', 'claude-unknown-model', {
        promptTokens: 10000,
        completionTokens: 2000,
        totalTokens: 12000,
      });

      // anthropic default: $3.0/1M input, $15.0/1M output
      // (10000/1M * 3.0 + 2000/1M * 15.0) * 100 = (0.03 + 0.03) * 100 = 6 cents
      expect(cost).toBe(6);
    });

    it('should use ultimate fallback for unknown provider and model', () => {
      const cost = LLMCostCalculator.calculateCost('unknown-provider', 'unknown-model', {
        promptTokens: 10000,
        completionTokens: 2000,
        totalTokens: 12000,
      });

      // Fallback: $1.0/1M input, $4.0/1M output
      // (10000/1M * 1.0 + 2000/1M * 4.0) * 100 = (0.01 + 0.008) * 100 = 1.8 cents
      // Rounded = 2
      expect(cost).toBe(2);
    });

    it('should return 0 for ollama (local models)', () => {
      const cost = LLMCostCalculator.calculateCost('ollama', 'llama3', {
        promptTokens: 100000,
        completionTokens: 20000,
        totalTokens: 120000,
      });

      // ollama: $0.0/1M input, $0.0/1M output
      expect(cost).toBe(0);
    });
  });

  // =========================================================================
  // Input/Output Token Cost Separation Tests
  // =========================================================================
  describe('Input/Output Token Cost Separation', () => {
    it('should correctly separate input and output costs', () => {
      // Test with a model where input cost is much lower than output
      const costHighInput = LLMCostCalculator.calculateCost('anthropic', 'claude-opus-4-5', {
        promptTokens: 100000, // 100K input tokens
        completionTokens: 100, // 100 output tokens
        totalTokens: 100100,
      });

      const costHighOutput = LLMCostCalculator.calculateCost('anthropic', 'claude-opus-4-5', {
        promptTokens: 100, // 100 input tokens
        completionTokens: 100000, // 100K output tokens
        totalTokens: 100100,
      });

      // claude-opus-4-5: $5.0/1M input, $25.0/1M output
      // High input: (100000/1M * 5.0 + 100/1M * 25.0) * 100 = (0.5 + 0.0025) * 100 = 50.25
      // High output: (100/1M * 5.0 + 100000/1M * 25.0) * 100 = (0.0005 + 2.5) * 100 = 250.05

      expect(costHighInput).toBe(50);
      expect(costHighOutput).toBe(250);

      // Output-heavy requests should cost more
      expect(costHighOutput).toBeGreaterThan(costHighInput);
    });

    it('should handle zero completion tokens', () => {
      const cost = LLMCostCalculator.calculateCost('openai', 'gpt-5', {
        promptTokens: 10000,
        completionTokens: 0,
        totalTokens: 10000,
      });

      // gpt-5: $1.25/1M input, $10.0/1M output
      // (10000/1M * 1.25 + 0) * 100 = 0.0125 * 100 = 1.25 cents
      // Rounded = 1
      expect(cost).toBe(1);
    });

    it('should handle zero prompt tokens', () => {
      const cost = LLMCostCalculator.calculateCost('openai', 'gpt-5', {
        promptTokens: 0,
        completionTokens: 10000,
        totalTokens: 10000,
      });

      // gpt-5: $1.25/1M input, $10.0/1M output
      // (0 + 10000/1M * 10.0) * 100 = 0.1 * 100 = 10 cents
      expect(cost).toBe(10);
    });
  });

  // =========================================================================
  // estimateCost Tests
  // =========================================================================
  describe('estimateCost', () => {
    it('should estimate cost with default completion tokens', () => {
      const cost = LLMCostCalculator.estimateCost('anthropic', 'claude-sonnet-4-5', 5000);

      // Default completion tokens: 1000
      // (5000/1M * 3.0 + 1000/1M * 15.0) * 100 = (0.015 + 0.015) * 100 = 3 cents
      expect(cost).toBe(3);
    });

    it('should estimate cost with custom completion tokens', () => {
      const cost = LLMCostCalculator.estimateCost('anthropic', 'claude-sonnet-4-5', 5000, 5000);

      // (5000/1M * 3.0 + 5000/1M * 15.0) * 100 = (0.015 + 0.075) * 100 = 9 cents
      expect(cost).toBe(9);
    });

    it('should estimate cost for large context windows', () => {
      const cost = LLMCostCalculator.estimateCost(
        'anthropic',
        'claude-sonnet-4-5',
        100000, // 100K prompt
        4000,
      );

      // (100000/1M * 3.0 + 4000/1M * 15.0) * 100 = (0.3 + 0.06) * 100 = 36 cents
      expect(cost).toBe(36);
    });
  });

  // =========================================================================
  // getInputCostPerMtok Tests
  // =========================================================================
  describe('getInputCostPerMtok', () => {
    it('should return input cost for known model', () => {
      const cost = LLMCostCalculator.getInputCostPerMtok('anthropic', 'claude-sonnet-4-5');
      expect(cost).toBe(3.0);
    });

    it('should return provider default for unknown model', () => {
      const cost = LLMCostCalculator.getInputCostPerMtok('anthropic', 'claude-future');
      expect(cost).toBe(3.0); // Anthropic default
    });

    it('should return fallback for unknown provider', () => {
      const cost = LLMCostCalculator.getInputCostPerMtok('unknown', 'unknown');
      expect(cost).toBe(1.0); // Fallback
    });
  });

  // =========================================================================
  // getPricing Tests
  // =========================================================================
  describe('getPricing', () => {
    it('should return exact pricing for known model', () => {
      const pricing = LLMCostCalculator.getPricing('anthropic', 'claude-opus-4-5');
      expect(pricing.inputCostPer1MTokens).toBe(5.0);
      expect(pricing.outputCostPer1MTokens).toBe(25.0);
    });

    it('should return provider default for unknown model', () => {
      const pricing = LLMCostCalculator.getPricing('openai', 'gpt-future-model');
      expect(pricing.inputCostPer1MTokens).toBe(1.75); // OpenAI default (GPT-5.2)
      expect(pricing.outputCostPer1MTokens).toBe(14.0);
    });
  });

  // =========================================================================
  // addModelPricing Tests
  // =========================================================================
  describe('addModelPricing', () => {
    afterEach(() => {
      // Note: Since we're modifying a static object, these changes persist
      // In a real scenario, you might want to reset between tests
    });

    it('should add new model pricing at runtime', () => {
      LLMCostCalculator.addModelPricing('claude-5-ultimate', 10.0, 50.0);

      const pricing = LLMCostCalculator.getPricing('anthropic', 'claude-5-ultimate');
      expect(pricing.inputCostPer1MTokens).toBe(10.0);
      expect(pricing.outputCostPer1MTokens).toBe(50.0);
    });

    it('should override existing model pricing', () => {
      // Get original pricing
      const originalPricing = LLMCostCalculator.getPricing('anthropic', 'claude-opus-4-5');
      expect(originalPricing.inputCostPer1MTokens).toBe(5.0);

      // Override
      LLMCostCalculator.addModelPricing('claude-opus-4-5', 4.0, 20.0);

      const newPricing = LLMCostCalculator.getPricing('anthropic', 'claude-opus-4-5');
      expect(newPricing.inputCostPer1MTokens).toBe(4.0);
      expect(newPricing.outputCostPer1MTokens).toBe(20.0);

      // Reset to original for other tests
      LLMCostCalculator.addModelPricing('claude-opus-4-5', 5.0, 25.0);
    });
  });

  // =========================================================================
  // getAvailableModels Tests
  // =========================================================================
  describe('getAvailableModels', () => {
    it('should return array of model names', () => {
      const models = LLMCostCalculator.getAvailableModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    });

    it('should include major models', () => {
      const models = LLMCostCalculator.getAvailableModels();
      expect(models).toContain('claude-opus-4-5');
      expect(models).toContain('claude-sonnet-4-5');
      expect(models).toContain('gpt-5.2');
      expect(models).toContain('gemini-3-pro-preview');
      expect(models).toContain('deepseek-chat');
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================
  describe('Edge Cases', () => {
    it('should handle very small token counts', () => {
      const cost = LLMCostCalculator.calculateCost('anthropic', 'claude-sonnet-4-5', {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      });

      // Result should be 0 due to rounding (sub-cent amounts)
      expect(cost).toBe(0);
    });

    it('should handle very large token counts', () => {
      const cost = LLMCostCalculator.calculateCost('anthropic', 'claude-sonnet-4-5', {
        promptTokens: 10000000, // 10M tokens
        completionTokens: 1000000, // 1M tokens
        totalTokens: 11000000,
      });

      // (10M/1M * 3.0 + 1M/1M * 15.0) * 100 = (30 + 15) * 100 = 4500 cents = $45
      expect(cost).toBe(4500);
    });

    it('should round to nearest cent correctly', () => {
      // Test rounding down
      const costDown = LLMCostCalculator.calculateCost('openai', 'gpt-5', {
        promptTokens: 800,
        completionTokens: 100,
        totalTokens: 900,
      });

      // Test rounding up
      const costUp = LLMCostCalculator.calculateCost('openai', 'gpt-5', {
        promptTokens: 4000,
        completionTokens: 500,
        totalTokens: 4500,
      });

      // Both should be integers (cents)
      expect(Number.isInteger(costDown)).toBe(true);
      expect(Number.isInteger(costUp)).toBe(true);
    });
  });
});
