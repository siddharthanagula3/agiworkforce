import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';
import type { AgentEvent } from '@agiworkforce/types/protocol';

import { agentEventToStreamChunk, streamChunkToAgentEvent } from '../agent-event-envelope';

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

  it('keeps user-surface run activity out of the provider StreamChunk dialect', () => {
    const activityEvents: AgentEvent[] = [
      {
        type: 'progress-update',
        progressId: 'plan',
        summary: 'Planning the report',
        status: 'running',
      },
      {
        type: 'tool-execution-start',
        toolCallId: 'call-1',
        name: 'web_search',
        category: 'web-search',
        summary: 'Searching official sources',
        input: { query: 'release notes' },
      },
      {
        type: 'tool-execution-end',
        toolCallId: 'call-1',
        name: 'web_search',
        output: { resultCount: 3 },
        isError: false,
      },
      {
        type: 'source-list',
        query: 'release notes',
        sources: [{ url: 'https://example.com', title: 'Example' }],
      },
      {
        type: 'approval-requested',
        approvalId: 'approval-1',
        toolCallId: 'call-2',
        name: 'shell',
        category: 'shell',
        summary: 'Install a package',
        input: { command: 'install package' },
      },
      { type: 'approval-resolved', approvalId: 'approval-1', decision: 'approved' },
      {
        type: 'artifact-produced',
        artifactId: 'artifact-1',
        name: 'report.pdf',
        mimeType: 'application/pdf',
        uri: '/files/artifact-1',
      },
      { type: 'context-compacted', summary: 'Context automatically compacted' },
      {
        type: 'task-state-changed',
        taskId: 'turn-1',
        state: 'ready_for_review',
        previousState: 'running',
        summary: 'Ready for review',
      },
    ];

    for (const event of activityEvents) {
      expect(agentEventToStreamChunk(event)).toBeNull();
    }
  });

  describe('stop reason round trip — the honest vocabulary is symmetric: every member round-trips losslessly', () => {
    it('every StreamChunkStop reason round-trips exactly, refusal included', () => {
      for (const reason of [
        'end_turn',
        'max_tokens',
        'tool_use',
        'stop_sequence',
        'refusal',
        'cancel',
        'error',
      ] as const) {
        const chunk: StreamChunk = { type: 'stop', reason };
        expect(agentEventToStreamChunk(streamChunkToAgentEvent(chunk)!)).toEqual(chunk);
      }
    });

    it("AgentEventStopReason 'refusal' maps DOWN to the first-class StreamChunk 'refusal' — the historical collapse to 'error' (the pre-emitter-wiring asymmetry this block used to pin) is closed and must not return", () => {
      const streamChunk = agentEventToStreamChunk({ type: 'stop', reason: 'refusal' });
      expect(streamChunk).toEqual({ type: 'stop', reason: 'refusal' });
      expect(streamChunk).not.toEqual({ type: 'stop', reason: 'error' });

      const roundTripped = streamChunkToAgentEvent(streamChunk!);
      expect(roundTripped).toEqual({ type: 'stop', reason: 'refusal' });
    });

    it("'pause_turn' is a suspension, not a stop: it becomes the non-terminal paused lifecycle phase instead of any terminal stop reason", () => {
      const event = streamChunkToAgentEvent({ type: 'stop', reason: 'pause_turn' });
      expect(event).toEqual({ type: 'lifecycle', phase: 'paused' });
      expect(event).not.toEqual({ type: 'stop', reason: 'end-turn' });
    });
  });
});
