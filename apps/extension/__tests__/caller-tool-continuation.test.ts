import { describe, expect, it } from 'vitest';
import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/cloud-contracts';
import type { AgentEvent, AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { createCallerToolContinuationReader } from '../src/features/computer-use/toolHandoff';
import { getBrowserToolDefinitions } from '../src/features/computer-use/browserToolDefinitions';

const runId = '11111111-1111-4111-8111-111111111111';
const calls = [
  { id: 'read', type: 'function' as const, function: { name: 'read_dom', arguments: '{}' } },
  { id: 'click', type: 'function' as const, function: { name: 'click', arguments: '{"index":3}' } },
];
const tools = getBrowserToolDefinitions(false);
function envelope(sequence: number, event: AgentEvent): AgentEventEnvelope {
  return {
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    sessionId: 'session',
    turnId: 'turn',
    sequence,
    emittedAtMs: sequence,
    event,
  };
}
function boundary(start = 5) {
  return [
    envelope(start, {
      type: 'caller-tools-requested',
      calls: structuredClone(calls),
      nextEventSequence: start + 3,
    }),
    envelope(start + 1, {
      type: 'task-state-changed',
      taskId: 'turn',
      state: 'awaiting_input',
      summary: 'Browser actions',
    }),
    envelope(start + 2, { type: 'lifecycle', phase: 'paused' }),
  ];
}

describe('durable caller-action boundary', () => {
  it('waits for the complete persisted boundary before returning executable local calls', () => {
    const reader = createCallerToolContinuationReader(tools);
    const events = boundary();
    reader.observe(events[0]!);
    expect(reader.read(runId)).toBeNull();
    expect(reader.incomplete()).toBe(true);
    reader.observe(events[1]!);
    expect(reader.read(runId)).toBeNull();
    reader.observe(events[2]!);
    expect(reader.incomplete()).toBe(false);
    expect(reader.read(runId)).toEqual({
      schema_version: AGENT_EVENT_SCHEMA_VERSION,
      run_id: runId,
      turn_id: 'turn',
      next_event_sequence: 8,
      calls,
    });
  });

  it('accepts identical replayed envelopes without duplicating calls', () => {
    const reader = createCallerToolContinuationReader(tools);
    for (const event of boundary()) {
      reader.observe(event);
      reader.observe(structuredClone(event));
    }
    expect(reader.read(runId)?.calls).toEqual(calls);
  });

  it('rejects a hosted sibling rather than expanding local capability', () => {
    const reader = createCallerToolContinuationReader(tools);
    expect(() =>
      reader.observe(
        envelope(5, {
          type: 'caller-tools-requested',
          nextEventSequence: 8,
          calls: [
            ...calls,
            { id: 'hosted', type: 'function', function: { name: 'web_search', arguments: '{}' } },
          ],
        }),
      ),
    ).toThrow();
  });

  it.each([
    {
      label: 'cursor',
      events: [envelope(5, { type: 'caller-tools-requested', calls, nextEventSequence: 9 })],
    },
    {
      label: 'sequence gap',
      events: [boundary()[0]!, envelope(7, { type: 'lifecycle', phase: 'paused' })],
    },
    {
      label: 'wrong state',
      events: [
        boundary()[0]!,
        envelope(6, {
          type: 'task-state-changed',
          taskId: 'turn',
          state: 'completed',
          summary: 'Wrong state',
        }),
      ],
    },
    {
      label: 'wrong task',
      events: [
        boundary()[0]!,
        envelope(6, {
          type: 'task-state-changed',
          taskId: 'another-turn',
          state: 'awaiting_input',
          summary: 'Wrong task',
        }),
      ],
    },
    {
      label: 'wrong turn',
      events: [boundary()[0]!, { ...boundary()[1]!, turnId: 'another-turn' }],
    },
    {
      label: 'wrong session',
      events: [boundary()[0]!, { ...boundary()[1]!, sessionId: 'another-session' }],
    },
  ])('refuses an invalid boundary: $label', ({ events }) => {
    const reader = createCallerToolContinuationReader(tools);
    expect(() => {
      for (const event of events) reader.observe(event);
    }).toThrow();
  });

  it('refuses conflicting content at an already observed sequence', () => {
    const reader = createCallerToolContinuationReader(tools);
    reader.observe(boundary()[0]!);
    expect(() =>
      reader.observe(
        envelope(5, {
          type: 'caller-tools-requested',
          nextEventSequence: 8,
          calls: [{ ...calls[0]!, function: { name: 'read_dom', arguments: '{"changed":true}' } }],
        }),
      ),
    ).toThrow();
  });

  it.each(['running', 'cancelled'] as const)(
    'retires a checkpoint superseded by a %s event and ignores stale replay',
    (state) => {
      const reader = createCallerToolContinuationReader(tools);
      for (const event of boundary()) reader.observe(event);
      expect(reader.read(runId)).not.toBeNull();
      reader.observe(
        envelope(8, { type: 'task-state-changed', taskId: 'turn', state, summary: 'Run advanced' }),
      );
      for (const event of boundary()) reader.observe(event);
      expect(reader.read(runId)).toBeNull();
    },
  );

  it('keeps a later checkpoint distinct even when provider call ids repeat', () => {
    const reader = createCallerToolContinuationReader(tools);
    for (const event of boundary()) reader.observe(event);
    const first = reader.read(runId);
    reader.observe(envelope(8, { type: 'lifecycle', phase: 'resumed' }));
    for (const event of boundary(12)) reader.observe(event);
    expect(reader.read(runId)?.calls).toEqual(first?.calls);
    expect(reader.read(runId)?.next_event_sequence).toBe(15);
    expect(first?.next_event_sequence).toBe(8);
  });

  it('requires an owned run handle and returns detached call data', () => {
    const reader = createCallerToolContinuationReader(tools);
    for (const event of boundary()) reader.observe(event);
    expect(() => reader.read(undefined)).toThrow();
    reader.read(runId)!.calls[0]!.function.name = 'changed';
    expect(reader.read(runId)?.calls).toEqual(calls);
  });
});
