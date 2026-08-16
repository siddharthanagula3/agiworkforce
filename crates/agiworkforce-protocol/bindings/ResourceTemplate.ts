import type { JsonValue } from './serde_json/JsonValue';

export type ResourceTemplate = {
  annotations?: JsonValue;
  uriTemplate: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
};
