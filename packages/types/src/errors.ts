/**
 * Error Types
 *
 * Standardized error types and codes used across all applications.
 * These provide consistent error handling and reporting.
 *
 * @module errors
 * @packageDocumentation
 */

/**
 * Standardized error codes for API and application errors.
 *
 * Organized by category:
 * - Authentication/Authorization: UNAUTHORIZED, FORBIDDEN
 * - Validation: VALIDATION_ERROR, INVALID_INPUT
 * - Resources: NOT_FOUND, CONFLICT
 * - Server: INTERNAL_ERROR, SERVICE_UNAVAILABLE, TIMEOUT
 * - Rate Limiting: RATE_LIMIT_EXCEEDED
 * - External Services: STRIPE_ERROR, SUPABASE_ERROR
 * - Network: NETWORK_ERROR, PAYLOAD_TOO_LARGE
 *
 * Using const object pattern for isolatedModules compatibility.
 */
export const ErrorCode = {
  // Authentication & Authorization
  /** User is not authenticated */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** User lacks required permissions */
  FORBIDDEN: 'FORBIDDEN',

  // Validation
  /** Request validation failed */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** Invalid input data */
  INVALID_INPUT: 'INVALID_INPUT',

  // Resource
  /** Requested resource not found */
  NOT_FOUND: 'NOT_FOUND',
  /** Resource conflict (e.g., duplicate) */
  CONFLICT: 'CONFLICT',

  // Server
  /** Internal server error */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  /** Service temporarily unavailable */
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  /** Operation timed out */
  TIMEOUT: 'TIMEOUT',

  // Rate Limiting
  /** Rate limit exceeded */
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // External Services
  /** Stripe API error */
  STRIPE_ERROR: 'STRIPE_ERROR',
  /** Supabase API error */
  SUPABASE_ERROR: 'SUPABASE_ERROR',
  /** Supabase "no rows" error */
  PGRST116: 'PGRST116',

  // Network
  /** Network connection error */
  NETWORK_ERROR: 'NETWORK_ERROR',
  /** Request payload too large */
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  /** Invalid response from server */
  INVALID_RESPONSE: 'INVALID_RESPONSE',
} as const;

/** Type for error codes - matches the values in the ErrorCode object */
export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Standard API error response format.
 *
 * @example
 * ```typescript
 * const error: ApiError = {
 *   code: ErrorCode.VALIDATION_ERROR,
 *   message: 'Email is required',
 *   statusCode: 400,
 *   details: { field: 'email' },
 * };
 * ```
 */
export interface ApiError {
  /** Error code for programmatic handling */
  code: ErrorCodeValue;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: unknown;
  /** HTTP status code */
  statusCode: number;
}

/**
 * Error with a code property for categorization.
 */
export interface CodedError extends Error {
  code: string;
}

/**
 * Type guard to check if an error has a code property.
 *
 * @param error - Value to check
 * @returns Whether the value is a CodedError
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   if (isCodedError(error)) {
 *     console.log('Error code:', error.code);
 *   }
 * }
 * ```
 */
export function isCodedError(error: unknown): error is CodedError {
  return (
    error instanceof Error && 'code' in error && typeof (error as CodedError).code === 'string'
  );
}

/**
 * Map of HTTP status codes to error codes.
 */
export const HTTP_STATUS_TO_ERROR_CODE: Record<number, ErrorCodeValue> = {
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  413: ErrorCode.PAYLOAD_TOO_LARGE,
  429: ErrorCode.RATE_LIMIT_EXCEEDED,
  500: ErrorCode.INTERNAL_ERROR,
  502: ErrorCode.SERVICE_UNAVAILABLE,
  503: ErrorCode.SERVICE_UNAVAILABLE,
  504: ErrorCode.TIMEOUT,
};

/**
 * Map of error codes to HTTP status codes.
 */
export const ERROR_CODE_TO_HTTP_STATUS: Record<ErrorCodeValue, number> = {
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.TIMEOUT]: 504,
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCode.STRIPE_ERROR]: 502,
  [ErrorCode.SUPABASE_ERROR]: 502,
  [ErrorCode.PGRST116]: 404,
  [ErrorCode.NETWORK_ERROR]: 503,
  [ErrorCode.PAYLOAD_TOO_LARGE]: 413,
  [ErrorCode.INVALID_RESPONSE]: 502,
};

/**
 * User-friendly error information.
 */
export interface FriendlyError {
  /** Short title for the error */
  title: string;
  /** Detailed message explaining the error */
  message: string;
  /** Suggested action for the user */
  suggestion?: string;
  /** Icon category for UI display */
  icon?: 'error' | 'warning' | 'info' | 'network' | 'payment' | 'auth';
}

/**
 * Map of error codes to user-friendly messages.
 */
export const FRIENDLY_ERROR_MESSAGES: Record<ErrorCodeValue, FriendlyError> = {
  [ErrorCode.UNAUTHORIZED]: {
    title: 'Sign In Required',
    message: 'You need to sign in to continue.',
    suggestion: 'Please sign out and sign back in to refresh your session.',
    icon: 'auth',
  },
  [ErrorCode.FORBIDDEN]: {
    title: 'Access Denied',
    message: "You don't have permission to access this resource.",
    suggestion: 'Contact your administrator if you believe this is an error.',
    icon: 'auth',
  },
  [ErrorCode.VALIDATION_ERROR]: {
    title: 'Invalid Input',
    message: 'The information you provided is not valid.',
    suggestion: 'Please check your input and try again.',
    icon: 'warning',
  },
  [ErrorCode.INVALID_INPUT]: {
    title: 'Invalid Input',
    message: 'The information you provided is not valid.',
    suggestion: 'Please check your input and try again.',
    icon: 'warning',
  },
  [ErrorCode.NOT_FOUND]: {
    title: 'Not Found',
    message: "The resource you're looking for doesn't exist.",
    suggestion: 'Please check the URL or try a different search.',
    icon: 'info',
  },
  [ErrorCode.CONFLICT]: {
    title: 'Conflict',
    message: 'This action conflicts with existing data.',
    suggestion: 'Please refresh and try again.',
    icon: 'warning',
  },
  [ErrorCode.INTERNAL_ERROR]: {
    title: 'Something Went Wrong',
    message: "We're experiencing technical difficulties.",
    suggestion: 'Our team has been notified. Please try again in a few minutes.',
    icon: 'error',
  },
  [ErrorCode.SERVICE_UNAVAILABLE]: {
    title: 'Service Unavailable',
    message: 'The service is temporarily unavailable.',
    suggestion: 'Please try again in a few minutes.',
    icon: 'error',
  },
  [ErrorCode.TIMEOUT]: {
    title: 'Taking Too Long',
    message: 'The request is taking longer than expected.',
    suggestion: 'Please try again in a moment. If this continues, try a shorter request.',
    icon: 'warning',
  },
  [ErrorCode.RATE_LIMIT_EXCEEDED]: {
    title: 'Slow Down',
    message: "You're sending requests too quickly.",
    suggestion: 'Please wait a moment before trying again.',
    icon: 'warning',
  },
  [ErrorCode.STRIPE_ERROR]: {
    title: 'Payment Error',
    message: 'There was an issue processing your payment.',
    suggestion: 'Please check your payment details and try again.',
    icon: 'payment',
  },
  [ErrorCode.SUPABASE_ERROR]: {
    title: 'Database Error',
    message: 'There was an issue with the database.',
    suggestion: 'Please try again in a few minutes.',
    icon: 'error',
  },
  [ErrorCode.PGRST116]: {
    title: 'Not Found',
    message: 'The requested data was not found.',
    suggestion: 'Please check your request and try again.',
    icon: 'info',
  },
  [ErrorCode.NETWORK_ERROR]: {
    title: 'Connection Problem',
    message: "We couldn't connect to our servers right now.",
    suggestion: 'Please check your internet connection and try again.',
    icon: 'network',
  },
  [ErrorCode.PAYLOAD_TOO_LARGE]: {
    title: 'Request Too Large',
    message: 'The data you sent is too large to process.',
    suggestion: 'Please reduce the size of your request and try again.',
    icon: 'warning',
  },
  [ErrorCode.INVALID_RESPONSE]: {
    title: 'Invalid Response',
    message: 'We received an unexpected response from the server.',
    suggestion: 'Please try again in a few minutes.',
    icon: 'error',
  },
};
