import { describe, it, expect } from 'vitest';
import {
  toCanonicalChatRequest,
  toCanonicalThinking,
  toCanonicalEffort,
  computeAnthropicCacheConfig,
} from './canonical-request';
import type { ProcessedRequest } from './request-processor';

type LlmRequest = ProcessedRequest['llmRequest'];

function makeProcessed(llmRequest: Partial<LlmRequest>): ProcessedRequest {
  return {
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
        { type: 'web_search_20260209', name: 'web_search', allowed_callers: ['direct'] },
      ],
    });

    const chatRequest = toCanonicalChatRequest(processed);

    expect(chatRequest.tools).toHaveLength(1);
    expect(chatRequest.tools?.[0]?.name).toBe('lookup');
    expect(chatRequest.rawVendorTools).toEqual([
      { type: 'web_search_20260209', name: 'web_search', allowed_callers: ['direct'] },
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
