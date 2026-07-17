import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { detectOpenAICompletionsCompat } from '@agiworkforce/provider-protocol';

import type { OpenAIAdapterConfig } from '../index';
import { shouldUseOpenAIResponsesApi } from '../index';

function request(model: string): ChatRequest {
  return {
    model,
    messages: [{ role: 'user', content: 'Hello' }],
  };
}

function detected(baseUrl?: string) {
  return detectOpenAICompletionsCompat({
    provider: 'openai',
    ...(baseUrl ? { baseUrl } : {}),
    id: 'gpt-5.5',
  });
}

function shouldUseResponses(
  model: string,
  config: OpenAIAdapterConfig = {},
  baseUrl?: string,
): boolean {
  return shouldUseOpenAIResponsesApi(request(model), config, detected(baseUrl));
}

describe('shouldUseOpenAIResponsesApi', () => {
  it('defaults catalog-known OpenAI chat models to Responses on the native SDK route', () => {
    expect(shouldUseResponses('gpt-5.5')).toBe(true);
  });

  it('treats api.openai.com as a native Responses-capable route', () => {
    expect(shouldUseResponses('gpt-5.5', {}, 'https://api.openai.com/v1')).toBe(true);
  });

  it('keeps the explicit Chat Completions opt-out', () => {
    expect(shouldUseResponses('gpt-5.5', { useResponsesApi: false })).toBe(false);
  });

  it('keeps OpenAI-compatible proxy endpoints on Chat Completions', () => {
    expect(shouldUseResponses('gpt-5.5', {}, 'https://openrouter.ai/api/v1')).toBe(false);
    expect(shouldUseResponses('gpt-5.5', {}, 'http://localhost:1234/v1')).toBe(false);
  });

  it('keeps unknown models on Chat Completions until catalog metadata proves support', () => {
    expect(shouldUseResponses('future-openai-chat-model')).toBe(false);
  });

  it('keeps non-chat media and audio models off the chat Responses path', () => {
    expect(shouldUseResponses('gpt-image-1')).toBe(false);
    expect(shouldUseResponses('gpt-image-2')).toBe(false);
    expect(shouldUseResponses('tts-1')).toBe(false);
    expect(shouldUseResponses('whisper-1')).toBe(false);
  });
});
