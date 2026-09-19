import { describe, expect, it, vi } from 'vitest';
import {
  INITIAL_STREAM_SEQUENCE_STATE,
  STREAM_ENVELOPE_SCHEMA_VERSION,
  inspectStreamSequence,
  isStreamEnvelope,
  type StreamEnvelope,
} from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

const { buildTurnResumeStream, createStreamEnvelopeStamper, withStreamEnvelope } =
  await import('./stream-envelope');

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const TURN_ID = '22222222-2222-4222-8222-222222222222';

function sourceOf(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

function envelopesOf(wire: string): StreamEnvelope[] {
  return wire
    .split('\n')
    .filter((line) => line.startsWith('data: ') && !line.includes('[DONE]'))
    .map((line) => JSON.parse(line.slice(6)) as { envelope?: unknown })
    .flatMap((frame) => (isStreamEnvelope(frame.envelope) ? [frame.envelope] : []));
}

function chunkFrame(delta: Record<string, unknown>): string {
  return `data: ${JSON.stringify({
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta, finish_reason: null }],
  })}\n\n`;
}

const context = {
  conversationId: CONVERSATION_ID,
  turnId: TURN_ID,
  now: () => 1_700_000_000_000,
  newEventId: (() => {
    let n = 0;
    return () => `event-${(n += 1)}`;
  })(),
};

describe('withStreamEnvelope', () => {
  it('stamps every chunk type with a schema version, event id, sequence and timestamp', async () => {
    const wire = await readAll(
      withStreamEnvelope(
        sourceOf([
          chunkFrame({ role: 'assistant' }),
          chunkFrame({ content: 'hello' }),
          chunkFrame({ x_thinking: 'considering' }),
          chunkFrame({ tool_calls: [{ id: 'call_1', function: { name: 'search' } }] }),
          chunkFrame({ x_tool_result: { tool_call_id: 'call_1', content: 'ok' } }),
          chunkFrame({ x_generated_files: [] }),
          chunkFrame({ x_agent_event: { type: 'progress-update' } }),
          `data: ${JSON.stringify({ error: { message: 'upstream said no' } })}\n\n`,
          'data: [DONE]\n\n',
        ]),
        { ...context },
      ),
    );

    const envelopes = envelopesOf(wire);
    expect(envelopes).toHaveLength(8);
    for (const envelope of envelopes) {
      expect(envelope.schemaVersion).toBe(STREAM_ENVELOPE_SCHEMA_VERSION);
      expect(envelope.eventId).toMatch(/^event-\d+$/);
      expect(envelope.emittedAt).toBe(1_700_000_000_000);
      expect(envelope.conversationId).toBe(CONVERSATION_ID);
      expect(envelope.turnId).toBe(TURN_ID);
    }
    expect(envelopes.map((envelope) => envelope.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(envelopes[3]?.toolInvocationId).toBe('call_1');
    expect(envelopes[4]?.toolInvocationId).toBe('call_1');
    expect(wire).toContain('data: [DONE]');
  });

  it('leaves the terminator, comments and unparseable frames byte for byte', async () => {
    const wire = await readAll(
      withStreamEnvelope(sourceOf([': keepalive\n\n', 'data: not-json\n\n', 'data: [DONE]\n\n']), {
        ...context,
      }),
    );
    expect(wire).toBe(': keepalive\n\ndata: not-json\n\ndata: [DONE]\n\n');
  });

  it('carries an unknown future chunk type through unchanged apart from the envelope', async () => {
    const wire = await readAll(
      withStreamEnvelope(
        sourceOf([`data: ${JSON.stringify({ type: 'quantum-delta', payload: { a: 1 } })}\n\n`]),
        {
          ...context,
        },
      ),
    );
    const frame = JSON.parse(wire.slice('data: '.length).trim()) as Record<string, unknown>;
    expect(frame['type']).toBe('quantum-delta');
    expect(frame['payload']).toEqual({ a: 1 });
    expect(isStreamEnvelope(frame['envelope'])).toBe(true);
  });

  it('keeps the sequence unbroken when a frame is split across reads', async () => {
    const frame = chunkFrame({ content: 'split' });
    const half = Math.floor(frame.length / 2);
    const wire = await readAll(
      withStreamEnvelope(
        sourceOf([frame.slice(0, half), frame.slice(half), chunkFrame({ content: 'second' })]),
        { ...context },
      ),
    );
    expect(envelopesOf(wire).map((envelope) => envelope.sequence)).toEqual([1, 2]);
  });

  it('continues the count from a cursor so a resumed leg never repeats a sequence', () => {
    const stamper = createStreamEnvelopeStamper({ ...context, startSequence: 7 });
    const stamped = JSON.parse(stamper.stamp(JSON.stringify({ choices: [] }))) as {
      envelope: StreamEnvelope;
    };
    expect(stamped.envelope.sequence).toBe(8);
    expect(stamper.lastSequence).toBe(8);
  });

  it('never stamps a frame twice', () => {
    const stamper = createStreamEnvelopeStamper({ ...context });
    const once = stamper.stamp(JSON.stringify({ choices: [] }));
    expect(stamper.stamp(once)).toBe(once);
    expect(stamper.lastSequence).toBe(1);
  });
});

describe('buildTurnResumeStream', () => {
  it('replays only the remainder and finishes, continuing the cursor sequence', async () => {
    const wire = await readAll(
      buildTurnResumeStream({
        content: ' and the rest',
        model: 'model-under-test',
        completionId: 'chatcmpl-resume-1',
        finishReason: 'stop',
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        startSequence: 12,
        created: 1_700_000_000,
        now: () => 1_700_000_000_000,
        newEventId: (() => {
          let n = 0;
          return () => `resume-${(n += 1)}`;
        })(),
      }),
    );

    expect(wire).toContain('"content":" and the rest"');
    expect(wire.endsWith('data: [DONE]\n\n')).toBe(true);
    expect(envelopesOf(wire).map((envelope) => envelope.sequence)).toEqual([13, 14]);
  });

  it('emits only the finish frame when the client already has every character', async () => {
    const wire = await readAll(
      buildTurnResumeStream({
        content: '',
        model: 'model-under-test',
        completionId: 'chatcmpl-resume-2',
        finishReason: 'stopped',
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        startSequence: 4,
      }),
    );
    expect(wire).not.toContain('"content"');
    expect(wire).toContain('"finish_reason":"stopped"');
    expect(envelopesOf(wire).map((envelope) => envelope.sequence)).toEqual([5]);
  });
});

describe('inspectStreamSequence', () => {
  const envelope = (sequence: number): StreamEnvelope => ({
    schemaVersion: STREAM_ENVELOPE_SCHEMA_VERSION,
    eventId: `e-${sequence}`,
    sequence,
    emittedAt: 1,
  });

  it('reads an unstamped stream as unsequenced rather than broken', () => {
    const state = inspectStreamSequence(INITIAL_STREAM_SEQUENCE_STATE, null);
    expect(state.verdict).toBe('unsequenced');
    expect(state.lastSequence).toBeNull();
  });

  it('names a duplicate and a gap, and counts what the gap skipped', () => {
    let state = inspectStreamSequence(INITIAL_STREAM_SEQUENCE_STATE, envelope(1));
    expect(state.verdict).toBe('in-order');
    state = inspectStreamSequence(state, envelope(2));
    expect(state.verdict).toBe('in-order');
    state = inspectStreamSequence(state, envelope(2));
    expect(state.verdict).toBe('duplicate');
    expect(state.lastSequence).toBe(2);
    state = inspectStreamSequence(state, envelope(6));
    expect(state.verdict).toBe('gap');
    expect(state.missing).toBe(3);
    expect(state.lastSequence).toBe(6);
  });

  it('refuses a malformed envelope', () => {
    expect(isStreamEnvelope({ schemaVersion: 1, eventId: '', sequence: 1, emittedAt: 1 })).toBe(
      false,
    );
    expect(isStreamEnvelope({ schemaVersion: 1, eventId: 'e', sequence: 0, emittedAt: 1 })).toBe(
      false,
    );
  });
});
