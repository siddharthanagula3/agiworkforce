import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import type { OpenAICompletionsCompatDefaults } from '@agiworkforce/llm-normalize';
import { translateChatRequest } from '../translate';
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

  it('maps high thinking budgets to OpenAI xhigh on supported Responses models', () => {
    const params = translateChatRequestToResponses(
      {
        ...request,
        model: 'gpt-5.5',
        thinking: { type: 'enabled', budgetTokens: 32000 },
      },
      { compat },
    );

    expect(params.reasoning?.effort).toBe('xhigh');
  });

  it('downgrades xhigh budgets to high when the OpenAI model does not support xhigh', () => {
    const params = translateChatRequestToResponses(
      {
        ...request,
        model: 'gpt-5.1',
        thinking: { type: 'enabled', budgetTokens: 32000 },
      },
      { compat },
    );

    expect(params.reasoning?.effort).toBe('high');
  });
});

describe('translateChatRequest', () => {
  it('maps high thinking budgets to OpenAI xhigh for Chat Completions when supported', () => {
    const params = translateChatRequest(
      {
        ...request,
        model: 'gpt-5.5',
        thinking: { type: 'enabled', budgetTokens: 32000 },
      },
      { compat, provider: 'openai' },
    );

    expect(params.reasoning_effort).toBe('xhigh');
  });

  it('never emits OpenAI max effort from thinking budgets', () => {
    const params = translateChatRequest(
      {
        ...request,
        model: 'gpt-5.5',
        thinking: { type: 'enabled', budgetTokens: Number.MAX_SAFE_INTEGER },
      },
      { compat, provider: 'openai' },
    );

    expect(params.reasoning_effort).toBe('xhigh');
  });
});
