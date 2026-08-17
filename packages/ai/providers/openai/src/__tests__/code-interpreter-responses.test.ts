import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import type { OpenAICompletionsCompatDefaults } from '@agiworkforce/provider-protocol';
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

const request: ChatRequest = {
  model: OPENAI_DEFAULT_MODEL_ID,
  messages: [{ role: 'user', content: 'Plot the data.' }],
};

describe('code_interpreter on the Responses dialect', () => {
  it('adds the container Responses requires when a caller forwards a bare code_interpreter tool', () => {
    const params = translateChatRequestToResponses(
      { ...request, rawVendorTools: [{ type: 'code_interpreter' }] },
      { compat },
    );

    expect(params.tools).toEqual([{ type: 'code_interpreter', container: { type: 'auto' } }]);
  });

  it('keeps an explicit container object, including its file_ids and memory_limit', () => {
    const container = { type: 'auto', memory_limit: '4g', file_ids: ['file-1'] };
    const params = translateChatRequestToResponses(
      { ...request, rawVendorTools: [{ type: 'code_interpreter', container }] },
      { compat },
    );

    expect(params.tools).toEqual([{ type: 'code_interpreter', container }]);
  });

  it('keeps an explicit container id string', () => {
    const params = translateChatRequestToResponses(
      { ...request, rawVendorTools: [{ type: 'code_interpreter', container: 'cntr_abc123' }] },
      { compat },
    );

    expect(params.tools).toEqual([{ type: 'code_interpreter', container: 'cntr_abc123' }]);
  });

  it('leaves other native tools untouched', () => {
    const params = translateChatRequestToResponses(
      { ...request, rawVendorTools: [{ type: 'web_search' }] },
      { compat },
    );

    expect(params.tools).toEqual([{ type: 'web_search' }]);
  });
});
