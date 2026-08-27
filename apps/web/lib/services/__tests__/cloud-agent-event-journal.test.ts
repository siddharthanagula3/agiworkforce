import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentEvent, AgentEventEnvelope } from '@agiworkforce/types/protocol';

vi.mock('server-only', () => ({}));

const appendCloudAgentEvents = vi.fn(
  async (_db: unknown, _input: { envelopes: readonly AgentEventEnvelope[] }) => ({
    state: 'running',
  }),
);

vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  appendCloudAgentEvents: (db: unknown, input: unknown) =>
    appendCloudAgentEvents(db, input as { envelopes: readonly AgentEventEnvelope[] }),
}));

import { createCloudAgentEventJournal } from '../cloud-agent-event-journal';

const TARGET = {
  db: {} as never,
  userId: 'user-1',
  runId: '0190a000-0000-7000-8000-000000000001',
};

function envelope(sequence: number, event: AgentEvent): AgentEventEnvelope {
  return {
    schemaVersion: 4,
    sessionId: 'conversation-1',
    turnId: 'turn-1',
    sequence,
    emittedAtMs: 1_752_780_000_000 + sequence,
    event,
  };
}

function textDelta(sequence: number): AgentEventEnvelope {
  return envelope(sequence, { type: 'text-delta', delta: `chunk-${sequence}` });
}

function batchedEnvelopes(call: number): AgentEventEnvelope[] {
  const input = appendCloudAgentEvents.mock.calls[call]?.[1] as
    | { envelopes: AgentEventEnvelope[] }
    | undefined;
  return input?.envelopes ?? [];
}

beforeEach(() => {
  appendCloudAgentEvents.mockClear();
});

describe('cloud agent event journal', () => {
  it('holds streamed deltas back instead of writing one transaction per token', async () => {
    const journal = createCloudAgentEventJournal(TARGET);

    for (let sequence = 0; sequence < 10; sequence++) {
      await journal.append(textDelta(sequence));
    }

    expect(appendCloudAgentEvents).not.toHaveBeenCalled();

    await journal.flush();

    expect(appendCloudAgentEvents).toHaveBeenCalledOnce();
    expect(batchedEnvelopes(0)).toHaveLength(10);
  });

  it('writes a state change immediately, with the deltas ahead of it in the same batch', async () => {
    const journal = createCloudAgentEventJournal(TARGET);

    await journal.append(textDelta(0));
    await journal.append(textDelta(1));
    await journal.append(
      envelope(2, {
        type: 'task-state-changed',
        taskId: 'turn-1',
        state: 'ready_for_review',
        summary: 'Ready',
      }),
    );

    expect(appendCloudAgentEvents).toHaveBeenCalledOnce();
    const written = batchedEnvelopes(0);
    expect(written.map((item) => item.sequence)).toEqual([0, 1, 2]);
    expect(written.at(-1)?.event.type).toBe('task-state-changed');
  });

  it('flushes once the buffer fills, so a long answer cannot grow it without bound', async () => {
    const journal = createCloudAgentEventJournal(TARGET);

    for (let sequence = 0; sequence < 64; sequence++) {
      await journal.append(textDelta(sequence));
    }

    expect(appendCloudAgentEvents).toHaveBeenCalledOnce();
    expect(batchedEnvelopes(0)).toHaveLength(64);
  });

  it('reports the run state from the last write and writes nothing on an empty flush', async () => {
    appendCloudAgentEvents.mockResolvedValueOnce({ state: 'ready_for_review' });
    const journal = createCloudAgentEventJournal(TARGET);

    await journal.append(textDelta(0));
    const state = await journal.flush();

    expect(state).toBe('ready_for_review');
    expect(await journal.flush()).toBe('ready_for_review');
    expect(appendCloudAgentEvents).toHaveBeenCalledOnce();
  });

  // The failed batch is deliberately NOT retried: an append that throws must
  // reach the stream's own failure path, which is what marks the run failed.
  // Callers that would rather lose a few text deltas than strand a terminal
  // transition catch it themselves (see `transitionJournal`).
  it('surfaces a write failure to the caller and does not requeue the batch', async () => {
    appendCloudAgentEvents.mockRejectedValueOnce(new Error('journal unavailable'));
    const journal = createCloudAgentEventJournal(TARGET);

    await journal.append(textDelta(0));
    await expect(journal.flush()).rejects.toThrow(/journal unavailable/);

    appendCloudAgentEvents.mockClear();
    await journal.flush();
    expect(appendCloudAgentEvents).not.toHaveBeenCalled();
  });
});
