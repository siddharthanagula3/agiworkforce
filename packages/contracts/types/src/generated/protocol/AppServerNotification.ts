import type { JsonValue } from './serde_json/JsonValue';

export type AppServerNotification = { method: string; params?: JsonValue };
