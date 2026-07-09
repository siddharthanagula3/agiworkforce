/**
 * drainToLlmResponse (adapter-response.ts) -- the non-streaming half of the
 * adapter-path wiring. Until this file, it had zero direct behavioral
 * coverage: `__tests__/api/llm-v1-chat-completions-routing.test.ts` only
 * smoke-tests status 200 + routing metadata (a fake single-text-chunk
 * stream), and `web-wire-parity.test.ts`'s non-streaming tests exercise
 * `OpenAIWireAssembler.response()` directly, not this bridge function.
 *
 * This suite feeds realistic `StreamChunk` sequences (mirroring the
 * streaming "rich" fixture used elsewhere in this migration -- text,
 * server-managed web_search, tool_use) through `drainToLlmResponse` and
 * asserts the resulting `AdapterLlmResponse` shape matches what
 * `buildNonStreamResponse` (response-builder.ts, untouched by this
 * migration) expects, reproducing `apps/web/lib/llm-providers/anthropic.ts`'s
 * non-streaming `sendRequest` semantics.
 */

import { describe, it, expect } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';
import { drainToLlmResponse } from './adapter-response';

async function* chunksOf(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) yield chunk;
}

describe('drainToLlmResponse · content and finish reason', () => {
  it('joins text-delta chunks and maps end_turn -> stop', async () => {
    const result = await drainToLlmResponse(
      chunksOf([
        { type: 'text-delta', delta: 'Cats are ' },
        { type: 'text-delta', delta: 'mammals.' },
        { type: 'usage', inputTokens: 10, outputTokens: 5 },
        { type: 'stop', reason: 'end_turn' },
      ]),
      'claude-opus-4-8',
    );

    expect(result.content).toBe('Cats are mammals.');
    expect(result.finishReason).toBe('stop');
    expect(result.model).toBe('claude-opus-4-8');
  });

  it('coalesces empty content to "" (not null) for a tool-only response', async () => {
    // apps/web/lib/llm-providers/anthropic.ts's `textContent = textBlocks
    // .map(b => b.text || '').join('')` is `''` when there are no text
    // blocks at all -- NEVER `null`. OpenAIWireAssembler.response()'s
    // `message.content` is `null` for an empty turn (modern OpenAI
    // convention); drainToLlmResponse must coalesce back to match the
    // legacy non-streaming contract exactly.
    const result = await drainToLlmResponse(
      chunksOf([
        { type: 'tool-use-start', toolUseId: 'call_1', name: 'get_weather' },
        { type: 'tool-use-delta', toolUseId: 'call_1', deltaJson: '{"city":"NYC"}' },
        { type: 'tool-use-end', toolUseId: 'call_1' },
        { type: 'usage', inputTokens: 10, outputTokens: 5 },
        { type: 'stop', reason: 'tool_use' },
      ]),
      'claude-opus-4-8',
    );

    expect(result.content).toBe('');
    expect(result.finishReason).toBe('tool_calls');
  });

  it('maps max_tokens finish reason literally (legacy web wire never mapped it to "length")', async () => {
    const result = await drainToLlmResponse(
      chunksOf([
        { type: 'text-delta', delta: 'partial...' },
        { type: 'usage', inputTokens: 10, outputTokens: 5 },
        { type: 'stop', reason: 'max_tokens' },
      ]),
      'claude-opus-4-8',
    );

    expect(result.finishReason).toBe('max_tokens');
  });
});

describe('drainToLlmResponse · tool_calls index scheme', () => {
  it('uses sequential order-of-appearance index, NOT the raw vendor content-block index', async () => {
    // Mirrors apps/web/lib/llm-providers/anthropic.ts's non-streaming
    // `toolUseBlocks.map((block, index) => ({..., index}))` -- a DIFFERENT
    // indexing scheme from the streaming wire's vendorIndex (see
    // packages/providers/anthropic/src/__tests__/web-wire-parity.test.ts,
    // where the same tool_use block gets index 4, its raw content-block
    // position). Text before the tool_use block proves this isn't
    // accidentally correct only when the tool call is the first block.
    const result = await drainToLlmResponse(
      chunksOf([
        { type: 'text-delta', delta: 'Let me check. ' },
        {
          type: 'tool-use-start',
          toolUseId: 'call_abc',
          name: 'get_weather',
          vendorIndex: 4,
        },
        { type: 'tool-use-delta', toolUseId: 'call_abc', deltaJson: '{"city":"NYC"}' },
        { type: 'tool-use-end', toolUseId: 'call_abc' },
        { type: 'usage', inputTokens: 10, outputTokens: 5 },
        { type: 'stop', reason: 'tool_use' },
      ]),
      'claude-opus-4-8',
    );

    expect(result.tool_calls).toEqual([
      {
        id: 'call_abc',
        type: 'function',
        index: 0,
        function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
      },
    ]);
  });

  it('is undefined (not an empty array) when there are no tool calls', async () => {
    const result = await drainToLlmResponse(
      chunksOf([
        { type: 'text-delta', delta: 'hi' },
        { type: 'stop', reason: 'end_turn' },
      ]),
      'claude-opus-4-8',
    );

    expect(result.tool_calls).toBeUndefined();
  });
});

describe('drainToLlmResponse · usage and cache fields', () => {
  it('maps StreamChunkUsage fields onto the legacy llmResponse field names', async () => {
    const result = await drainToLlmResponse(
      chunksOf([
        { type: 'text-delta', delta: 'hi' },
        {
          type: 'usage',
          inputTokens: 500,
          outputTokens: 42,
          cacheReadTokens: 100,
          cacheWriteTokens: 400,
          cacheWrite1hTokens: 300,
          reasoningTokens: 20,
        },
        { type: 'stop', reason: 'end_turn' },
      ]),
      'claude-opus-4-8',
    );

    expect(result.promptTokens).toBe(500);
    expect(result.completionTokens).toBe(42);
    expect(result.totalTokens).toBe(542);
    expect(result.cachedInputTokens).toBe(100);
    expect(result.cacheCreationInputTokens).toBe(400);
    expect(result.cacheCreation1hInputTokens).toBe(300);
    expect(result.reasoningOutputTokens).toBe(20);
  });
});

describe('drainToLlmResponse · citations and search_results', () => {
  it('aggregates citation-delta and web_search server-tool-result payloads', async () => {
    const result = await drainToLlmResponse(
      chunksOf([
        { type: 'text-delta', delta: 'Cats are mammals' },
        {
          type: 'citation-delta',
          blockIndex: 0,
          payload: {
            type: 'web_search_result_location',
            cited_text: 'Cats are mammals',
            url: 'https://example.com',
          },
        },
        {
          type: 'server-tool-result',
          toolUseId: 'srvtool_1',
          payload: {
            type: 'web_search_tool_result',
            tool_use_id: 'srvtool_1',
            content: [{ url: 'https://example.com' }],
          },
        },
        { type: 'usage', inputTokens: 10, outputTokens: 5 },
        { type: 'stop', reason: 'end_turn' },
      ]),
      'claude-opus-4-8',
    );

    expect(result.citations).toEqual([
      {
        type: 'web_search_result_location',
        cited_text: 'Cats are mammals',
        url: 'https://example.com',
      },
    ]);
    expect(result.search_results).toEqual([
      {
        type: 'web_search_tool_result',
        tool_use_id: 'srvtool_1',
        content: [{ url: 'https://example.com' }],
      },
    ]);
  });

  it('does not surface code_execution_tool_result in search_results (legacy non-streaming never did)', async () => {
    const result = await drainToLlmResponse(
      chunksOf([
        { type: 'text-delta', delta: 'ok' },
        {
          type: 'server-tool-result',
          toolUseId: 'srvtool_2',
          payload: { type: 'code_execution_tool_result', tool_use_id: 'srvtool_2' },
        },
        { type: 'usage', inputTokens: 10, outputTokens: 5 },
        { type: 'stop', reason: 'end_turn' },
      ]),
      'claude-opus-4-8',
    );

    expect(result.search_results).toBeUndefined();
  });

  it('omits citations/search_results entirely when neither is present', async () => {
    const result = await drainToLlmResponse(
      chunksOf([
        { type: 'text-delta', delta: 'hi' },
        { type: 'stop', reason: 'end_turn' },
      ]),
      'claude-opus-4-8',
    );

    expect(result.citations).toBeUndefined();
    expect(result.search_results).toBeUndefined();
  });
});

describe('drainToLlmResponse · error handling', () => {
  it('throws an upstream error (not a 200 with empty content) when any error chunk appears', async () => {
    await expect(
      drainToLlmResponse(
        chunksOf([
          { type: 'text-delta', delta: 'partial content before the failure' },
          { type: 'error', message: 'invalid x-api-key', code: '401', retryable: false },
          { type: 'stop', reason: 'error' },
        ]),
        'claude-opus-4-8',
      ),
    ).rejects.toThrow(/authentication error \(401\)/i);
  });
});
