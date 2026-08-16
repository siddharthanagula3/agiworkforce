import type { JsonValue } from './serde_json/JsonValue';

export type McpInvocation = {
  server: string;
  tool: string;
  arguments: JsonValue | null;
};
