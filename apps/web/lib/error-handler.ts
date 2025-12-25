import { NextResponse } from 'next/server';
import { AppError, createError } from './errors';
import { logger } from './logger';

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
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
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
  handler: (...args: T) => Promise<NextResponse>,
) {
  return async (...args: T): Promise<NextResponse> => {
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
