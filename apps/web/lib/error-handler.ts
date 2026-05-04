import { NextResponse } from 'next/server';
import { AppError, createError } from './errors';
import { logger } from './logger';

/**
 * WEB-10 (audit 2026-05-03): generic user-facing fallbacks per
 * status-code class. Several call sites construct AppError instances
 * by passing raw Supabase error messages (table names, constraint
 * violations, PGRST codes) which would otherwise propagate to the
 * client response body. We log the original message + details
 * server-side and return a safe summary to the caller.
 */
const GENERIC_MESSAGES: Record<number, string> = {
  400: 'Bad request',
  401: 'Authentication required',
  403: 'Access denied',
  404: 'Not found',
  408: 'Request timed out',
  409: 'Conflict',
  422: 'Validation failed',
  429: 'Too many requests',
  500: 'Internal server error',
  502: 'Upstream service error',
  503: 'Service temporarily unavailable',
};

/** A small set of error codes that are safe to render verbatim - these
 *  are app-defined (not service-leak vectors) and the UI uses them to
 *  drive recovery flows (e.g. credit_required → upgrade prompt). */
const SAFE_TO_EXPOSE_CODES = new Set<string>([
  'CREDIT_REQUIRED',
  'SUBSCRIPTION_REQUIRED',
  'RATE_LIMITED',
  'VALIDATION_ERROR',
  'INVALID_MODEL',
  'CSRF_REQUIRED',
]);

function safeErrorMessage(error: AppError): string {
  if (SAFE_TO_EXPOSE_CODES.has(error.code)) {
    return error.message;
  }
  return GENERIC_MESSAGES[error.statusCode] ?? 'Request failed';
}

/**
 * Error handler middleware for API routes
 */
export function handleError(error: unknown, requestId?: string): NextResponse {
  // Log the error
  if (error instanceof AppError) {
    logger.error(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          statusCode: error.statusCode,
        },
        requestId,
      },
      'API error',
    );

    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: safeErrorMessage(error),
          // WEB-10: only forward `details` when the code is safe to
          // expose - Supabase / SQL details are otherwise dropped.
          ...(error.details && SAFE_TO_EXPOSE_CODES.has(error.code)
            ? { details: error.details }
            : {}),
        },
        requestId,
      },
      { status: error.statusCode },
    );
  }

  // Handle Zod validation errors
  if (error && typeof error === 'object' && 'issues' in error) {
    const zodError = error as { issues: Array<{ path: (string | number)[]; message: string }> };
    const validationError = createError.validation(
      'Validation failed',
      zodError.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );

    logger.warn(
      {
        error: {
          code: validationError.code,
          message: validationError.message,
          details: validationError.details,
        },
        requestId,
      },
      'Validation error',
    );

    return NextResponse.json(
      {
        error: {
          code: validationError.code,
          message: validationError.message,
          details: validationError.details,
        },
        requestId,
      },
      { status: 400 },
    );
  }

  // Handle unknown errors
  const internalError = createError.internal(
    'An unexpected error occurred',
    process.env.NODE_ENV === 'development' ? String(error) : undefined,
  );

  logger.error(
    {
      error: {
        code: internalError.code,
        message: internalError.message,
        originalError: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      requestId,
    },
    'Unexpected error',
  );

  return NextResponse.json(
    {
      error: {
        code: internalError.code,
        message: internalError.message,
      },
      requestId,
    },
    { status: 500 },
  );
}

/**
 * Wrapper for API route handlers with error handling
 */
export function withErrorHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse | Response>,
) {
  return async (...args: T): Promise<NextResponse | Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      // Extract request ID from headers if available
      const request = args[0] as { headers?: { get?: (key: string) => string | null } } | undefined;
      const requestId = request?.headers?.get?.('x-request-id') || undefined;
      return handleError(error, requestId);
    }
  };
}
