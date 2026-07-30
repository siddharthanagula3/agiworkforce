import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { getRequestId } from './requestContext';

/**
 * Custom error class for operational errors (expected errors)
 * vs programming errors (unexpected errors)
 */
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

function transportStatus(err: Error): number | undefined {
  const status = (err as Error & { status?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status <= 599 ? status : undefined;
}

/**
 * Global error handler middleware.
 * Must be defined last to catch errors from all previous middleware and route handlers.
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const requestId = getRequestId(res);

  // Handle Zod validation errors with a 400 response
  if (err instanceof z.ZodError) {
    logger.warn(
      {
        path: req.path,
        method: req.method,
        requestId,
        validationErrors: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      'Request validation failed',
    );

    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: err.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })),
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  // Log error details
  logger.error(
    {
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      path: req.path,
      method: req.method,
      requestId,
    },
    'Request error',
  );

  // Determine status code
  const statusCode = err instanceof AppError ? err.statusCode : (transportStatus(err) ?? 500);

  // Determine error message
  const message =
    err instanceof AppError && err.isOperational
      ? err.message
      : statusCode === 413
        ? 'Payload Too Large'
        : statusCode >= 400 && statusCode < 500
          ? 'Invalid Request'
          : 'Internal Server Error';

  // Send error response
  res.status(statusCode).json({
    error: message,
    ...(requestId ? { requestId } : {}),
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: err.message,
    }),
  });
};

/**
 * 404 handler for undefined routes
 */
export const notFoundHandler = (req: Request, res: Response) => {
  // Truncate and sanitize the reflected path to prevent log injection and content reflection
  const safePath = req.path.slice(0, 200).replace(/[^\w/.-]/g, '');
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${safePath} not found`,
    ...(getRequestId(res) ? { requestId: getRequestId(res) } : {}),
  });
};
