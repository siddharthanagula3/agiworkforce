import type { AgentEventSource } from './AgentEventSource';

export type AgentEventSourceList = {
  toolCallId?: string;
  query?: string;
  sources: Array<AgentEventSource>;
};
