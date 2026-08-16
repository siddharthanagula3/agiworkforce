import type { JsonValue } from './serde_json/JsonValue';

export type AppServerError = { code: number; message: string; data?: JsonValue };
