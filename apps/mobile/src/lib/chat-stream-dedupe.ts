/**
 * Reconnect dedupe for the mobile chat stream.
 *
 * Same rule as the web client's ledger: a stream's sequence counter restarts
 * with the connection, so a turn that reconnects mid-answer re-delivers events
 * the screen has already rendered and they are applied twice. The identity is
 * derived from session, turn and sequence, which are reproduced exactly when a
 * turn is replayed, rather than minted per emission, which a replay would not
 * reproduce.
 */

export interface StreamEventIdentity {
  sessionId: string;
  turnId: string;
  sequence: number;
}

export function chatStreamEventId(envelope: StreamEventIdentity): string {
  return `${envelope.sessionId}:${envelope.turnId}:${envelope.sequence}`;
}

export interface ChatStreamDedupe {
  /** True when this event has not been applied to this turn before. */
  admit(envelope: StreamEventIdentity): boolean;
  forget(turnId: string): void;
  readonly size: number;
}

export function createChatStreamDedupe(seen: Iterable<string> = []): ChatStreamDedupe {
  const applied = new Set(seen);
  return {
    admit(envelope) {
      const id = chatStreamEventId(envelope);
      if (applied.has(id)) return false;
      applied.add(id);
      return true;
    },
    forget(turnId) {
      for (const id of [...applied]) {
        if (id.includes(`:${turnId}:`)) applied.delete(id);
      }
    },
    get size() {
      return applied.size;
    },
  };
}
