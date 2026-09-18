import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';

/**
 * The stable identity of one streamed agent event.
 *
 * Deliberately derived, not minted. A random id per emission would be unique
 * and useless here: the thing a reconnect has to recognise is the SAME event
 * arriving twice, and two emissions of one event would carry two random ids and
 * be applied twice. Session, turn and sequence are already unique together and
 * are reproduced exactly when a turn is replayed, so the identity survives the
 * reconnect that has to use it.
 */
export function agentEventId(
  envelope: Pick<AgentEventEnvelope, 'sessionId' | 'turnId' | 'sequence'>,
): string {
  return `${envelope.sessionId}:${envelope.turnId}:${envelope.sequence}`;
}

/**
 * Applied-once bookkeeping for one turn's events.
 *
 * A stream keeps its own sequence counter, so it cannot tell a replay from a
 * continuation: the counter restarts with the connection. This is keyed on the
 * event identity instead, so a turn that reconnects mid-answer re-applies
 * nothing it has already rendered, and a genuinely new event still applies.
 */
export interface AgentEventLedger {
  /** True when this event has not been applied before. */
  admit(envelope: Pick<AgentEventEnvelope, 'sessionId' | 'turnId' | 'sequence'>): boolean;
  has(eventId: string): boolean;
  readonly size: number;
}

export function createAgentEventLedger(seen: Iterable<string> = []): AgentEventLedger {
  const applied = new Set(seen);
  return {
    admit(envelope) {
      const id = agentEventId(envelope);
      if (applied.has(id)) return false;
      applied.add(id);
      return true;
    },
    has(eventId) {
      return applied.has(eventId);
    },
    get size() {
      return applied.size;
    },
  };
}
