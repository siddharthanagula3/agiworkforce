import type { JsonValue } from './serde_json/JsonValue';

export type DynamicToolCallRequest = {
  callId: string;
  turnId: string;
  namespace: string | null;
  tool: string;
  arguments: JsonValue;
};
