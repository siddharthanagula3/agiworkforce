import type { JsonValue } from './serde_json/JsonValue';

export type AgentEventServerToolResult = {
  toolUseId: string;
  payload: JsonValue;
  isError?: boolean;
};
