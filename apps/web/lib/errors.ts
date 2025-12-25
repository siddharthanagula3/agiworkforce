/**
 * Standardized error types and utilities for API routes
 */

export enum ErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',

  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',

  // Resource
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',

  // Server
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // External Services
  STRIPE_ERROR = 'STRIPE_ERROR',
  SUPABASE_ERROR = 'SUPABASE_ERROR',
}

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
  statusCode: number;
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 500,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON(): ApiError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      statusCode: this.statusCode,
    };
  }
}

// Error factory functions
export const createError = {
  unauthorized: (message = 'Unauthorized'): AppError =>
    new AppError(ErrorCode.UNAUTHORIZED, message, 401),

  forbidden: (message = 'Forbidden'): AppError => new AppError(ErrorCode.FORBIDDEN, message, 403),

  notFound: (message = 'Resource not found'): AppError =>
    new AppError(ErrorCode.NOT_FOUND, message, 404),

  validation: (message: string, details?: unknown): AppError =>
    new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details),

  conflict: (message: string): AppError => new AppError(ErrorCode.CONFLICT, message, 409),

  rateLimit: (message = 'Rate limit exceeded'): AppError =>
    new AppError(ErrorCode.RATE_LIMIT_EXCEEDED, message, 429),

  stripe: (message: string, details?: unknown): AppError =>
    new AppError(ErrorCode.STRIPE_ERROR, message, 502, details),

  supabase: (message: string, details?: unknown): AppError =>
    new AppError(ErrorCode.SUPABASE_ERROR, message, 502, details),

  internal: (message = 'Internal server error', details?: unknown): AppError =>
    new AppError(ErrorCode.INTERNAL_ERROR, message, 500, details),

  serviceUnavailable: (message = 'Service unavailable'): AppError =>
    new AppError(ErrorCode.SERVICE_UNAVAILABLE, message, 503),
};
