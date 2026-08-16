/**
 * Error Types
 *
 * Standardized error types and codes used across all applications.
 * These provide consistent error handling and reporting.
 *
 * @module errors
 * @packageDocumentation
 */

export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',

  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  STRIPE_ERROR: 'STRIPE_ERROR',
  CLOUD_DB_ERROR: 'CLOUD_DB_ERROR',
  PGRST116: 'PGRST116',

  NETWORK_ERROR: 'NETWORK_ERROR',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INVALID_RESPONSE: 'INVALID_RESPONSE',

  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
} as const;

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
  code: ErrorCodeValue;
  message: string;
  details?: unknown;
  statusCode: number;
}

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
  [ErrorCode.CLOUD_DB_ERROR]: 502,
  [ErrorCode.PGRST116]: 404,
  [ErrorCode.NETWORK_ERROR]: 503,
  [ErrorCode.PAYLOAD_TOO_LARGE]: 413,
  [ErrorCode.INVALID_RESPONSE]: 502,
  [ErrorCode.PAYMENT_REQUIRED]: 402,
};

export interface FriendlyError {
  title: string;
  message: string;
  suggestion?: string;
  icon?: 'error' | 'warning' | 'info' | 'network' | 'payment' | 'auth';
}

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
  [ErrorCode.CLOUD_DB_ERROR]: {
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
  [ErrorCode.PAYMENT_REQUIRED]: {
    title: 'Payment Required',
    message: 'You need to add credits or upgrade your plan to continue.',
    suggestion: 'Visit your billing page to add credits or upgrade.',
    icon: 'payment',
  },
};
