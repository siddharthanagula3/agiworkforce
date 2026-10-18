import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { detectOpenAICompletionsCompat } from '@agiworkforce/provider-protocol';

import type { OpenAIAdapterConfig } from '../index';
import { chatCompletionsOnlyParameters, shouldUseOpenAIResponsesApi } from '../index';
import { OPENAI_DEFAULT_MODEL_ID, OPENAI_NON_TEXT_MODEL_IDS } from './model-fixtures';

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
    id: OPENAI_DEFAULT_MODEL_ID,
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
    expect(shouldUseResponses(OPENAI_DEFAULT_MODEL_ID)).toBe(true);
  });

  it('treats api.openai.com as a native Responses-capable route', () => {
    expect(shouldUseResponses(OPENAI_DEFAULT_MODEL_ID, {}, 'https://api.openai.com/v1')).toBe(true);
  });

  it('keeps the explicit Chat Completions opt-out', () => {
    expect(shouldUseResponses(OPENAI_DEFAULT_MODEL_ID, { useResponsesApi: false })).toBe(false);
  });

  it('keeps OpenAI-compatible proxy endpoints on Chat Completions', () => {
    expect(shouldUseResponses(OPENAI_DEFAULT_MODEL_ID, {}, 'https://openrouter.ai/api/v1')).toBe(
      false,
    );
    expect(shouldUseResponses(OPENAI_DEFAULT_MODEL_ID, {}, 'http://localhost:1234/v1')).toBe(false);
  });

  it('keeps unknown models on Chat Completions until catalog metadata proves support', () => {
    expect(shouldUseResponses('fixture-future-openai-chat-model')).toBe(false);
  });

  it('keeps non-chat media and audio models off the chat Responses path', () => {
    for (const modelId of OPENAI_NON_TEXT_MODEL_IDS) {
      expect(shouldUseResponses(modelId), modelId).toBe(false);
    }
  });

  it('sends a request with stop sequences to Chat Completions, which has the field', () => {
    const req: ChatRequest = { ...request(OPENAI_DEFAULT_MODEL_ID), stopSequences: ['END'] };
    expect(shouldUseOpenAIResponsesApi(req, {}, detected())).toBe(false);
  });

  it('keeps a request carrying hosted tools on Responses even with stop sequences', () => {
    const req: ChatRequest = {
      ...request(OPENAI_DEFAULT_MODEL_ID),
      stopSequences: ['END'],
      rawVendorTools: [{ type: 'web_search' }],
    };
    expect(shouldUseOpenAIResponsesApi(req, {}, detected())).toBe(true);
  });

  it('names every parameter Responses cannot carry', () => {
    expect(
      chatCompletionsOnlyParameters({
        ...request(OPENAI_DEFAULT_MODEL_ID),
        stopSequences: ['END'],
        seed: 7,
        frequencyPenalty: 0.1,
        presencePenalty: 0.2,
        logitBias: { '50256': -100 },
      }),
    ).toEqual(['stop', 'seed', 'frequency_penalty', 'presence_penalty', 'logit_bias']);
    expect(chatCompletionsOnlyParameters(request(OPENAI_DEFAULT_MODEL_ID))).toEqual([]);
  });
});
