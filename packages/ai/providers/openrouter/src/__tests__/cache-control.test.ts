import { describe, expect, it } from 'vitest';
import {
  detectOpenAICompletionsCompat,
  SYSTEM_PROMPT_CACHE_BOUNDARY,
} from '@agiworkforce/provider-protocol';
import {
  translateChatRequest,
  type OpenAIChatCompletionCreateParams,
} from '@agiworkforce/providers-openai';
import type { ChatRequest } from '@agiworkforce/types';

import { applyOpenRouterAnthropicCacheControl } from '../cache-control';

function buildRequest(model: string, system: string): ChatRequest {
  return {
    model,
    system,
    messages: [{ role: 'user', content: 'hi' }],
  };
}

function buildParams(
  model: string,
  system = 'You are a helpful assistant.',
): OpenAIChatCompletionCreateParams {
  const detected = detectOpenAICompletionsCompat({
    provider: 'open_router',
    baseUrl: 'https://openrouter.ai/api/v1',
    id: model,
  });
  return translateChatRequest(buildRequest(model, system), {
    compat: detected.defaults,
    provider: 'open_router',
  });
}

describe('applyOpenRouterAnthropicCacheControl', () => {
  it('wraps the system message in a cache_control block for anthropic/* routes (default short/5m)', () => {
    const params = buildParams('anthropic/example-model');
    applyOpenRouterAnthropicCacheControl(params, 'short');
    const system = params.messages.find((m) => m.role === 'system' || m.role === 'developer');
    expect(system).toBeDefined();
    const content = (system as unknown as { content: unknown }).content;
    expect(content).toEqual([
      { type: 'text', text: 'You are a helpful assistant.', cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('uses ttl: "1h" for long retention', () => {
    const params = buildParams('anthropic/example-model');
    applyOpenRouterAnthropicCacheControl(params, 'long');
    const system = params.messages.find((m) => m.role === 'system' || m.role === 'developer');
    const content = (system as unknown as { content: unknown }).content as Array<{
      cache_control: { type: string; ttl?: string };
    }>;
    expect(content[0]?.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
  });

  it('does not mutate the system message when retention is "none"', () => {
    const params = buildParams('anthropic/example-model');
    const before = JSON.stringify(params.messages);
    applyOpenRouterAnthropicCacheControl(params, 'none');
    expect(JSON.stringify(params.messages)).toBe(before);
  });

  it('does not mutate routes outside anthropic/* and google/* (e.g. nvidia/*)', () => {
    const params = buildParams('fixture-provider/fixture-model');
    const before = JSON.stringify(params.messages);
    applyOpenRouterAnthropicCacheControl(params, 'short');
    expect(JSON.stringify(params.messages)).toBe(before);
  });

  it('wraps the system message in a cache_control block for google/* routes (OpenRouter documents Gemini cache_control passthrough)', () => {
    const params = buildParams('google/example-model');
    applyOpenRouterAnthropicCacheControl(params, 'short');
    const system = params.messages.find((m) => m.role === 'system' || m.role === 'developer');
    const content = (system as unknown as { content: unknown }).content;
    expect(content).toEqual([
      { type: 'text', text: 'You are a helpful assistant.', cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('is a no-op when there is no system message', () => {
    const params: OpenAIChatCompletionCreateParams = {
      model: 'anthropic/example-model',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    };
    expect(() => applyOpenRouterAnthropicCacheControl(params, 'short')).not.toThrow();
    expect(params.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('caches only the stable prefix when the system prompt carries a boundary marker', () => {
    const req = buildRequest(
      'anthropic/example-model',
      `You are a helpful assistant.${SYSTEM_PROMPT_CACHE_BOUNDARY}Today is Tuesday.`,
    );
    const params = buildParams(req.model, req.system as string);
    applyOpenRouterAnthropicCacheControl(params, 'short', req);
    const system = params.messages.find((m) => m.role === 'system' || m.role === 'developer');
    const content = (system as unknown as { content: unknown }).content;
    expect(content).toEqual([
      { type: 'text', text: 'You are a helpful assistant.', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'Today is Tuesday.' },
    ]);
  });

  it('omits an empty dynamic suffix when the boundary trails the system prompt', () => {
    const req = buildRequest(
      'google/example-model',
      `You are a helpful assistant.${SYSTEM_PROMPT_CACHE_BOUNDARY}`,
    );
    const params = buildParams(req.model, req.system as string);
    applyOpenRouterAnthropicCacheControl(params, 'short', req);
    const system = params.messages.find((m) => m.role === 'system' || m.role === 'developer');
    const content = (system as unknown as { content: unknown }).content;
    expect(content).toEqual([
      { type: 'text', text: 'You are a helpful assistant.', cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('keeps the single-block behaviour when the request system prompt carries no boundary marker', () => {
    const req = buildRequest('anthropic/example-model', 'You are a helpful assistant.');
    const params = buildParams(req.model, req.system as string);
    applyOpenRouterAnthropicCacheControl(params, 'short', req);
    const system = params.messages.find((m) => m.role === 'system' || m.role === 'developer');
    const content = (system as unknown as { content: unknown }).content;
    expect(content).toEqual([
      { type: 'text', text: 'You are a helpful assistant.', cache_control: { type: 'ephemeral' } },
    ]);
  });
});
