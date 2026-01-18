import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

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
  // Log error details
  logger.error(
    {
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      path: req.path,
      method: req.method,
    },
    'Request error',
  );

  // Determine status code
  const statusCode = err instanceof AppError ? err.statusCode : 500;

  // Determine error message
  const message =
    err instanceof AppError && err.isOperational ? err.message : 'Internal Server Error';

  // Send error response
  res.status(statusCode).json({
    error: message,
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
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.url} not found`,
  });
};
