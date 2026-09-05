import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import type { OpenAICompletionsCompatDefaults } from '@agiworkforce/provider-protocol';

import { translateChatRequest } from '../translate';
import { translateChatRequestToResponses } from '../translate-responses';
import { OPENAI_DEFAULT_MODEL_ID } from './model-fixtures';

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

const SEARCH_TOOL_NAME = 'web_search';

const baseRequest: ChatRequest = {
  model: OPENAI_DEFAULT_MODEL_ID,
  messages: [{ role: 'user', content: "Today's headline please" }],
  toolChoice: { type: 'tool', name: SEARCH_TOOL_NAME },
};

const genericSearchTool = {
  name: SEARCH_TOOL_NAME,
  description: 'Search the web.',
  inputSchema: { type: 'object' as const, properties: { query: { type: 'string' } } },
};

describe('required-search tool choice on the Responses API', () => {
  it('chooses the hosted search tool by its own type, not the function shape', () => {
    const params = translateChatRequestToResponses(
      { ...baseRequest, rawVendorTools: [{ type: SEARCH_TOOL_NAME }] },
      { compat },
    );

    expect(params.tool_choice).toEqual({ type: SEARCH_TOOL_NAME });
  });

  it('resolves the undated name onto a dated hosted variant', () => {
    const params = translateChatRequestToResponses(
      { ...baseRequest, rawVendorTools: [{ type: 'web_search_2025_08_26' }] },
      { compat },
    );

    expect(params.tool_choice).toEqual({ type: 'web_search_2025_08_26' });
  });

  it('keeps the function shape when the search tool is a platform-executed function', () => {
    const params = translateChatRequestToResponses(
      { ...baseRequest, tools: [genericSearchTool] },
      { compat },
    );

    expect(params.tool_choice).toEqual({ type: 'function', name: SEARCH_TOOL_NAME });
  });

  it('leaves the plain choices untouched', () => {
    for (const choice of ['auto', 'none', 'required'] as const) {
      const params = translateChatRequestToResponses(
        { ...baseRequest, toolChoice: choice, rawVendorTools: [{ type: SEARCH_TOOL_NAME }] },
        { compat },
      );
      expect(params.tool_choice).toBe(choice);
    }
  });
});

describe('required-search tool choice on the Chat Completions API', () => {
  it('names the search function in the chat tool choice', () => {
    const params = translateChatRequest(
      { ...baseRequest, tools: [genericSearchTool] },
      { compat, provider: 'openai' },
    );

    expect(params.tool_choice).toEqual({
      type: 'function',
      function: { name: SEARCH_TOOL_NAME },
    });
  });
});
