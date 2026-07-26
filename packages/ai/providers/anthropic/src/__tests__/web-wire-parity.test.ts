/**
 * Proves the full pipeline -- translateAnthropicStream (this package) into
 * OpenAIWireAssembler.sseChunks({wireMode:'legacy-web'}) (@agiworkforce/
 * provider-protocol) -- reproduces the web v1 route's pre-Wave-2 wire bytes
 * EXACTLY, for the same Anthropic event fixtures captured against the real
 * (unmodified) legacy implementation in apps/web/app/api/llm/v1/chat/
 * completions/__tests__/stream-transform.golden.test.ts. Any drift here is
 * a byte-stability regression in the migration this package is part of.
 */

import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { OpenAIWireAssembler } from '@agiworkforce/provider-protocol';
import { translateAnthropicStream } from '../stream';

async function* events(seq: unknown[]): AsyncIterable<Anthropic.MessageStreamEvent> {
  for (const e of seq) yield e as Anthropic.MessageStreamEvent;
}

async function collectWire(
  seq: unknown[],
  options: ConstructorParameters<typeof OpenAIWireAssembler>[0],
): Promise<Record<string, unknown>[]> {
  const assembler = new OpenAIWireAssembler(options);
  const out: Record<string, unknown>[] = [];
  for await (const chunk of translateAnthropicStream(events(seq))) {
    out.push(...assembler.sseChunks(chunk));
  }
  return out;
}

describe('web v1 wire parity · streaming', () => {
  it('matches the golden fixture for text, web_search, thinking, and tool_use', async () => {
    // Mirrors apps/web/app/api/llm/v1/chat/completions/__tests__/
    // stream-transform.golden.test.ts's "reshapes text, server-managed
    // web_search, thinking, and tool_use" fixture exactly (same events,
    // JSON-object form instead of SSE-framed text).
    const seq = [
      {
        type: 'message_start',
        message: {
          usage: {
            input_tokens: 500,
            cache_read_input_tokens: 100,
            cache_creation_input_tokens: 400,
            cache_creation: { ephemeral_1h_input_tokens: 300 },
          },
        },
      },
      { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Let me search. ' },
      },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'server_tool_use', id: 'srvtool_1', name: 'web_search' },
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"query":"cats"}' },
      },
      { type: 'content_block_stop', index: 1 },
      {
        type: 'content_block_start',
        index: 2,
        content_block: {
          type: 'web_search_tool_result',
          tool_use_id: 'srvtool_1',
          content: [{ url: 'https://example.com' }],
        },
      },
      { type: 'content_block_stop', index: 2 },
      { type: 'content_block_start', index: 3, content_block: { type: 'thinking' } },
      {
        type: 'content_block_delta',
        index: 3,
        delta: { type: 'thinking_delta', thinking: 'pondering...' },
      },
      { type: 'content_block_stop', index: 3 },
      {
        type: 'content_block_start',
        index: 4,
        content_block: { type: 'tool_use', id: 'call_abc', name: 'get_weather' },
      },
      {
        type: 'content_block_delta',
        index: 4,
        delta: { type: 'input_json_delta', partial_json: '{"city":"NYC"}' },
      },
      { type: 'content_block_stop', index: 4 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use' },
        usage: { output_tokens: 42 },
      },
      { type: 'message_stop' },
    ];

    const wire = await collectWire(seq, { model: 'claude-opus-5', wireMode: 'legacy-web' });

    expect(wire).toEqual([
      { choices: [{ delta: { content: 'Let me search. ' }, index: 0 }], model: 'claude-opus-5' },
      {
        choices: [
          {
            delta: {
              x_tool_status: { type: 'server_tool_use', name: 'web_search', status: 'searching' },
            },
            index: 0,
          },
        ],
        model: 'claude-opus-5',
      },
      {
        choices: [
          {
            delta: {
              x_search_results: {
                type: 'web_search_tool_result',
                tool_use_id: 'srvtool_1',
                content: [{ url: 'https://example.com' }],
              },
            },
            index: 0,
          },
        ],
        model: 'claude-opus-5',
      },
      { choices: [{ delta: { content: '<thinking>' }, index: 0 }], model: 'claude-opus-5' },
      { choices: [{ delta: { content: 'pondering...' }, index: 0 }], model: 'claude-opus-5' },
      { choices: [{ delta: { content: '</thinking>' }, index: 0 }], model: 'claude-opus-5' },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 4,
                  id: 'call_abc',
                  type: 'function',
                  function: { name: 'get_weather', arguments: '' },
                },
              ],
            },
            index: 0,
          },
        ],
        model: 'claude-opus-5',
      },
      {
        choices: [
          {
            delta: { tool_calls: [{ index: 4, function: { arguments: '{"city":"NYC"}' } }] },
            index: 0,
          },
        ],
        model: 'claude-opus-5',
      },
      {
        choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }],
        model: 'claude-opus-5',
      },
    ]);
  });

  it('matches the golden fixture for citations_delta raw passthrough', async () => {
    const seq = [
      { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'citations_delta',
          citation: {
            type: 'web_search_result_location',
            cited_text: 'cats',
            url: 'https://example.com',
          },
        },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: ' are mammals' },
      },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
      { type: 'message_stop' },
    ];

    const wire = await collectWire(seq, { model: 'claude-opus-5', wireMode: 'legacy-web' });

    expect(wire).toEqual([
      {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'citations_delta',
          citation: {
            type: 'web_search_result_location',
            cited_text: 'cats',
            url: 'https://example.com',
          },
        },
      },
      {
        choices: [{ delta: { content: ' are mammals' }, index: 0 }],
        model: 'claude-opus-5',
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
        model: 'claude-opus-5',
      },
    ]);
  });

  it('wireMode "default" produces none of the legacy-web-only output for the new chunk types', async () => {
    const seq = [
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'server_tool_use', id: 'srvtool_1', name: 'web_search' },
      },
      { type: 'content_block_start', index: 1, content_block: { type: 'thinking' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'thinking_delta', thinking: 'hmm' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
      { type: 'message_stop' },
    ];

    const wire = await collectWire(seq, { model: 'claude-opus-5' });
    // 'default' mode still emits the normal 'stop' translation (unaffected
    // by wireMode) as a full spec-compliant envelope -- only the
    // server-tool-use/thinking-delta chunks produce nothing, since
    // emitReasoningContent defaults off.
    expect(wire).toHaveLength(1);
    expect(wire[0]).toMatchObject({
      object: 'chat.completion.chunk',
      model: 'claude-opus-5',
      choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
    });
    expect(wire[0]).toHaveProperty('id');
    expect(wire[0]).toHaveProperty('created');
  });
});

describe('web v1 wire parity · non-streaming', () => {
  it('aggregates citations and search_results (web_search only, not code_execution) matching the legacy response shape', () => {
    const assembler = new OpenAIWireAssembler({
      model: 'claude-opus-5',
      wireMode: 'legacy-web',
      now: () => 1_700_000_000_000,
      id: 'chatcmpl-test',
    });

    assembler.ingest({ type: 'text-delta', delta: 'Cats are mammals.' });
    assembler.ingest({
      type: 'citation-delta',
      blockIndex: 0,
      payload: {
        type: 'web_search_result_location',
        cited_text: 'Cats are mammals',
        url: 'https://example.com',
      },
    });
    assembler.ingest({
      type: 'server-tool-result',
      toolUseId: 'srvtool_1',
      payload: {
        type: 'web_search_tool_result',
        tool_use_id: 'srvtool_1',
        content: [{ url: 'https://example.com' }],
      },
    });
    // code_execution_tool_result must NOT be aggregated into any
    // non-streaming field -- the legacy response never surfaced it.
    assembler.ingest({
      type: 'server-tool-result',
      toolUseId: 'srvtool_2',
      payload: {
        type: 'code_execution_tool_result',
        tool_use_id: 'srvtool_2',
        content: { stdout: 'ok' },
      },
    });
    assembler.ingest({ type: 'stop', reason: 'end_turn' });

    const response = assembler.response();
    expect(response['citations']).toEqual([
      {
        type: 'web_search_result_location',
        cited_text: 'Cats are mammals',
        url: 'https://example.com',
      },
    ]);
    expect(response['search_results']).toEqual([
      {
        type: 'web_search_tool_result',
        tool_use_id: 'srvtool_1',
        content: [{ url: 'https://example.com' }],
      },
    ]);
    expect(response['choices']).toMatchObject([{ finish_reason: 'stop' }]);
  });

  it('uses legacy (unmapped) finish_reason for max_tokens in legacy-web mode', () => {
    const assembler = new OpenAIWireAssembler({ model: 'm', wireMode: 'legacy-web' });
    assembler.ingest({ type: 'stop', reason: 'max_tokens' });
    const response = assembler.response();
    expect((response['choices'] as Array<{ finish_reason: string }>)[0]?.finish_reason).toBe(
      'max_tokens',
    );
  });

  it('uses the OpenAI-standard finish_reason mapping in default mode', () => {
    const assembler = new OpenAIWireAssembler({ model: 'm' });
    assembler.ingest({ type: 'stop', reason: 'max_tokens' });
    const response = assembler.response();
    expect((response['choices'] as Array<{ finish_reason: string }>)[0]?.finish_reason).toBe(
      'length',
    );
  });

  it('omits citations/search_results in default mode even with the same chunks', () => {
    const assembler = new OpenAIWireAssembler({ model: 'm' });
    assembler.ingest({ type: 'citation-delta', blockIndex: 0, payload: { foo: 'bar' } });
    assembler.ingest({
      type: 'server-tool-result',
      toolUseId: 't1',
      payload: { type: 'web_search_tool_result' },
    });
    const response = assembler.response();
    expect(response).not.toHaveProperty('citations');
    expect(response).not.toHaveProperty('search_results');
  });
});
