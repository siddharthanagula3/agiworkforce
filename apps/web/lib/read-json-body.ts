import 'server-only';

import type { z } from 'zod';

import { createError } from '@/lib/errors';

export async function readJsonBody<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw createError.validation('Invalid JSON body');
  }
}

export async function readValidatedJsonBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
  invalidMessage: string,
): Promise<z.infer<Schema>> {
  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success) throw createError.validation(invalidMessage, parsed.error.issues);
  return parsed.data;
}
