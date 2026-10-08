import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { detectOpenAICompletionsCompat } from '@agiworkforce/provider-protocol';
import { translateChatRequest } from '../translate';
import { translateChatRequestToResponses } from '../translate-responses';
import {
  OPENAI_ALWAYS_REASONING_MODEL_ID,
  OPENAI_OPTIONAL_REASONING_MODEL_ID,
  OPENAI_SAMPLING_ACCEPTING_MODEL_ID,
} from './model-fixtures';

function compatFor(model: string) {
  return detectOpenAICompletionsCompat({
    id: model,
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
  }).defaults;
}

function sampled(model: string, overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    model,
    messages: [{ role: 'user', content: 'hi' }],
    temperature: 0.2,
    topP: 0.9,
    ...overrides,
  };
}

function responses(model: string, overrides: Partial<ChatRequest> = {}) {
  return translateChatRequestToResponses(sampled(model, overrides), { compat: compatFor(model) });
}

function chat(model: string, overrides: Partial<ChatRequest> = {}, provider = 'openai') {
  return translateChatRequest(sampled(model, overrides), { compat: compatFor(model), provider });
}

describe('sampling parameters on a model the catalog says rejects them', () => {
  it('never reach a model whose reasoning cannot be turned off', () => {
    for (const overrides of [{}, { effort: 'high' as const }, { effort: 'none' as const }]) {
      const viaResponses = responses(OPENAI_ALWAYS_REASONING_MODEL_ID!, overrides);
      expect(viaResponses.temperature).toBeUndefined();
      expect(viaResponses.top_p).toBeUndefined();
      expect(viaResponses.reasoning?.effort).not.toBe('none');
      const viaChat = chat(OPENAI_ALWAYS_REASONING_MODEL_ID!, overrides);
      expect(viaChat.temperature).toBeUndefined();
      expect(viaChat.top_p).toBeUndefined();
      expect(viaChat.reasoning_effort).not.toBe('none');
    }
  });

  it('are sent only while the request turns reasoning off', () => {
    const off = responses(OPENAI_OPTIONAL_REASONING_MODEL_ID!, { effort: 'none' });
    expect(off.reasoning?.effort).toBe('none');
    expect(off.temperature).toBe(0.2);
    expect(off.top_p).toBe(0.9);

    const on = responses(OPENAI_OPTIONAL_REASONING_MODEL_ID!, { effort: 'high' });
    expect(on.temperature).toBeUndefined();
    expect(on.top_p).toBeUndefined();

    const providerDefault = responses(OPENAI_OPTIONAL_REASONING_MODEL_ID!);
    expect(providerDefault.reasoning?.effort).not.toBe('none');
    expect(providerDefault.temperature).toBeUndefined();

    const chatOff = chat(OPENAI_OPTIONAL_REASONING_MODEL_ID!, { effort: 'none' });
    expect(chatOff.reasoning_effort).toBe('none');
    expect(chatOff.temperature).toBe(0.2);
    expect(chat(OPENAI_OPTIONAL_REASONING_MODEL_ID!).temperature).toBeUndefined();
  });

  it('still reach a model that accepts them, and any model behind a compatible provider', () => {
    const accepted = responses(OPENAI_SAMPLING_ACCEPTING_MODEL_ID!, { effort: 'high' });
    expect(accepted.temperature).toBe(0.2);
    expect(accepted.top_p).toBe(0.9);
    expect(chat(OPENAI_SAMPLING_ACCEPTING_MODEL_ID!).temperature).toBe(0.2);
    expect(chat(OPENAI_ALWAYS_REASONING_MODEL_ID!, {}, 'openrouter').temperature).toBe(0.2);
  });
});
