import type { AgentEvent } from './AgentEvent';

export type AgentEventEnvelope = {
  schemaVersion: number;
  sessionId: string;
  turnId: string;
  sequence: number;
  emittedAtMs: number;
  event: AgentEvent;
};
