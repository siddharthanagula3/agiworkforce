import { describe, expect, it } from 'vitest';

import { agentEventId, createAgentEventLedger } from '../agent-event-id';

const envelope = (sequence: number, turnId = 'turn-1') => ({
  sessionId: 'session-1',
  turnId,
  sequence,
});

describe('agentEventId', () => {
  it('is reproduced by a replay of the same event', () => {
    expect(agentEventId(envelope(7))).toBe(agentEventId(envelope(7)));
    expect(agentEventId(envelope(7))).not.toBe(agentEventId(envelope(8)));
    expect(agentEventId(envelope(7, 'turn-1'))).not.toBe(agentEventId(envelope(7, 'turn-2')));
  });
});

describe('the applied-event ledger', () => {
  it('refuses a replayed event although its sequence looks new to a fresh stream', () => {
    const ledger = createAgentEventLedger();
    expect([0, 1, 2].map((sequence) => ledger.admit(envelope(sequence)))).toEqual([
      true,
      true,
      true,
    ]);
    expect([0, 1, 2].map((sequence) => ledger.admit(envelope(sequence)))).toEqual([
      false,
      false,
      false,
    ]);
    expect(ledger.admit(envelope(3))).toBe(true);
  });

  it('keeps two turns apart when the second restarts its sequence', () => {
    const ledger = createAgentEventLedger();
    ledger.admit(envelope(0, 'turn-1'));
    expect(ledger.admit(envelope(0, 'turn-2'))).toBe(true);
  });

  it('can be seeded with what an earlier connection applied', () => {
    const ledger = createAgentEventLedger([agentEventId(envelope(0))]);
    expect(ledger.has(agentEventId(envelope(0)))).toBe(true);
    expect(ledger.admit(envelope(0))).toBe(false);
    expect(ledger.admit(envelope(1))).toBe(true);
    expect(ledger.size).toBe(2);
  });
});
