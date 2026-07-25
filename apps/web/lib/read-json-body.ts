import 'server-only';

import { createError } from '@/lib/errors';

/**
 * Parse a JSON request body, converting a malformed payload into a 400 rather
 * than a 500.
 *
 * AUDIT-FIX STB-17. A bare `await request.json()` throws a `SyntaxError`, which
 * is not an AppError and carries no `.issues`, so the shared error handler falls
 * through to its unknown branch: HTTP 500 INTERNAL_ERROR plus a logger.error
 * carrying the full stack. That turns `POST {` into an authenticated crash-only
 * DoS and an error-log flood. 66 of 79 body-reading handlers already wrapped the
 * call correctly; this centralises that pattern so the next handler gets it for
 * free.
 *
 * Callers that need field validation should still run their schema against the
 * result — this only guarantees the body was syntactically valid JSON.
 */
export async function readJsonBody<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw createError.validation('Invalid JSON body');
  }
}
