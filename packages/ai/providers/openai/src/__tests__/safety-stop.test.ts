/**
 * OpenAI's wire `content_filter` finish reason means the provider's safety
 * layer stopped the response, the same honest concept as Anthropic's
 * `stop_reason: 'refusal'`. Both translators must surface it as the
 * first-class StreamChunkStop `'refusal'` member (mirroring the agent event
 * envelope's Refusal stop), never as `'error'` (transport/provider failure)
 * and never as a silent normal completion.
 */

import { describe, expect, it, vi } from 'vitest';
import { getProviderDefaultModel, type StreamChunk } from '@agiworkforce/types';

import { createOpenAIAdapter, providerPolicyStopCode } from '../index';
import { translateOpenAIStream } from '../stream';
import type { OpenAIChatCompletionChunk } from '../types';
import { translateOpenAIResponsesStream } from '../stream-responses';
import type { ResponsesStreamEvent } from '../responses-types';

async function* fromArray<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) yield item;
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

describe('translateOpenAIStream, content_filter is a first-class refusal', () => {
  it("maps finish_reason 'content_filter' to stop reason 'refusal', not 'error' or 'end_turn'", async () => {
    const chunks = [
      {
        id: 'chatcmpl-1',
        created: 1,
        choices: [{ index: 0, delta: { content: 'I can' }, finish_reason: null }],
      },
      {
        id: 'chatcmpl-1',
        created: 1,
        choices: [{ index: 0, delta: {}, finish_reason: 'content_filter' }],
      },
    ] as unknown as OpenAIChatCompletionChunk[];

    const out = await collect(translateOpenAIStream(fromArray(chunks)));
    const stops = out.filter((c) => c.type === 'stop');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toEqual({ type: 'stop', reason: 'refusal' });
  });

  it("still maps 'stop' to 'end_turn' and 'length' to 'max_tokens' (unaffected)", async () => {
    for (const [wire, expected] of [
      ['stop', 'end_turn'],
      ['length', 'max_tokens'],
    ] as const) {
      const chunks = [
        {
          id: 'chatcmpl-2',
          created: 1,
          choices: [{ index: 0, delta: {}, finish_reason: wire }],
        },
      ] as unknown as OpenAIChatCompletionChunk[];

      const out = await collect(translateOpenAIStream(fromArray(chunks)));
      expect(out.find((c) => c.type === 'stop')).toEqual({ type: 'stop', reason: expected });
    }
  });
});

describe('translateOpenAIResponsesStream, content_filter is a first-class refusal', () => {
  it("maps incomplete_details.reason 'content_filter' to stop reason 'refusal'", async () => {
    const events = [
      {
        type: 'response.incomplete',
        response: { incomplete_details: { reason: 'content_filter' } },
      },
    ] as unknown as ResponsesStreamEvent[];

    const out = await collect(translateOpenAIResponsesStream(fromArray(events)));
    const stops = out.filter((c) => c.type === 'stop');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toEqual({ type: 'stop', reason: 'refusal' });
  });

  it("still maps 'max_output_tokens' to 'max_tokens' (unaffected)", async () => {
    const events = [
      {
        type: 'response.incomplete',
        response: { incomplete_details: { reason: 'max_output_tokens' } },
      },
    ] as unknown as ResponsesStreamEvent[];

    const out = await collect(translateOpenAIResponsesStream(fromArray(events)));
    expect(out.find((c) => c.type === 'stop')).toEqual({ type: 'stop', reason: 'max_tokens' });
  });
});

describe('providerPolicyStopCode, a policy block before any output is a refusal', () => {
  it('names the policy when the provider error carries a policy code', () => {
    const blocked = Object.assign(new Error('This content was flagged'), {
      status: 400,
      code: 'cyber_policy',
    });
    expect(providerPolicyStopCode(blocked)).toBe('cyber_policy');
  });

  it('leaves every other failure to the error path', () => {
    expect(
      providerPolicyStopCode(
        Object.assign(new Error('slow down'), { code: 'rate_limit_exceeded' }),
      ),
    ).toBeUndefined();
    expect(providerPolicyStopCode(new Error('socket hang up'))).toBeUndefined();
    expect(providerPolicyStopCode({ code: 400 })).toBeUndefined();
    expect(providerPolicyStopCode(null)).toBeUndefined();
    expect(providerPolicyStopCode(undefined)).toBeUndefined();
  });
});

describe('OpenAI adapter, a policy block on the wire ends the turn as a refusal', () => {
  const blockMessage = 'This content was flagged for possible cybersecurity risk.';

  function sse(events: Array<Record<string, unknown>>): Response {
    const body = events
      .map((event) => `event: ${String(event['type'])}\ndata: ${JSON.stringify(event)}\n\n`)
      .join('');
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }

  it('emits one refusal stop naming the policy, and no error to retry or rotate on', async () => {
    const fetchMock = vi.fn(async () =>
      sse([
        { type: 'response.created', sequence_number: 0, response: { id: 'resp_1' } },
        { type: 'response.in_progress', sequence_number: 1, response: { id: 'resp_1' } },
        {
          type: 'error',
          sequence_number: 2,
          error: { type: 'invalid_request', code: 'cyber_policy', message: blockMessage },
        },
        {
          type: 'response.failed',
          sequence_number: 3,
          response: {
            id: 'resp_1',
            status: 'failed',
            error: { code: 'cyber_policy', message: blockMessage },
          },
        },
      ]),
    );
    const adapter = createOpenAIAdapter({ apiKey: 'test-key', fetch: fetchMock as typeof fetch });
    const out = await collect(
      adapter.stream(
        {
          model: getProviderDefaultModel('openai')!,
          messages: [{ role: 'user', content: 'A request the provider blocks.' }],
        },
        new AbortController().signal,
      ),
    );
    expect(out.filter((c) => c.type === 'error')).toEqual([]);
    expect(out.filter((c) => c.type === 'stop')).toEqual([
      { type: 'stop', reason: 'refusal', providerFinishReason: 'cyber_policy' },
    ]);
  });
});
