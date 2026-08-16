import type { JsonValue } from './serde_json/JsonValue';

export type AppServerRequest = { id: JsonValue; method: string; params?: JsonValue };
