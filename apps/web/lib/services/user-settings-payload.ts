import 'server-only';

import { createError } from '@/lib/errors';

export function serializeUserSettings(settings: Record<string, unknown>): string {
  const serialized = JSON.stringify(settings);
  if (serialized.length > 100_000) {
    throw createError.validation('Settings payload is too large');
  }
  return serialized;
}
