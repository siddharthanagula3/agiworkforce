import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';

import { agentEventToStreamChunk, streamChunkToAgentEvent } from '../agent-event-envelope';

/**
 * The lossless-mapping proof for the one versioned agent event envelope
 * (execution program §W5 item 4). REUSES the exact `StreamChunk[]` sequence
 * from `openai-wire-compat.test.ts`'s `'emits text deltas, tool-call
 * frames, and the finish chunk'` test (`OpenAIWireAssembler streaming`
 * describe block) — that sequence already exercises this package's real
 * production wire-assembly path, so it is real recorded dialect data, not
 * a fixture invented for this test.
 */
const REAL_WEB_SSE_CHUNK_SEQUENCE: StreamChunk[] = [
  { type: 'text-delta', delta: 'Hel' },
  { type: 'tool-use-start', toolUseId: 'tu_1', name: 'search' },
  { type: 'tool-use-delta', toolUseId: 'tu_1', deltaJson: '{"q":' },
  { type: 'tool-use-end', toolUseId: 'tu_1' },
  { type: 'usage', inputTokens: 10, outputTokens: 4 },
  { type: 'stop', reason: 'tool_use' },
];

describe('streamChunkToAgentEvent / agentEventToStreamChunk round trip', () => {
  it('maps the real recorded web SSE chunk sequence to AgentEvent and back losslessly', () => {
    const events = REAL_WEB_SSE_CHUNK_SEQUENCE.map(streamChunkToAgentEvent);

    // None of the six real chunks in this sequence is one of the three
    // deliberately-unmodeled StreamChunk variants (citation-delta,
    // vendor-raw, response-meta) — every mapping must succeed.
    for (const event of events) {
      expect(event).not.toBeNull();
    }

    expect(events).toEqual([
      { type: 'text-delta', delta: 'Hel' },
      { type: 'tool-use-start', toolUseId: 'tu_1', name: 'search' },
      { type: 'tool-use-delta', toolUseId: 'tu_1', deltaJson: '{"q":' },
      { type: 'tool-use-end', toolUseId: 'tu_1' },
      {
        type: 'usage',
        inputTokens: 10,
        outputTokens: 4,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
        cacheWrite1hTokens: undefined,
        reasoningTokens: undefined,
      },
      { type: 'stop', reason: 'tool-use' },
    ]);

    const roundTripped = events.map((event) => agentEventToStreamChunk(event!));
    expect(roundTripped).toEqual(REAL_WEB_SSE_CHUNK_SEQUENCE);
  });

  it('round-trips thinking-delta with a signature (Anthropic extended thinking)', () => {
    const chunk: StreamChunk = {
      type: 'thinking-delta',
      delta: 'considering...',
      signature: 'sig-abc',
    };
    const event = streamChunkToAgentEvent(chunk);
    expect(event).toEqual({
      type: 'reasoning-delta',
      delta: 'considering...',
      signature: 'sig-abc',
    });
    expect(agentEventToStreamChunk(event!)).toEqual(chunk);
  });

  it('round-trips server-tool-use and server-tool-result verbatim, including the untyped payload', () => {
    const use: StreamChunk = { type: 'server-tool-use', toolUseId: 'srv_1', name: 'web_search' };
    const result: StreamChunk = {
      type: 'server-tool-result',
      toolUseId: 'srv_1',
      payload: { results: [{ url: 'https://example.com', title: 'Example' }] },
      isError: false,
    };
    expect(agentEventToStreamChunk(streamChunkToAgentEvent(use)!)).toEqual(use);
    expect(agentEventToStreamChunk(streamChunkToAgentEvent(result)!)).toEqual(result);
  });

  it('round-trips a full StreamChunkError (code, retryable, retryAfterSeconds all present)', () => {
    const chunk: StreamChunk = {
      type: 'error',
      message: 'upstream disconnected',
      code: 'stream_disconnected',
      retryable: true,
      retryAfterSeconds: 2,
    };
    expect(agentEventToStreamChunk(streamChunkToAgentEvent(chunk)!)).toEqual(chunk);
  });

  it('deliberately does not model citation-delta, vendor-raw, or response-meta', () => {
    const citation: StreamChunk = { type: 'citation-delta', blockIndex: 0, payload: {} };
    const vendorRaw: StreamChunk = { type: 'vendor-raw', payload: {} };
    const responseMeta: StreamChunk = { type: 'response-meta', id: 'x' };
    expect(streamChunkToAgentEvent(citation)).toBeNull();
    expect(streamChunkToAgentEvent(vendorRaw)).toBeNull();
    expect(streamChunkToAgentEvent(responseMeta)).toBeNull();
  });

  it('AgentEvent lifecycle has no StreamChunk analog (app-server/desktop-only concept)', () => {
    expect(agentEventToStreamChunk({ type: 'lifecycle', phase: 'started' })).toBeNull();
    expect(agentEventToStreamChunk({ type: 'lifecycle', phase: 'heartbeat' })).toBeNull();
  });

  describe('stop reason round trip — the honest-vocabulary gap is intentional and tested, not silently lossy', () => {
    it('the five reasons StreamChunkStop already has round-trip exactly', () => {
      for (const reason of [
        'end_turn',
        'max_tokens',
        'tool_use',
        'stop_sequence',
        'cancel',
      ] as const) {
        const chunk: StreamChunk = { type: 'stop', reason };
        expect(agentEventToStreamChunk(streamChunkToAgentEvent(chunk)!)).toEqual(chunk);
      }
    });

    it("'error' round-trips exactly (both 'error' and the not-yet-wired 'refusal' target land on the same wire value today)", () => {
      const chunk: StreamChunk = { type: 'stop', reason: 'error' };
      expect(agentEventToStreamChunk(streamChunkToAgentEvent(chunk)!)).toEqual(chunk);
    });

    it("AgentEventStopReason 'refusal' maps DOWN to StreamChunk 'error' (lossy on purpose): no producer emits 'refusal' from a real StreamChunk yet, so this is a one-way escape hatch for the envelope to carry a refusal outcome, not a claim that it round-trips", () => {
      const streamChunk = agentEventToStreamChunk({ type: 'stop', reason: 'refusal' });
      expect(streamChunk).toEqual({ type: 'stop', reason: 'error' });

      // Mapping that same StreamChunk back up does NOT recover 'refusal' —
      // proves the asymmetry is real and documents exactly where the
      // execution-program §W6 item 1 fix (Anthropic adapter emitting an
      // honest refusal outcome) needs to land for this to close.
      const roundTripped = streamChunkToAgentEvent(streamChunk!);
      expect(roundTripped).toEqual({ type: 'stop', reason: 'error' });
      expect(roundTripped).not.toEqual({ type: 'stop', reason: 'refusal' });
    });
  });
});
