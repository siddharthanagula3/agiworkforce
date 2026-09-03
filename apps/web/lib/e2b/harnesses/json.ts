import type { JsonValue } from '@agiworkforce/types/protocol';

export function toJsonValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return null;
  }
}
