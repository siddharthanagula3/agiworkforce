import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import type { OpenAICompletionsCompatDefaults } from '@agiworkforce/llm-normalize';
import { translateChatRequestToResponses } from '../translate-responses';

const compat: OpenAICompletionsCompatDefaults = {
  supportsStore: true,
  supportsDeveloperRole: true,
  supportsReasoningEffort: true,
  supportsUsageInStreaming: true,
  maxTokensField: 'max_completion_tokens',
  thinkingFormat: 'openai',
  visibleReasoningDetailTypes: [],
  supportsStrictMode: true,
};

const request: ChatRequest = {
  model: 'gpt-5.5',
  messages: [{ role: 'user', content: 'Hello' }],
};

describe('translateChatRequestToResponses', () => {
  it('omits store by default so Local/BYOK requests stay stateless', () => {
    const params = translateChatRequestToResponses(request, { compat });

    expect(params).not.toHaveProperty('store');
  });

  it('keeps explicit store false when callers disable server-side state', () => {
    const params = translateChatRequestToResponses(request, { compat, store: false });

    expect(params.store).toBe(false);
  });

  it('only enables store when callers explicitly opt in', () => {
    const params = translateChatRequestToResponses(request, { compat, store: true });

    expect(params.store).toBe(true);
  });
});
