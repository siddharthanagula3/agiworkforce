import { describe, it, expect } from 'vitest';
import { translateChatRequest } from '@agiworkforce/providers-google';
import { translateChatRequest as translateAnthropicChatRequest } from '@agiworkforce/providers-anthropic';
import { listCanonicalModels, type ModelMetadata } from '@agiworkforce/types';
import {
  toCanonicalChatRequest,
  toCanonicalThinking,
  toCanonicalEffort,
  toCanonicalGoogleThinking,
  buildAnthropicChatRequest,
  buildGoogleChatRequest,
  computeAnthropicCacheConfig,
  resolveWebOpenAIReasoningEffort,
} from './canonical-request';
import type { ProcessedRequest } from './request-processor';

type LlmRequest = ProcessedRequest['llmRequest'];

function requireCatalogModel(predicate: (model: ModelMetadata) => boolean): ModelMetadata {
  const model = listCanonicalModels().find(predicate);
  if (!model) throw new Error('Canonical request test model fixture is missing');
  return model;
}

const ANTHROPIC_ADAPTIVE_MODEL = requireCatalogModel(
  (model) => model.provider === 'anthropic' && model.reasoning?.thinkingDefault === 'adaptive',
);
const DISTINCT_API_MODEL = requireCatalogModel(
  (model) => !!model.apiModelId && model.apiModelId !== model.id && model.modelType !== 'video',
);
const UNCHANGED_API_MODEL = requireCatalogModel(
  (model) => !model.apiModelId || model.apiModelId === model.id,
);
const OPENAI_MAX_EFFORT_MODEL = requireCatalogModel(
  (model) => model.provider === 'openai' && !!model.reasoning?.supportedEfforts?.includes('max'),
);
const OPENAI_NON_REASONING_MODEL = requireCatalogModel(
  (model) => model.provider === 'openai' && model.reasoning?.capable === false,
);
const GOOGLE_THINKING_LEVEL_MODEL = requireCatalogModel(
  (model) =>
    model.provider === 'google' &&
    model.reasoning?.request?.effortPath === 'thinkingConfig.thinkingLevel',
);
const GOOGLE_MINIMAL_THINKING_MODEL = requireCatalogModel(
  (model) =>
    model.provider === 'google' &&
    model.reasoning?.request?.effortPath === 'thinkingConfig.thinkingLevel' &&
    !!model.reasoning.supportedEfforts?.includes('minimal'),
);
const LEGACY_GOOGLE_BUDGET_FIXTURE = 'fixture-google-budget-model';

function makeProcessed(llmRequest: Partial<LlmRequest>, provider = 'anthropic'): ProcessedRequest {
  return {
    provider,
    llmRequest: {
      model: ANTHROPIC_ADAPTIVE_MODEL.id,
      messages: [],
      max_tokens: 1024,
      ...llmRequest,
    },
  } as ProcessedRequest;
}

describe('toCanonicalChatRequest', () => {
  it('converts plain system/user/assistant text messages', () => {
    const processed = makeProcessed({
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    });

    const chatRequest = toCanonicalChatRequest(processed);

    expect(chatRequest.model).toBe(
      ANTHROPIC_ADAPTIVE_MODEL.apiModelId ?? ANTHROPIC_ADAPTIVE_MODEL.id,
    );
    expect(chatRequest.system).toBe('You are helpful.');
    expect(chatRequest.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    ]);
  });

  it('carries multimodal_content through as wire content (image parts)', () => {
    const processed = makeProcessed({
      messages: [
        {
          role: 'user',
          content: 'describe this',
          multimodal_content: [
            { type: 'text', text: 'describe this' },
            { type: 'image_url', image_url: { url: 'https://example.com/cat.png' } },
          ],
        },
      ],
    });

    const chatRequest = toCanonicalChatRequest(processed);
    const userMsg = chatRequest.messages[0];
    expect(userMsg?.role).toBe('user');
    expect(Array.isArray(userMsg?.content)).toBe(true);
    const blocks = userMsg?.content as Array<{ type: string }>;
    expect(blocks.map((b) => b.type)).toEqual(['text', 'image']);
  });

  it('round-trips assistant tool_calls into tool_use blocks', () => {
    const processed = makeProcessed({
      messages: [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
            },
          ],
        },
        { role: 'tool', content: '72F sunny', tool_call_id: 'call_1' },
      ],
    });

    const chatRequest = toCanonicalChatRequest(processed);
    const assistantMsg = chatRequest.messages[0];
    expect(assistantMsg?.role).toBe('assistant');
    const blocks = assistantMsg?.content as Array<{ type: string; name?: string }>;
    expect(blocks.some((b) => b.type === 'tool_use' && b.name === 'get_weather')).toBe(true);

    const toolResultMsg = chatRequest.messages[1];
    expect(toolResultMsg?.role).toBe('user');
    const resultBlocks = toolResultMsg?.content as Array<{ type: string; toolUseId?: string }>;
    expect(resultBlocks[0]).toMatchObject({ type: 'tool_result', toolUseId: 'call_1' });
  });

  it('splits client function tools into tools and native tools into rawVendorTools', () => {
    const processed = makeProcessed({
      messages: [{ role: 'user', content: 'search for cats' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'lookup',
            description: 'look something up',
            parameters: { type: 'object' },
          },
        },
        {
          type: 'web_search_20260209',
          name: 'web_search',
          allowed_callers: ['direct'],
          max_uses: 3,
        },
      ],
    });

    const chatRequest = toCanonicalChatRequest(processed);

    expect(chatRequest.tools).toHaveLength(1);
    expect(chatRequest.tools?.[0]?.name).toBe('lookup');
    expect(chatRequest.rawVendorTools).toEqual([
      {
        type: 'web_search_20260209',
        name: 'web_search',
        allowed_callers: ['direct'],
        max_uses: 3,
      },
    ]);
  });

  it('omits tools/rawVendorTools entirely when there are none', () => {
    const processed = makeProcessed({ messages: [{ role: 'user', content: 'hi' }] });
    const chatRequest = toCanonicalChatRequest(processed);
    expect(chatRequest.tools).toBeUndefined();
    expect(chatRequest.rawVendorTools).toBeUndefined();
  });

  it('carries tool_choice through', () => {
    const processed = makeProcessed({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'lookup', parameters: {} } }],
      tool_choice: { type: 'function', function: { name: 'lookup' } },
    });
    const chatRequest = toCanonicalChatRequest(processed);
    expect(chatRequest.toolChoice).toEqual({ type: 'tool', name: 'lookup' });
  });

  it('maps max_tokens to maxOutputTokens and temperature through', () => {
    const processed = makeProcessed({
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 2048,
      temperature: 0.4,
    });
    const chatRequest = toCanonicalChatRequest(processed);
    expect(chatRequest.maxOutputTokens).toBe(2048);
    expect(chatRequest.temperature).toBe(0.4);
  });

  it('maps a canonical id to its distinct provider apiModelId', () => {
    const processed = makeProcessed(
      {
        model: DISTINCT_API_MODEL.id,
        messages: [{ role: 'user', content: 'hi' }],
      },
      DISTINCT_API_MODEL.provider,
    );
    const chatRequest = toCanonicalChatRequest(processed);
    expect(chatRequest.model).toBe(DISTINCT_API_MODEL.apiModelId);
  });

  it('passes through a model id unchanged when it has no distinct apiModelId', () => {
    const processed = makeProcessed(
      {
        model: UNCHANGED_API_MODEL.id,
        messages: [{ role: 'user', content: 'hi' }],
      },
      UNCHANGED_API_MODEL.provider,
    );
    const chatRequest = toCanonicalChatRequest(processed);
    expect(chatRequest.model).toBe(UNCHANGED_API_MODEL.id);
  });

  describe('zero data retention metadata', () => {
    it('hands the adapter the requirement when the workspace requires zero data retention', () => {
      const processed = {
        ...makeProcessed({ messages: [{ role: 'user', content: 'hi' }] }, 'openrouter'),
        zeroDataRetentionOnly: true,
      };

      const chatRequest = toCanonicalChatRequest(processed);

      expect(chatRequest.zeroDataRetentionOnly).toBe(true);
    });

    it('leaves the requirement off when the workspace does not require zero data retention', () => {
      const processed = {
        ...makeProcessed({ messages: [{ role: 'user', content: 'hi' }] }, 'openrouter'),
        zeroDataRetentionOnly: false,
      };

      const chatRequest = toCanonicalChatRequest(processed);

      expect(chatRequest.zeroDataRetentionOnly).toBeUndefined();
      expect(chatRequest.metadata).toBeUndefined();
    });

    it('carries the requirement whatever the provider, so each adapter answers for itself', () => {
      const processed = {
        ...makeProcessed({ messages: [{ role: 'user', content: 'hi' }] }, 'anthropic'),
        zeroDataRetentionOnly: true,
      };

      const chatRequest = toCanonicalChatRequest(processed);

      expect(chatRequest.zeroDataRetentionOnly).toBe(true);
      expect(chatRequest.metadata).toBeUndefined();
    });
  });
});

describe('toCanonicalThinking', () => {
  it('returns undefined for non-anthropic providers', () => {
    expect(
      toCanonicalThinking('openai', { type: 'enabled', budget_tokens: 16384 }),
    ).toBeUndefined();
  });

  it('returns undefined when no thinking was resolved', () => {
    expect(toCanonicalThinking('anthropic', undefined)).toBeUndefined();
  });

  it('maps enabled thinking with a budget', () => {
    expect(toCanonicalThinking('anthropic', { type: 'enabled', budget_tokens: 16384 })).toEqual({
      type: 'enabled',
      budgetTokens: 16384,
    });
  });

  it('maps disabled thinking', () => {
    expect(toCanonicalThinking('anthropic', { type: 'disabled' })).toEqual({ type: 'disabled' });
  });

  it('maps adaptive thinking straight through', () => {
    expect(toCanonicalThinking('anthropic', { type: 'adaptive' })).toEqual({ type: 'adaptive' });
  });
});

describe('toCanonicalEffort', () => {
  it('returns undefined for non-anthropic providers', () => {
    expect(toCanonicalEffort('openai', 'high')).toBeUndefined();
    expect(toCanonicalEffort('google', 'high')).toBeUndefined();
  });

  it('returns undefined when no effort was resolved', () => {
    expect(toCanonicalEffort('anthropic', undefined)).toBeUndefined();
  });

  it('passes an anthropic effort tier through unchanged', () => {
    expect(toCanonicalEffort('anthropic', 'xhigh')).toBe('xhigh');
  });
});

describe('buildAnthropicChatRequest -> translateChatRequest wire', () => {
  it('emits catalog-declared adaptive thinking and suppresses forbidden sampling parameters', () => {
    const processed = makeProcessed({
      model: ANTHROPIC_ADAPTIVE_MODEL.id,
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.4,
      thinking: { type: 'adaptive' },
      effort: 'max',
    });

    const chatRequest = buildAnthropicChatRequest(processed);
    const body = translateAnthropicChatRequest(chatRequest);

    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.output_config).toEqual({ effort: 'max' });
    expect(body.temperature).toBeUndefined();
    expect(body.top_p).toBeUndefined();
    expect(body.top_k).toBeUndefined();
  });
});

describe('resolveWebOpenAIReasoningEffort', () => {
  it('passes max through only when the canonical model metadata supports it', () => {
    expect(resolveWebOpenAIReasoningEffort('openai', 'max', OPENAI_MAX_EFFORT_MODEL.id)).toBe(
      'max',
    );
    expect(
      resolveWebOpenAIReasoningEffort('openai', 'max', OPENAI_NON_REASONING_MODEL.id),
    ).toBeUndefined();
  });
});

describe('toCanonicalGoogleThinking', () => {
  it('returns undefined for non-google providers', () => {
    expect(toCanonicalGoogleThinking('anthropic', 'high')).toBeUndefined();
  });

  it('returns undefined when no effort was resolved', () => {
    expect(toCanonicalGoogleThinking('google', undefined)).toBeUndefined();
  });

  it('maps low/medium/high to the fixed legacy GOOGLE_THINKING_BUDGET values, with includeThoughts explicitly suppressed', () => {
    expect(toCanonicalGoogleThinking('google', 'low')).toEqual({
      type: 'enabled',
      budgetTokens: 1024,
      includeThoughts: false,
    });
    expect(toCanonicalGoogleThinking('google', 'medium')).toEqual({
      type: 'enabled',
      budgetTokens: 8192,
      includeThoughts: false,
    });
    expect(toCanonicalGoogleThinking('google', 'high')).toEqual({
      type: 'enabled',
      budgetTokens: 24576,
      includeThoughts: false,
    });
  });

  it('returns undefined for xhigh/max (legacy google.ts never mapped those tiers either)', () => {
    expect(toCanonicalGoogleThinking('google', 'xhigh')).toBeUndefined();
    expect(toCanonicalGoogleThinking('google', 'max')).toBeUndefined();
  });

  it('does not infer a thinking-level wire contract from an unregistered model id', () => {
    expect(toCanonicalGoogleThinking('google', 'high', 'fixture-unregistered-model')).toEqual({
      type: 'enabled',
      budgetTokens: 24576,
      includeThoughts: false,
    });
  });
});

describe('buildGoogleChatRequest -> translateChatRequest wire', () => {
  it('sends thinkingBudget only, with NO includeThoughts key, for an effort-tier request (byte-matches legacy, which only ever sent thinkingBudget)', () => {
    const processed = makeProcessed(
      {
        model: LEGACY_GOOGLE_BUDGET_FIXTURE,
        messages: [{ role: 'user', content: 'hi' }],
        effort: 'high',
      },
      'google',
    );

    const chatRequest = buildGoogleChatRequest(processed);
    expect(chatRequest.thinking).toEqual({
      type: 'enabled',
      budgetTokens: 24576,
      includeThoughts: false,
    });

    const geminiBody = translateChatRequest(chatRequest);
    expect(geminiBody.generationConfig?.thinkingConfig).toEqual({ thinkingBudget: 24576 });
    expect(geminiBody.generationConfig?.thinkingConfig).not.toHaveProperty('includeThoughts');
  });

  it('omits thinkingConfig entirely when no effort is set (no gratuitous includeThoughts for a plain request)', () => {
    const processed = makeProcessed(
      {
        model: GOOGLE_THINKING_LEVEL_MODEL.id,
        messages: [{ role: 'user', content: 'hi' }],
      },
      'google',
    );

    const chatRequest = buildGoogleChatRequest(processed);
    expect(chatRequest.thinking).toBeUndefined();

    const geminiBody = translateChatRequest(chatRequest);
    expect(geminiBody.generationConfig?.thinkingConfig).toBeUndefined();
  });

  it('sends thinkingConfig.thinkingLevel when the catalog declares that wire contract', () => {
    const processed = makeProcessed(
      {
        model: GOOGLE_THINKING_LEVEL_MODEL.id,
        messages: [{ role: 'user', content: 'hi' }],
        effort: 'high',
      },
      'google',
    );

    const chatRequest = buildGoogleChatRequest(processed);
    expect(chatRequest.thinking).toEqual({
      type: 'enabled',
      thinkingLevel: 'high',
      includeThoughts: false,
    });

    const geminiBody = translateChatRequest(chatRequest);
    expect(geminiBody.generationConfig?.thinkingConfig).toEqual({ thinkingLevel: 'high' });
    expect(geminiBody.generationConfig?.thinkingConfig).not.toHaveProperty('thinkingBudget');
    expect(geminiBody.generationConfig?.thinkingConfig).not.toHaveProperty('includeThoughts');
  });

  it('sends minimal as the exact thinking level when the catalog model supports it', () => {
    const processed = makeProcessed(
      {
        model: GOOGLE_MINIMAL_THINKING_MODEL.id,
        messages: [{ role: 'user', content: 'hi' }],
        effort: 'minimal',
      },
      'google',
    );

    const chatRequest = buildGoogleChatRequest(processed);
    expect(chatRequest.thinking).toEqual({
      type: 'enabled',
      thinkingLevel: 'minimal',
      includeThoughts: false,
    });
    expect(translateChatRequest(chatRequest).generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: 'minimal',
    });
  });
});

describe('computeAnthropicCacheConfig', () => {
  it('disables cache control when usePromptCache is falsy', () => {
    const processed = makeProcessed({ messages: [], usePromptCache: false });
    expect(computeAnthropicCacheConfig(processed)).toEqual({
      enableCacheControl: false,
      cacheRetention: 'none',
    });
  });

  it('disables cache control when usePromptCache is undefined', () => {
    const processed = makeProcessed({ messages: [] });
    expect(computeAnthropicCacheConfig(processed)).toEqual({
      enableCacheControl: false,
      cacheRetention: 'none',
    });
  });

  it('uses short retention when caching is on and there are no tools', () => {
    const processed = makeProcessed({ messages: [], usePromptCache: true });
    expect(computeAnthropicCacheConfig(processed)).toEqual({
      enableCacheControl: true,
      cacheRetention: 'short',
    });
  });

  it('upgrades to long retention when caching is on and tools are present', () => {
    const processed = makeProcessed({
      messages: [],
      usePromptCache: true,
      tools: [{ type: 'function', function: { name: 'lookup', parameters: {} } }],
    });
    expect(computeAnthropicCacheConfig(processed)).toEqual({
      enableCacheControl: true,
      cacheRetention: 'long',
    });
  });

  it('upgrades to long retention even for an explicit empty tools array (matches old truthiness quirk)', () => {
    const processed = makeProcessed({ messages: [], usePromptCache: true, tools: [] });
    expect(computeAnthropicCacheConfig(processed)).toEqual({
      enableCacheControl: true,
      cacheRetention: 'long',
    });
  });
});
