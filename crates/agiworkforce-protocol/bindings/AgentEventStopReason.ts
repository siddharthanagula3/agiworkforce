export type AgentEventStopReason =
  | 'end-turn'
  | 'max-tokens'
  | 'tool-use'
  | 'stop-sequence'
  | 'refusal'
  | 'cancelled'
  | 'error';
