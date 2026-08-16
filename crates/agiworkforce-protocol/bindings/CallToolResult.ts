import type { JsonValue } from './serde_json/JsonValue';

export type CallToolResult = {
  content: Array<JsonValue>;
  structuredContent?: JsonValue;
  isError?: boolean;
  _meta?: JsonValue;
};
