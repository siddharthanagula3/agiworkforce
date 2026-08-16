import type { AppServerError } from './AppServerError';
import type { JsonValue } from './serde_json/JsonValue';

export type AppServerResponse = { id: JsonValue; result?: JsonValue; error?: AppServerError };
