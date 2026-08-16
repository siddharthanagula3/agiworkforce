import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import type { OpenAICompletionsCompatDefaults } from '@agiworkforce/provider-protocol';
import { summarizeOpenAIResponsesRequest } from '../index';
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

const request: ChatRequest = {
  model: OPENAI_DEFAULT_MODEL_ID,
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

  it('passes the native web_search tool to Responses and requests complete source metadata', () => {
    const params = translateChatRequestToResponses(
      {
        ...request,
        rawVendorTools: [{ type: 'web_search' }],
      },
      { compat },
    );

    expect(params.tools).toEqual([{ type: 'web_search' }]);
    expect(params.include).toEqual(['web_search_call.action.sources']);
  });

  it('maps canonical files to Responses input_file content', () => {
    const params = translateChatRequestToResponses(
      {
        ...request,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Read this file' },
              {
                type: 'file',
                filename: 'brief.pdf',
                source: { type: 'base64', mediaType: 'application/pdf', data: 'JVBERg==' },
              },
            ],
          },
        ],
      },
      { compat },
    );

    expect(params.input).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'Read this file' },
          {
            type: 'input_file',
            filename: 'brief.pdf',
            file_data: 'data:application/pdf;base64,JVBERg==',
          },
        ],
      },
    ]);
  });

  it('maps high thinking budgets to OpenAI xhigh on supported Responses models', () => {
    const params = translateChatRequestToResponses(
      {
        ...request,
        model: OPENAI_DEFAULT_MODEL_ID,
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
        model: 'fixture-model',
        thinking: { type: 'enabled', budgetTokens: 32000 },
      },
      { compat },
    );

    expect(params.reasoning?.effort).toBe('high');
  });

  it('uses an explicit req.effort directly, bypassing the budgetTokens-derived heuristic', () => {
    const params = translateChatRequestToResponses(
      {
        ...request,
        model: OPENAI_DEFAULT_MODEL_ID,
        effort: 'medium',
        thinking: { type: 'enabled', budgetTokens: 32000 },
      },
      { compat },
    );

    expect(params.reasoning?.effort).toBe('medium');
  });

  it('emits reasoning.effort from req.effort ALONE, with no req.thinking present at all', () => {
    const params = translateChatRequestToResponses(
      {
        ...request,
        model: OPENAI_DEFAULT_MODEL_ID,
        effort: 'high',
        // thinking deliberately omitted entirely.
      },
      { compat },
    );

    expect(params.reasoning?.effort).toBe('high');
  });

  it('sends a managed tool step with required tools, low effort, and its output limit', () => {
    const params = translateChatRequestToResponses(
      {
        model: request.model,
        messages: [{ role: 'user', content: 'Use the sandbox tools.' }],
        tools: [
          {
            name: 'execute_code',
            description: 'Run code.',
            inputSchema: {
              type: 'object',
              properties: { code: { type: 'string' } },
              required: ['code'],
            },
          },
          {
            name: 'write_file',
            description: 'Write a file.',
            inputSchema: {
              type: 'object',
              properties: { path: { type: 'string' } },
              required: ['path'],
            },
          },
        ],
        toolChoice: 'required',
        effort: 'low',
        maxOutputTokens: 8192,
      },
      { compat, store: false },
    );

    expect(params).toMatchObject({
      model: request.model,
      tool_choice: 'required',
      max_output_tokens: 8192,
      reasoning: { effort: 'low', summary: 'auto' },
      store: false,
      stream: true,
    });
    expect(params.tools).toHaveLength(2);

    const diagnostics = summarizeOpenAIResponsesRequest(params);
    expect(diagnostics).toEqual({
      model: request.model,
      inputItemTypes: { message: 1 },
      inputContentTypes: {},
      toolTypes: { function: 2 },
      toolChoice: 'required',
      maxOutputTokens: 8192,
      reasoningEffort: 'low',
      reasoningSummary: 'auto',
      store: false,
    });
    expect(JSON.stringify(diagnostics)).not.toContain('Use the sandbox tools.');
    expect(JSON.stringify(diagnostics)).not.toContain('execute_code');
    expect(JSON.stringify(diagnostics)).not.toContain('write_file');
  });
});

describe('translateChatRequest', () => {
  it('rejects generic file input on Chat Completions instead of silently dropping it', () => {
    expect(() =>
      translateChatRequest(
        {
          ...request,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  filename: 'brief.pdf',
                  source: { type: 'base64', mediaType: 'application/pdf', data: 'JVBERg==' },
                },
              ],
            },
          ],
        },
        { compat, provider: 'openai' },
      ),
    ).toThrow('File inputs require an OpenAI Responses-capable model');
  });

  it('maps high thinking budgets to OpenAI xhigh for Chat Completions when supported', () => {
    const params = translateChatRequest(
      {
        ...request,
        model: OPENAI_DEFAULT_MODEL_ID,
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
        model: OPENAI_DEFAULT_MODEL_ID,
        thinking: { type: 'enabled', budgetTokens: Number.MAX_SAFE_INTEGER },
      },
      { compat, provider: 'openai' },
    );

    expect(params.reasoning_effort).toBe('xhigh');
  });
});
