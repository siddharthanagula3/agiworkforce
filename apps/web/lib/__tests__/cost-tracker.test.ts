import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { toOtelAttributes, inferGenAiSystem } from '../cost-tracker';

describe('inferGenAiSystem', () => {
  it.each([
    ['anthropic', 'anthropic'],
    ['openai', 'openai'],
    ['google', 'google_ai_studio'],
    ['xai', 'xai'],
    ['deepseek', 'deepseek'],
    ['perplexity', 'perplexity'],
    ['openrouter', 'openrouter'],
    ['ollama', 'ollama'],
    ['lmstudio', 'lmstudio'],
  ])('maps %s -> %s', (input, expected) => {
    expect(inferGenAiSystem(input)).toBe(expected);
  });

  it('returns lowercase raw provider for unknown providers', () => {
    expect(inferGenAiSystem('MyCustomProvider')).toBe('mycustomprovider');
  });
});

describe('toOtelAttributes', () => {
  it('includes standard GenAI semantic convention fields', () => {
    const attrs = toOtelAttributes('openai', 'fixture-inclusive-tiered-primary', {
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(attrs['gen_ai.system']).toBe('openai');
    expect(attrs['gen_ai.request.model']).toBe('fixture-inclusive-tiered-primary');
    expect(attrs['gen_ai.usage.input_tokens']).toBe(1000);
    expect(attrs['gen_ai.usage.output_tokens']).toBe(500);
  });

  it('includes cache_read attribute when cacheReadInputTokens is provided', () => {
    const attrs = toOtelAttributes('anthropic', 'fixture-anthropic-standard', {
      inputTokens: 2000,
      outputTokens: 300,
      cacheReadInputTokens: 800,
    });

    expect(attrs['gen_ai.usage.cache_read.input_tokens']).toBe(800);
  });

  it('omits cache_read attribute when cacheReadInputTokens is absent', () => {
    const attrs = toOtelAttributes('openai', 'fixture-inclusive-tiered-primary', {
      inputTokens: 100,
      outputTokens: 50,
    });

    expect(attrs['gen_ai.usage.cache_read.input_tokens']).toBeUndefined();
  });

  it('includes codex.usage.cache_creation_input_tokens when provided', () => {
    const attrs = toOtelAttributes('anthropic', 'fixture-anthropic-standard', {
      inputTokens: 2000,
      outputTokens: 300,
      cacheCreationInputTokens: 1200,
    });

    expect(attrs['codex.usage.cache_creation_input_tokens']).toBe(1200);
  });

  it('includes codex.usage.reasoning_output_tokens when provided', () => {
    const attrs = toOtelAttributes('openai', 'fixture-inclusive-tiered-primary', {
      inputTokens: 1000,
      outputTokens: 500,
      reasoningOutputTokens: 256,
    });

    expect(attrs['codex.usage.reasoning_output_tokens']).toBe(256);
  });

  it('omits codex.usage.reasoning_output_tokens when absent', () => {
    const attrs = toOtelAttributes('openai', 'fixture-inclusive-tiered-primary', {
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(attrs['codex.usage.reasoning_output_tokens']).toBeUndefined();
  });

  it('computes total_tokens as input + output + reasoning + cache_creation', () => {
    const attrs = toOtelAttributes('openai', 'fixture-inclusive-tiered-primary', {
      inputTokens: 1000,
      outputTokens: 500,
      reasoningOutputTokens: 200,
      cacheCreationInputTokens: 300,
    });

    expect(attrs['codex.usage.total_tokens']).toBe(2000);
  });

  it('total_tokens excludes cache_read (reads are not net-new tokens)', () => {
    const attrs = toOtelAttributes('anthropic', 'fixture-anthropic-standard', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 800, // not counted in total
    });

    expect(attrs['codex.usage.total_tokens']).toBe(1500);
  });

  it('uses inferGenAiSystem to map provider to gen_ai.system', () => {
    const attrs = toOtelAttributes('google', 'fixture-model', {
      inputTokens: 100,
      outputTokens: 50,
    });

    expect(attrs['gen_ai.system']).toBe('google_ai_studio');
  });

  describe('CPST vendor attributes', () => {
    it('emits no codex.usage CPST attribute when no CPST fields are supplied', () => {
      const attrs = toOtelAttributes('openai', 'fixture-inclusive-tiered-primary', {
        inputTokens: 100,
        outputTokens: 50,
      });

      expect('codex.usage.task_outcome' in attrs).toBe(false);
      expect('codex.usage.retries' in attrs).toBe(false);
      expect('codex.usage.fallback_used' in attrs).toBe(false);
      expect('codex.usage.verifier_result' in attrs).toBe(false);
      expect('codex.usage.route_plan_id' in attrs).toBe(false);
      expect('codex.usage.task_family' in attrs).toBe(false);
      expect('codex.usage.task_family_confidence' in attrs).toBe(false);
    });

    it('mirrors every populated CPST field into the codex.usage namespace', () => {
      const attrs = toOtelAttributes(
        'anthropic',
        'fixture-anthropic-standard',
        { inputTokens: 10, outputTokens: 5 },
        {
          taskOutcome: 'unknown',
          verifierResult: 'skipped',
          fallbackUsed: true,
          fallbackReason: 'managed_failover',
          retries: 2,
          routePlanId: 'interim:anthropic/messages:route-1:fallback_slot',
          taskFamily: 'coding',
          taskFamilyConfidence: 0.75,
        },
      );

      expect(attrs['codex.usage.task_outcome']).toBe('unknown');
      expect(attrs['codex.usage.verifier_result']).toBe('skipped');
      expect(attrs['codex.usage.fallback_used']).toBe(true);
      expect(attrs['codex.usage.fallback_reason']).toBe('managed_failover');
      expect(attrs['codex.usage.retries']).toBe(2);
      expect(attrs['codex.usage.route_plan_id']).toBe(
        'interim:anthropic/messages:route-1:fallback_slot',
      );
      expect(attrs['codex.usage.task_family']).toBe('coding');
      expect(attrs['codex.usage.task_family_confidence']).toBe(0.75);
    });

    it('keeps an absent CPST field absent instead of defaulting it', () => {
      const attrs = toOtelAttributes(
        'openai',
        'fixture-inclusive-tiered-primary',
        { inputTokens: 10, outputTokens: 5 },
        { taskOutcome: 'failure', verifierResult: 'skipped' },
      );

      expect(attrs['codex.usage.task_outcome']).toBe('failure');
      expect('codex.usage.retries' in attrs).toBe(false);
      expect('codex.usage.fallback_used' in attrs).toBe(false);
      expect('codex.usage.route_plan_id' in attrs).toBe(false);
      expect('codex.usage.task_family' in attrs).toBe(false);
    });

    it('emits fallback_used:false as a real false, not as an omission', () => {
      const attrs = toOtelAttributes(
        'openai',
        'fixture-inclusive-tiered-primary',
        { inputTokens: 10, outputTokens: 5 },
        { fallbackUsed: false, retries: 0 },
      );

      expect(attrs['codex.usage.fallback_used']).toBe(false);
      expect(attrs['codex.usage.retries']).toBe(0);
    });

    it('leaves the token attributes byte-identical whether or not CPST is passed', () => {
      const usage = { inputTokens: 1000, outputTokens: 500, cacheCreationInputTokens: 300 };
      const withoutCpst = toOtelAttributes('openai', 'fixture-inclusive-tiered-primary', usage);
      const withCpst = toOtelAttributes('openai', 'fixture-inclusive-tiered-primary', usage, {
        taskOutcome: 'unknown',
      });

      for (const key of Object.keys(withoutCpst)) {
        expect(withCpst[key]).toBe(withoutCpst[key]);
      }
      expect(Object.keys(withCpst)).toEqual([
        ...Object.keys(withoutCpst),
        'codex.usage.task_outcome',
      ]);
    });
  });
});
