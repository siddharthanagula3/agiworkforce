import type { JsonValue } from './serde_json/JsonValue';

export type AgentEventToolExecutionEnd = {
  toolCallId: string;
  name: string;
  output: JsonValue;
  isError: boolean;
  elapsedMs?: number;
};
