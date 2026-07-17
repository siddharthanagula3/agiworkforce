import type { z } from 'zod';
import { createError } from '@/lib/errors';

/**
 * Parse a project API body with the shared Cloud contract while preserving a
 * field-specific, safe validation message for Web API callers.
 */
export function parseProjectRequest<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;

  const first = parsed.error.issues[0];
  const field = first?.path.join('.') || 'body';
  throw createError.validation(`${field}: ${first?.message ?? 'Invalid project request'}`, {
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}
