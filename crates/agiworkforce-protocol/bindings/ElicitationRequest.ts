import type { JsonValue } from './serde_json/JsonValue';

export type ElicitationRequest =
  | { mode: 'form'; _meta?: JsonValue; message: string; requested_schema: JsonValue }
  | { mode: 'url'; _meta?: JsonValue; message: string; url: string; elicitation_id: string };
