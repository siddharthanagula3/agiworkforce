import { describe, expect, it } from 'vitest';
import { detectOpenAICompletionsCompat } from '@agiworkforce/provider-protocol';
import {
  translateChatRequest,
  type OpenAIChatCompletionCreateParams,
} from '@agiworkforce/providers-openai';

import { applyOpenRouterAnthropicCacheControl } from '../cache-control';

function buildParams(model: string): OpenAIChatCompletionCreateParams {
  const detected = detectOpenAICompletionsCompat({
    provider: 'open_router',
    baseUrl: 'https://openrouter.ai/api/v1',
    id: model,
  });
  return translateChatRequest(
    {
      model,
      system: 'You are a helpful assistant.',
      messages: [{ role: 'user', content: 'hi' }],
    },
    { compat: detected.defaults, provider: 'open_router' },
  );
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

  it('does not mutate non-anthropic routes (e.g. nvidia/*)', () => {
    const params = buildParams('nvidia/nemotron-3-super-120b-a12b:free');
    const before = JSON.stringify(params.messages);
    applyOpenRouterAnthropicCacheControl(params, 'short');
    expect(JSON.stringify(params.messages)).toBe(before);
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
});
