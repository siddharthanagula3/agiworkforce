import { describe, expect, it } from 'vitest';

import { translateOpenAIResponsesStream } from '../stream-responses';
import type { ResponsesStreamEvent } from '../responses-types';

async function* fromArray(events: ResponsesStreamEvent[]): AsyncIterable<ResponsesStreamEvent> {
  yield* events;
}

async function collect(events: AsyncIterable<unknown>): Promise<unknown[]> {
  const chunks: unknown[] = [];
  for await (const chunk of events) chunks.push(chunk);
  return chunks;
}

describe('translateOpenAIResponsesStream', () => {
  it('surfaces the documented top-level error event instead of ending as an empty success', async () => {
    const chunks = await collect(
      translateOpenAIResponsesStream(
        fromArray([
          {
            type: 'error',
            code: 'invalid_request_error',
            message: 'The request could not be processed.',
            param: 'tools[0]',
            sequence_number: 3,
          },
        ]),
      ),
    );

    expect(chunks).toEqual([
      {
        type: 'error',
        code: 'invalid_request_error',
        message: 'The request could not be processed.',
      },
      { type: 'stop', reason: 'error' },
    ]);
  });

  it('uses output_text.done when a stream contains no text deltas', async () => {
    const chunks = await collect(
      translateOpenAIResponsesStream(
        fromArray([
          {
            type: 'response.output_item.added',
            output_index: 0,
            sequence_number: 0,
            item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'in_progress' },
          },
          {
            type: 'response.output_text.done',
            item_id: 'msg_1',
            output_index: 0,
            content_index: 0,
            sequence_number: 1,
            text: 'Recovered final text.',
          },
          {
            type: 'response.completed',
            sequence_number: 2,
            response: { id: 'resp_1', status: 'completed' },
          },
        ]),
      ),
    );

    expect(chunks).toEqual([
      { type: 'text-delta', delta: 'Recovered final text.' },
      { type: 'stop', reason: 'end_turn' },
    ]);
  });

  it('does not repeat output_text.done after text deltas were already emitted', async () => {
    const chunks = await collect(
      translateOpenAIResponsesStream(
        fromArray([
          {
            type: 'response.output_text.delta',
            item_id: 'msg_1',
            output_index: 0,
            content_index: 0,
            sequence_number: 0,
            delta: 'Already streamed.',
          },
          {
            type: 'response.output_text.done',
            item_id: 'msg_1',
            output_index: 0,
            content_index: 0,
            sequence_number: 1,
            text: 'Already streamed.',
          },
          {
            type: 'response.completed',
            sequence_number: 2,
            response: { id: 'resp_1', status: 'completed' },
          },
        ]),
      ),
    );

    expect(chunks).toEqual([
      { type: 'text-delta', delta: 'Already streamed.' },
      { type: 'stop', reason: 'end_turn' },
    ]);
  });

  it('ends a streamed function call with tool_use so the caller executes it', async () => {
    const chunks = await collect(
      translateOpenAIResponsesStream(
        fromArray([
          {
            type: 'response.output_item.added',
            output_index: 0,
            sequence_number: 0,
            item: {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'execute_code',
              arguments: '',
            },
          },
          {
            type: 'response.function_call_arguments.done',
            item_id: 'fc_1',
            output_index: 0,
            sequence_number: 1,
            arguments: '{"code":"9 * 11"}',
          },
          {
            type: 'response.output_item.done',
            output_index: 0,
            sequence_number: 2,
            item: {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'execute_code',
              arguments: '{"code":"9 * 11"}',
              status: 'completed',
            },
          },
          {
            type: 'response.completed',
            sequence_number: 3,
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
          },
        ] as ResponsesStreamEvent[]),
      ),
    );

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
  });

  it('recovers a final-only function call from response.completed without repeating it', async () => {
    const chunks = await collect(
      translateOpenAIResponsesStream(
        fromArray([
          {
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
                  name: 'write_file',
                  arguments: '{"path":"generated-tool-output.html"}',
                  status: 'completed',
                },
              ],
            },
          },
        ] as ResponsesStreamEvent[]),
      ),
    );

    expect(chunks).toEqual([
      { type: 'tool-use-start', toolUseId: 'call_1', name: 'write_file' },
      {
        type: 'tool-use-delta',
        toolUseId: 'call_1',
        deltaJson: '{"path":"generated-tool-output.html"}',
      },
      { type: 'tool-use-end', toolUseId: 'call_1' },
      { type: 'stop', reason: 'tool_use' },
    ]);
  });

  it('recovers final-only message text from response.completed', async () => {
    const chunks = await collect(
      translateOpenAIResponsesStream(
        fromArray([
          {
            type: 'response.completed',
            sequence_number: 0,
            response: {
              id: 'resp_1',
              status: 'completed',
              output_text: 'The calculation is 99.',
              output: [
                {
                  type: 'message',
                  id: 'msg_1',
                  role: 'assistant',
                  status: 'completed',
                  content: [
                    {
                      type: 'output_text',
                      text: 'The calculation is 99.',
                      annotations: [],
                    },
                  ],
                },
              ],
            },
          },
        ] as ResponsesStreamEvent[]),
      ),
    );

    expect(chunks).toEqual([
      { type: 'text-delta', delta: 'The calculation is 99.' },
      { type: 'stop', reason: 'end_turn' },
    ]);
  });

  it('fails closed when a completed response contains reasoning but no text or tool output', async () => {
    const chunks = await collect(
      translateOpenAIResponsesStream(
        fromArray([
          {
            type: 'response.completed',
            sequence_number: 0,
            response: {
              id: 'resp_1',
              status: 'completed',
              output: [
                {
                  type: 'reasoning',
                  id: 'rs_1',
                  summary: [],
                },
              ],
            },
          },
        ] as ResponsesStreamEvent[]),
      ),
    );

    expect(chunks).toEqual([
      {
        type: 'error',
        code: 'empty_response',
        message: 'OpenAI response completed without text or tool output.',
      },
      { type: 'stop', reason: 'error' },
    ]);
  });

  it('reports content-free event and output-type diagnostics', async () => {
    const diagnostics: unknown[] = [];

    await collect(
      translateOpenAIResponsesStream(
        fromArray([
          {
            type: 'response.completed',
            sequence_number: 0,
            response: {
              id: 'resp_1',
              status: 'completed',
              output: [
                {
                  type: 'message',
                  id: 'msg_1',
                  role: 'assistant',
                  status: 'completed',
                  content: [
                    { type: 'output_text', text: 'Sensitive response text.', annotations: [] },
                  ],
                },
              ],
            },
          },
        ] as ResponsesStreamEvent[]),
        {
          onDiagnostics(value: unknown) {
            diagnostics.push(value);
          },
        } as never,
      ),
    );

    expect(diagnostics).toEqual([
      {
        eventTypes: { 'response.completed': 1 },
        finalOutputItemTypes: { message: 1 },
        finalContentTypes: { output_text: 1 },
        responseStatus: 'completed',
        terminalEventType: 'response.completed',
        emitted: {
          text: true,
          functionCall: false,
          serverTool: false,
          error: false,
        },
      },
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain('Sensitive response text.');
  });

  it('maps reasoning summary deltas to thinking-delta chunks during the pre-token reasoning wait', async () => {
    const chunks = await collect(
      translateOpenAIResponsesStream(
        fromArray([
          {
            type: 'response.output_item.added',
            output_index: 0,
            sequence_number: 0,
            item: { type: 'reasoning', id: 'rs_1', status: 'in_progress' },
          },
          {
            type: 'response.reasoning_summary_text.delta',
            item_id: 'rs_1',
            output_index: 0,
            summary_index: 0,
            sequence_number: 1,
            delta: 'Weighing the ',
          },
          {
            type: 'response.reasoning_summary_text.delta',
            item_id: 'rs_1',
            output_index: 0,
            summary_index: 0,
            sequence_number: 2,
            delta: 'available options.',
          },
          {
            type: 'response.output_item.added',
            output_index: 1,
            sequence_number: 3,
            item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'in_progress' },
          },
          {
            type: 'response.output_text.delta',
            item_id: 'msg_1',
            output_index: 1,
            content_index: 0,
            sequence_number: 4,
            delta: 'Here is the answer.',
          },
          {
            type: 'response.completed',
            sequence_number: 5,
            response: { id: 'resp_1', status: 'completed' },
          },
        ] as ResponsesStreamEvent[]),
      ),
    );

    expect(chunks).toEqual([
      { type: 'thinking-delta', delta: 'Weighing the ' },
      { type: 'thinking-delta', delta: 'available options.' },
      { type: 'text-delta', delta: 'Here is the answer.' },
      { type: 'stop', reason: 'end_turn' },
    ]);
  });

  it('maps reasoning_text deltas to thinking-delta chunks the same way as reasoning_summary_text', async () => {
    const chunks = await collect(
      translateOpenAIResponsesStream(
        fromArray([
          {
            type: 'response.reasoning_text.delta',
            item_id: 'rs_1',
            output_index: 0,
            content_index: 0,
            sequence_number: 0,
            delta: 'Considering the request.',
          },
          {
            type: 'response.output_text.delta',
            item_id: 'msg_1',
            output_index: 1,
            content_index: 0,
            sequence_number: 1,
            delta: 'Final answer.',
          },
          {
            type: 'response.completed',
            sequence_number: 2,
            response: { id: 'resp_1', status: 'completed' },
          },
        ] as ResponsesStreamEvent[]),
      ),
    );

    expect(chunks).toEqual([
      { type: 'thinking-delta', delta: 'Considering the request.' },
      { type: 'text-delta', delta: 'Final answer.' },
      { type: 'stop', reason: 'end_turn' },
    ]);
  });
});
