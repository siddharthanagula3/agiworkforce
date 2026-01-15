/**
 * Error Handling Utilities
 *
 * Shared error classes and utilities for consistent error handling.
 * These work with the error types defined in @agiworkforce/types.
 *
 * @module errors
 * @packageDocumentation
 */

import type {
  ApiError as ApiErrorType,
  FriendlyError as FriendlyErrorType,
} from '@agiworkforce/types';

// Re-export types for convenience
export type ApiError = ApiErrorType;
export type FriendlyError = FriendlyErrorType;

/**
 * Standardized error codes for API and application errors.
 *
 * Note: This is defined here (instead of imported from @agiworkforce/types)
 * to avoid isolatedModules re-export issues with enums.
 * The values are kept in sync with @agiworkforce/types/errors.
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
  TIMEOUT = 'TIMEOUT',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // External Services
  STRIPE_ERROR = 'STRIPE_ERROR',
  SUPABASE_ERROR = 'SUPABASE_ERROR',
  PGRST116 = 'PGRST116',

  // Network
  NETWORK_ERROR = 'NETWORK_ERROR',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
}

/**
 * Application error class with code, status, and details.
 *
 * Extends the built-in Error class with additional properties
 * for structured error handling.
 *
 * @example
 * ```typescript
 * throw new AppError(ErrorCode.VALIDATION_ERROR, 'Email is required', 400, { field: 'email' });
 * ```
 */
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

  /**
   * Convert to API error response format.
   */
  toJSON(): ApiError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      statusCode: this.statusCode,
    };
  }

  /**
   * Check if this error should be exposed to clients.
   * Internal errors should not leak implementation details.
   */
  isClientSafe(): boolean {
    return this.statusCode < 500;
  }
}

/**
 * Factory functions for creating common error types.
 *
 * @example
 * ```typescript
 * throw createError.unauthorized('Please sign in');
 * throw createError.notFound('User not found');
 * throw createError.validation('Invalid email', { field: 'email' });
 * ```
 */
export const createError = {
  /** Create an unauthorized (401) error */
  unauthorized: (message = 'Unauthorized'): AppError =>
    new AppError(ErrorCode.UNAUTHORIZED, message, 401),

  /** Create a forbidden (403) error */
  forbidden: (message = 'Forbidden'): AppError => new AppError(ErrorCode.FORBIDDEN, message, 403),

  /** Create a not found (404) error */
  notFound: (message = 'Resource not found'): AppError =>
    new AppError(ErrorCode.NOT_FOUND, message, 404),

  /** Create a validation (400) error */
  validation: (message: string, details?: unknown): AppError =>
    new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details),

  /** Create a conflict (409) error */
  conflict: (message: string): AppError => new AppError(ErrorCode.CONFLICT, message, 409),

  /** Create a rate limit (429) error */
  rateLimit: (message = 'Rate limit exceeded'): AppError =>
    new AppError(ErrorCode.RATE_LIMIT_EXCEEDED, message, 429),

  /** Create a Stripe (502) error */
  stripe: (message: string, details?: unknown): AppError =>
    new AppError(ErrorCode.STRIPE_ERROR, message, 502, details),

  /** Create a Supabase (502) error */
  supabase: (message: string, details?: unknown): AppError =>
    new AppError(ErrorCode.SUPABASE_ERROR, message, 502, details),

  /** Create an internal server (500) error */
  internal: (message = 'Internal server error', details?: unknown): AppError =>
    new AppError(ErrorCode.INTERNAL_ERROR, message, 500, details),

  /** Create a service unavailable (503) error */
  serviceUnavailable: (message = 'Service unavailable'): AppError =>
    new AppError(ErrorCode.SERVICE_UNAVAILABLE, message, 503),

  /** Create a timeout (504) error */
  timeout: (message = 'Operation timed out'): AppError =>
    new AppError(ErrorCode.TIMEOUT, message, 504),

  /** Create a network error */
  network: (message = 'Network error'): AppError =>
    new AppError(ErrorCode.NETWORK_ERROR, message, 503),

  /** Create a payload too large (413) error */
  payloadTooLarge: (message = 'Payload too large'): AppError =>
    new AppError(ErrorCode.PAYLOAD_TOO_LARGE, message, 413),
};

/**
 * Type guard to check if a value is an AppError.
 *
 * @param error - Value to check
 * @returns Whether the value is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Convert any error to an AppError.
 *
 * @param error - Error to convert
 * @returns AppError instance
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return createError.internal(error.message);
  }

  return createError.internal(String(error));
}

/**
 * Convert an error message to a user-friendly format.
 *
 * @param error - Error or error message
 * @returns User-friendly error information
 *
 * @example
 * ```typescript
 * const friendly = getFriendlyError(new Error('fetch failed'));
 * // { title: 'Connection Problem', message: "We couldn't connect...", ... }
 * ```
 */
export function getFriendlyError(error: Error | string): FriendlyError {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorLower = errorMessage.toLowerCase();

  // Network errors
  if (
    errorLower.includes('network') ||
    errorLower.includes('fetch') ||
    errorLower.includes('econnrefused') ||
    errorLower.includes('etimedout')
  ) {
    return {
      title: 'Connection Problem',
      message: "We couldn't connect to our servers right now.",
      suggestion: 'Please check your internet connection and try again.',
      icon: 'network',
    };
  }

  // Timeout errors
  if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
    return {
      title: 'Taking Too Long',
      message: 'The request is taking longer than expected.',
      suggestion: 'Please try again in a moment. If this continues, try a shorter request.',
      icon: 'warning',
    };
  }

  // Authentication errors
  if (
    errorLower.includes('401') ||
    errorLower.includes('unauthorized') ||
    errorLower.includes('auth')
  ) {
    return {
      title: 'Sign In Required',
      message: 'You need to sign in to continue.',
      suggestion: 'Please sign out and sign back in to refresh your session.',
      icon: 'auth',
    };
  }

  // Rate limit errors
  if (errorLower.includes('429') || errorLower.includes('rate limit')) {
    return {
      title: 'Slow Down',
      message: "You're sending requests too quickly.",
      suggestion: 'Please wait a moment before trying again.',
      icon: 'warning',
    };
  }

  // Payment/billing errors
  if (
    errorLower.includes('billing') ||
    errorLower.includes('payment') ||
    errorLower.includes('credits') ||
    errorLower.includes('quota')
  ) {
    return {
      title: 'Usage Limit Reached',
      message: "You've used up your available credits for now.",
      suggestion: 'You can upgrade your plan or wait until your credits refresh.',
      icon: 'payment',
    };
  }

  // Server errors (5xx)
  if (
    errorLower.includes('500') ||
    errorLower.includes('server error') ||
    errorLower.includes('internal')
  ) {
    return {
      title: 'Something Went Wrong',
      message: "We're experiencing technical difficulties.",
      suggestion: 'Our team has been notified. Please try again in a few minutes.',
      icon: 'error',
    };
  }

  // Default fallback
  return {
    title: 'Something Went Wrong',
    message: "We weren't able to complete your request.",
    suggestion: 'Please try again. If this keeps happening, try restarting the app.',
    icon: 'error',
  };
}

/**
 * Format an error for display in a chat interface.
 *
 * @param error - Error or error message
 * @param isSimpleMode - Whether to use simplified messaging
 * @returns Formatted error string
 */
export function formatErrorForChat(error: Error | string, isSimpleMode: boolean): string {
  if (!isSimpleMode) {
    const errorMessage = typeof error === 'string' ? error : error.message;
    return `Error: ${errorMessage}`;
  }

  const friendly = getFriendlyError(error);

  let formatted = `**${friendly.title}**\n\n${friendly.message}`;
  if (friendly.suggestion) {
    formatted += `\n\n${friendly.suggestion}`;
  }

  return formatted;
}

/**
 * Safely extract error message from unknown error type.
 *
 * @param error - Unknown error value
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * Wrap an async function with error handling.
 *
 * @param fn - Async function to wrap
 * @param errorHandler - Custom error handler
 * @returns Wrapped function
 *
 * @example
 * ```typescript
 * const safeFetch = withErrorHandling(
 *   async (url: string) => fetch(url).then(r => r.json()),
 *   (error) => console.error('Fetch failed:', error)
 * );
 * ```
 */
export function withErrorHandling<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  errorHandler?: (error: unknown) => void,
): (...args: TArgs) => Promise<TResult | null> {
  return async (...args: TArgs): Promise<TResult | null> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (errorHandler) {
        errorHandler(error);
      }
      return null;
    }
  };
}
