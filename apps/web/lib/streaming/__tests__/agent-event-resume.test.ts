import { describe, expect, it } from 'vitest';
import type { AgentEvent, AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { AgentEventEnvelopeSchema, parseAgentEventDelta } from '@agiworkforce/cloud-contracts';
import {
  createAgentEventStreamEmitter,
  type AgentEventStreamEmitter,
} from '@/app/api/llm/v1/chat/completions/lib/agent-event-stream';

import { agentEventId, createAgentEventLedger } from '../agent-event-id';

const SESSION_ID = 'conversation-resume';
const TURN_ID = 'turn-resume';

function emitter(initialSequence?: number): AgentEventStreamEmitter {
  return createAgentEventStreamEmitter({
    sessionId: SESSION_ID,
    turnId: TURN_ID,
    responseModel: 'fixture-model',
    ...(initialSequence !== undefined ? { initialSequence } : {}),
    now: () => 1_752_000_000_000 + (initialSequence ?? 0),
  });
}

const TURN: AgentEvent[] = [
  { type: 'lifecycle', phase: 'started' },
  { type: 'text-delta', delta: 'An ' },
  { type: 'text-delta', delta: 'answer ' },
  { type: 'text-delta', delta: 'in parts.' },
  { type: 'usage', outputTokens: 4 },
  { type: 'stop', reason: 'end-turn' },
];

function envelopeOf(sse: string): AgentEventEnvelope {
  const payload = JSON.parse(sse.slice('data: '.length)) as {
    choices: Array<{ delta: { x_agent_event: unknown } }>;
  };
  const envelope = parseAgentEventDelta(payload.choices[0]?.delta.x_agent_event);
  if (!envelope) throw new Error('the frame carried no readable agent event');
  return envelope;
}

describe('resuming an agent event stream from the last applied event', () => {
  it('delivers every event exactly once across a reconnect that replays the cursor', () => {
    const ledger = createAgentEventLedger();
    const applied: AgentEventEnvelope[] = [];

    const first = emitter();
    const firstLeg = TURN.map((event) => envelopeOf(first.emit(event)));
    const DELIVERED_BEFORE_THE_DROP = 4;
    for (const envelope of firstLeg.slice(0, DELIVERED_BEFORE_THE_DROP)) {
      if (ledger.admit(envelope)) applied.push(envelope);
    }

    // The client resumes from the last event it applied, so the server replays
    // that one too: the cursor names what was rendered, not what comes next.
    const cursor = applied[applied.length - 1]?.sequence ?? 0;
    const second = emitter(cursor);
    const secondLeg = TURN.slice(cursor).map((event) => envelopeOf(second.emit(event)));
    for (const envelope of secondLeg) {
      if (ledger.admit(envelope)) applied.push(envelope);
    }

    expect(applied.map((envelope) => envelope.sequence)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(applied.map((envelope) => agentEventId(envelope))).toEqual([
      ...new Set(applied.map((envelope) => agentEventId(envelope))),
    ]);
    expect(
      applied
        .map((envelope) => envelope.event)
        .filter(
          (event): event is Extract<AgentEvent, { type: 'text-delta' }> =>
            event.type === 'text-delta',
        )
        .map((event) => event.delta)
        .join(''),
    ).toBe('An answer in parts.');
    expect(applied[applied.length - 1]?.event).toEqual({ type: 'stop', reason: 'end-turn' });
  });

  it('refuses a whole replayed turn when the client already applied all of it', () => {
    const ledger = createAgentEventLedger();
    const first = emitter();
    const firstLeg = TURN.map((event) => envelopeOf(first.emit(event)));
    expect(firstLeg.every((envelope) => ledger.admit(envelope))).toBe(true);

    const second = emitter();
    const replay = TURN.map((event) => envelopeOf(second.emit(event)));
    expect(replay.some((envelope) => ledger.admit(envelope))).toBe(false);
    expect(ledger.size).toBe(TURN.length);
  });

  it('keeps a retry of the same conversation apart from the turn it replaces', () => {
    const ledger = createAgentEventLedger();
    const original = emitter();
    for (const event of TURN) ledger.admit(envelopeOf(original.emit(event)));

    const retry = createAgentEventStreamEmitter({
      sessionId: SESSION_ID,
      turnId: 'turn-retry',
      responseModel: 'fixture-model',
      now: () => 1_752_000_000_001,
    });
    const retried = TURN.map((event) => envelopeOf(retry.emit(event)));

    expect(retried.every((envelope) => ledger.admit(envelope))).toBe(true);
  });

  it('stamps every field a client needs to order, resume and version the stream', () => {
    const stream = emitter();
    const envelopes = TURN.map((event) => envelopeOf(stream.emit(event)));

    for (const [index, envelope] of envelopes.entries()) {
      expect(AgentEventEnvelopeSchema.safeParse(envelope).success).toBe(true);
      expect(Object.keys(envelope).sort()).toEqual([
        'emittedAtMs',
        'event',
        'schemaVersion',
        'sequence',
        'sessionId',
        'turnId',
      ]);
      expect(envelope.sessionId).toBe(SESSION_ID);
      expect(envelope.turnId).toBe(TURN_ID);
      expect(envelope.sequence).toBe(index);
      expect(agentEventId(envelope)).toBe(`${SESSION_ID}:${TURN_ID}:${index}`);
    }

    expect(stream.lastEventId()).toBe(agentEventId(envelopes[envelopes.length - 1]!));
    expect(stream.nextSequence()).toBe(TURN.length);
  });

  it('never reuses an identity across two turns of one conversation', () => {
    const ids = new Set<string>();
    for (const turnId of ['turn-a', 'turn-b']) {
      const stream = createAgentEventStreamEmitter({
        sessionId: SESSION_ID,
        turnId,
        responseModel: 'fixture-model',
        now: () => 1,
      });
      for (const event of TURN) ids.add(agentEventId(envelopeOf(stream.emit(event))));
    }

    expect(ids.size).toBe(TURN.length * 2);
  });
});
