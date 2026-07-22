import { describe, it, expect } from 'vitest';
import { translateChatRequest } from '@agiworkforce/providers-google';
import {
  toCanonicalChatRequest,
  toCanonicalThinking,
  toCanonicalEffort,
  toCanonicalGoogleThinking,
  buildGoogleChatRequest,
  computeAnthropicCacheConfig,
  resolveWebOpenAIReasoningEffort,
} from './canonical-request';
import type { ProcessedRequest } from './request-processor';

type LlmRequest = ProcessedRequest['llmRequest'];

function makeProcessed(llmRequest: Partial<LlmRequest>, provider = 'anthropic'): ProcessedRequest {
  return {
    provider,
    llmRequest: {
      model: 'claude-opus-4-8',
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

    expect(chatRequest.model).toBe('claude-opus-4-8');
    expect(chatRequest.system).toBe('You are helpful.');
    expect(chatRequest.messages).toEqual([
      { role: 'user', content: 'hi' },
      // openAIWireRequestToChatRequest always block-wraps assistant text
      // (only `user` content stays a plain string) -- see its role==='assistant'
      // branch: a text block is pushed whenever text is truthy, independent of
      // tool_calls, so `blocks.length > 0` is always true here.
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

  it('maps the internal dot-form model id to its provider apiModelId (fails without the mapping)', () => {
    const processed = makeProcessed({
      model: 'claude-opus-4.8',
      messages: [{ role: 'user', content: 'hi' }],
    });
    const chatRequest = toCanonicalChatRequest(processed);
    // LLMProviderFactory.mapModelIdToApiId did this on a local copy right
    // before the provider HTTP call (factory.ts:310-321) -- toCanonicalChatRequest
    // sits at that same point, so `claude-opus-4.8` (the internal/catalog id
    // request-processor.ts routes on) must become `claude-opus-4-8` (what
    // Anthropic's API actually accepts) here. Every existing fixture in this
    // file uses a model id that's already dash-form, so none of them would
    // catch a regression that dropped this mapping -- this test's input is
    // deliberately dot-form.
    expect(chatRequest.model).toBe('claude-opus-4-8');
  });

  it('passes through a model id unchanged when it has no distinct apiModelId', () => {
    const processed = makeProcessed({
      model: 'claude-opus-4-8',
      messages: [{ role: 'user', content: 'hi' }],
    });
    const chatRequest = toCanonicalChatRequest(processed);
    expect(chatRequest.model).toBe('claude-opus-4-8');
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

describe('resolveWebOpenAIReasoningEffort', () => {
  it('passes max through only when the canonical model metadata supports it', () => {
    expect(resolveWebOpenAIReasoningEffort('openai', 'max', 'gpt-5.6-sol')).toBe('max');
    // gpt-image-2 is a live catalog OpenAI model with no reasoning-effort support.
    expect(resolveWebOpenAIReasoningEffort('openai', 'max', 'gpt-image-2')).toBeUndefined();
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
    // includeThoughts:false is load-bearing here, not incidental -- it's
    // what makes translateChatRequest omit the includeThoughts key entirely
    // (see the 'buildGoogleChatRequest -> translateChatRequest wire' suite
    // below), holding byte-stability with legacy google.ts, which never sent
    // that key.
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

  it('does not infer a thinking-level wire contract from an unregistered model family name', () => {
    expect(toCanonicalGoogleThinking('google', 'high', 'gemini-3-unregistered')).toEqual({
      type: 'enabled',
      budgetTokens: 24576,
      includeThoughts: false,
    });
  });
});

describe('buildGoogleChatRequest -> translateChatRequest wire', () => {
  // Drives the REAL packages/ai/providers/google translateChatRequest, not just
  // the canonical ChatRequest this file produces -- the request-direction gap
  // this pins (includeThoughts defaulting to true in translateChatRequest,
  // which legacy google.ts never sent) only shows up at the actual Gemini
  // wire body, one layer past ChatRequest.thinking itself. If either
  // toCanonicalGoogleThinking's includeThoughts:false or translate.ts's
  // includeThoughts handling ever regresses, this fails.
  it('sends thinkingBudget only, with NO includeThoughts key, for an effort-tier request (byte-matches legacy, which only ever sent thinkingBudget)', () => {
    const processed = makeProcessed(
      {
        model: 'gemini-2.5-pro',
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
        model: 'gemini-2.5-pro',
        messages: [{ role: 'user', content: 'hi' }],
      },
      'google',
    );

    const chatRequest = buildGoogleChatRequest(processed);
    expect(chatRequest.thinking).toBeUndefined();

    const geminiBody = translateChatRequest(chatRequest);
    expect(geminiBody.generationConfig?.thinkingConfig).toBeUndefined();
  });

  // Reasoning-effort-capability wave (2026-07-10, flag 4): Gemini 3.x migrates to
  // the discrete `thinkingLevel` control. Legacy 2.5 stays on `thinkingBudget`
  // (the byte-stability test above), so the migration is gated on a 3.x id.
  it('sends thinkingConfig.thinkingLevel (NOT thinkingBudget) for a Gemini 3.x model', () => {
    const processed = makeProcessed(
      {
        model: 'gemini-3.6-flash',
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
