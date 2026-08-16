import type { JsonValue } from './serde_json/JsonValue';

export type Tool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema: JsonValue;
  outputSchema?: JsonValue;
  annotations?: JsonValue;
  icons?: Array<JsonValue>;
  _meta?: JsonValue;
};
