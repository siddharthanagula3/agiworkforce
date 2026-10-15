import { afterEach, describe, expect, it } from 'vitest';
import { getModelMetadataById, getProviderDefaultModel } from '@agiworkforce/types';
import { useChatModelStore } from '@agiworkforce/unified-chat';

import { turnUsageFromStreamEnd } from '../TauriRuntime';

describe('turnUsageFromStreamEnd', () => {
  afterEach(() => {
    useChatModelStore.setState({ models: [] });
  });

  it('maps the Rust token usage and adds the catalog context window', () => {
    const modelId = getProviderDefaultModel('openai');
    if (!modelId) throw new Error('The catalog must expose a default OpenAI model');
    const catalogWindow = getModelMetadataById(modelId)?.contextWindow;

    const usage = turnUsageFromStreamEnd(
      {
        prompt_tokens: 1200,
        completion_tokens: 300,
        total_tokens: 1500,
        cache_read_input_tokens: 800,
      },
      modelId,
    );

    expect(usage).toEqual({
      inputTokens: 1200,
      outputTokens: 300,
      cacheReadTokens: 800,
      cacheWriteTokens: undefined,
      ...(catalogWindow === undefined ? {} : { contextWindow: catalogWindow }),
    });
  });

  it('uses the window a local runtime reported for a model the catalog does not know', () => {
    useChatModelStore.setState({
      models: [
        {
          id: 'fixture-local-model:latest',
          name: 'Fixture local model',
          provider: 'ollama',
          tier: 'standard',
          supportsThinking: false,
          supportsVision: false,
          supportsTools: true,
          contextWindow: 32_768,
          isLocal: true,
          isByok: false,
          metadataSource: 'runtime',
        },
      ],
    });

    const usage = turnUsageFromStreamEnd(
      { prompt_tokens: 100, completion_tokens: 20 },
      'fixture-local-model:latest',
    );

    expect(usage?.contextWindow).toBe(32_768);
  });

  it('never invents a context window or a usage record', () => {
    expect(turnUsageFromStreamEnd(null, 'fixture-unknown-model')).toBeUndefined();
    expect(
      turnUsageFromStreamEnd({ prompt_tokens: null, completion_tokens: null }, 'x'),
    ).toBeUndefined();
    expect(
      turnUsageFromStreamEnd({ prompt_tokens: 10, completion_tokens: 2 }, 'fixture-unknown-model'),
    ).toEqual({
      inputTokens: 10,
      outputTokens: 2,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    });
  });
});
