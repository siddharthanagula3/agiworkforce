import { describe, expect, it, vi } from 'vitest';
import type { ChatRequest, StreamChunk } from '@agiworkforce/types';

import {
  createOpenAIAdapter,
  type OpenAIResponsesDiagnostics,
  type OpenAIAdapterConfig,
} from '../index';

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

describe('OpenAI Responses adapter diagnostics', () => {
  it('reports the request ID and content-free request/stream structure from the real SDK path', async () => {
    const diagnostics: OpenAIResponsesDiagnostics[] = [];
    const requestBodies: unknown[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)));
      const completed = {
        type: 'response.completed',
        sequence_number: 0,
        response: {
          id: 'resp_1',
          status: 'completed',
          output: [
            {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'execute_code',
              arguments: '{"code":"9 * 11"}',
              status: 'completed',
            },
          ],
        },
      };
      return new Response(`data: ${JSON.stringify(completed)}\n\ndata: [DONE]\n\n`, {
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'x-request-id': 'req_safe_123',
        },
      });
    });
    const config: OpenAIAdapterConfig = {
      apiKey: 'test-key',
      fetch: fetchMock as typeof fetch,
      onResponsesDiagnostics(value) {
        diagnostics.push(value);
      },
    };
    const adapter = createOpenAIAdapter(config);
    const request: ChatRequest = {
      model: 'gpt-5.4-mini',
      messages: [{ role: 'user', content: 'Sensitive prompt.' }],
      tools: [
        {
          name: 'execute_code',
          description: 'Run code.',
          inputSchema: { type: 'object', properties: { code: { type: 'string' } } },
        },
      ],
      toolChoice: 'required',
      effort: 'low',
      maxOutputTokens: 8192,
    };

    const chunks = await collect(adapter.stream(request, new AbortController().signal));

    expect(requestBodies).toHaveLength(1);
    expect(requestBodies[0]).toMatchObject({
      model: 'gpt-5.4-mini',
      tool_choice: 'required',
      max_output_tokens: 8192,
      reasoning: { effort: 'low', summary: 'auto' },
      stream: true,
    });
    expect(chunks).toEqual([
      { type: 'tool-use-start', toolUseId: 'call_1', name: 'execute_code' },
      {
        type: 'tool-use-delta',
        toolUseId: 'call_1',
        deltaJson: '{"code":"9 * 11"}',
      },
      { type: 'tool-use-end', toolUseId: 'call_1' },
      { type: 'stop', reason: 'tool_use' },
    ]);
    expect(diagnostics).toEqual([
      {
        requestId: 'req_safe_123',
        request: {
          model: 'gpt-5.4-mini',
          inputItemTypes: { message: 1 },
          inputContentTypes: {},
          toolTypes: { function: 1 },
          toolChoice: 'required',
          maxOutputTokens: 8192,
          reasoningEffort: 'low',
          reasoningSummary: 'auto',
        },
        stream: {
          eventTypes: { 'response.completed': 1 },
          finalOutputItemTypes: { function_call: 1 },
          finalContentTypes: {},
          responseStatus: 'completed',
          terminalEventType: 'response.completed',
          emitted: {
            text: false,
            functionCall: true,
            serverTool: false,
            error: false,
          },
        },
      },
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain('Sensitive prompt.');
    expect(JSON.stringify(diagnostics)).not.toContain('execute_code');
    expect(JSON.stringify(diagnostics)).not.toContain('9 * 11');
  });
});
