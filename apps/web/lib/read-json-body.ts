import 'server-only';

import { createError } from '@/lib/errors';

export async function readJsonBody<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw createError.validation('Invalid JSON body');
  }
}
