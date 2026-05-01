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
import { ErrorCode, type ErrorCodeValue } from '@agiworkforce/types';

// Re-export types and constants from @agiworkforce/types to avoid duplication
export type ApiError = ApiErrorType;
export type FriendlyError = FriendlyErrorType;
export { ErrorCode };
export type { ErrorCodeValue };

function extractRetryAfterHint(errorMessage: string): string | null {
  const retryAfterMatch = errorMessage.match(/retry after ([^.]+)\.?/i);
  if (!retryAfterMatch?.[1]) {
    return null;
  }

  return retryAfterMatch[1].trim();
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
    public code: ErrorCodeValue,
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

  /** Create a bad request (400) error - alias for validation */
  badRequest: (message: string, details?: unknown): AppError =>
    new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details),

  /** Create a payment required (402) error */
  paymentRequired: (message = 'Payment required'): AppError =>
    new AppError(ErrorCode.PAYMENT_REQUIRED, message, 402),
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
 * ERR-001: Error code to friendly message mapping.
 * Maps structured error codes to user-friendly messages.
 */
const ERROR_CODE_MESSAGES: Record<ErrorCodeValue, FriendlyError> = {
  [ErrorCode.UNAUTHORIZED]: {
    title: 'Sign In Required',
    message: 'You need to sign in to continue.',
    suggestion: 'Please sign in or refresh your session.',
    icon: 'auth',
  },
  [ErrorCode.FORBIDDEN]: {
    title: 'Access Denied',
    message: "You don't have permission to perform this action.",
    suggestion: 'Contact support if you believe this is an error.',
    icon: 'auth',
  },
  [ErrorCode.VALIDATION_ERROR]: {
    title: 'Invalid Input',
    message: 'Some of the information provided is incorrect.',
    suggestion: 'Please check your input and try again.',
    icon: 'warning',
  },
  [ErrorCode.INVALID_INPUT]: {
    title: 'Invalid Input',
    message: 'The provided information is not in the expected format.',
    suggestion: 'Please check your input and try again.',
    icon: 'warning',
  },
  [ErrorCode.NOT_FOUND]: {
    title: 'Not Found',
    message: "We couldn't find what you're looking for.",
    suggestion: 'It may have been moved or deleted.',
    icon: 'error',
  },
  [ErrorCode.CONFLICT]: {
    title: 'Conflict',
    message: 'This action conflicts with an existing item.',
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
    icon: 'warning',
  },
  [ErrorCode.TIMEOUT]: {
    title: 'Taking Too Long',
    message: 'The request is taking longer than expected.',
    suggestion: 'Please try again with a simpler request.',
    icon: 'warning',
  },
  [ErrorCode.RATE_LIMIT_EXCEEDED]: {
    title: 'Slow Down',
    message: "You're sending requests too quickly.",
    suggestion: 'Please wait a moment before trying again.',
    icon: 'warning',
  },
  [ErrorCode.STRIPE_ERROR]: {
    title: 'Payment Issue',
    message: 'There was a problem processing your payment.',
    suggestion: 'Please check your payment method and try again.',
    icon: 'payment',
  },
  [ErrorCode.SUPABASE_ERROR]: {
    title: 'Database Error',
    message: 'There was a problem accessing your data.',
    suggestion: 'Please try again. If this persists, contact support.',
    icon: 'error',
  },
  [ErrorCode.PGRST116]: {
    title: 'Not Found',
    message: 'The requested record was not found.',
    suggestion: 'It may have been moved or deleted.',
    icon: 'error',
  },
  [ErrorCode.NETWORK_ERROR]: {
    title: 'Connection Problem',
    message: "We couldn't connect to our servers right now.",
    suggestion: 'Please check your internet connection and try again.',
    icon: 'network',
  },
  [ErrorCode.PAYLOAD_TOO_LARGE]: {
    title: 'File Too Large',
    message: 'The file or data you are trying to send is too large.',
    suggestion: 'Please try with a smaller file or break it into parts.',
    icon: 'warning',
  },
  [ErrorCode.INVALID_RESPONSE]: {
    title: 'Unexpected Response',
    message: 'We received an unexpected response from the server.',
    suggestion: 'Please try again. If this persists, contact support.',
    icon: 'error',
  },
  [ErrorCode.PAYMENT_REQUIRED]: {
    title: 'Upgrade Required',
    message: 'This feature requires a paid plan.',
    suggestion: 'Upgrade your plan to access this feature.',
    icon: 'payment',
  },
};

/**
 * Get a user-friendly error message for a specific error code.
 *
 * @param code - The error code
 * @returns User-friendly error information
 *
 * @example
 * ```typescript
 * const friendly = getFriendlyErrorByCode(ErrorCode.UNAUTHORIZED);
 * // { title: 'Sign In Required', message: 'You need to sign in...', ... }
 * ```
 */
export function getFriendlyErrorByCode(code: ErrorCodeValue): FriendlyError {
  return (
    ERROR_CODE_MESSAGES[code] ?? {
      title: 'Something Went Wrong',
      message: "We weren't able to complete your request.",
      suggestion: 'Please try again. If this keeps happening, try restarting the app.',
      icon: 'error',
    }
  );
}

/**
 * Convert an error message to a user-friendly format.
 * Supports both Error objects (including AppError with codes) and string messages.
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
  // ERR-001: If this is an AppError with a code, use the code mapping first
  if (isAppError(error)) {
    return getFriendlyErrorByCode(error.code);
  }

  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorLower = errorMessage.toLowerCase();

  // MCP errors - ERR-002: Never show "MCP" to users, translate to friendly messages
  // These patterns match various MCP-related errors and translate them appropriately
  if (errorLower.includes('mcp')) {
    // MCP server connection issues
    if (
      errorLower.includes('econnrefused') ||
      errorLower.includes('connection refused') ||
      errorLower.includes('failed to connect') ||
      errorLower.includes('server not running')
    ) {
      return {
        title: 'Service Connection Failed',
        message: "Couldn't connect to the requested service.",
        suggestion:
          'Please check that the service is running and try again. You may need to reconnect your account.',
        icon: 'network',
      };
    }

    // MCP tool execution failures
    if (
      errorLower.includes('tool') ||
      errorLower.includes('execution') ||
      errorLower.includes('invoke')
    ) {
      return {
        title: 'Action Failed',
        message: "The action couldn't be completed.",
        suggestion: 'Please try again. If this continues, try a different approach.',
        icon: 'error',
      };
    }

    // MCP authentication/credential issues
    if (
      errorLower.includes('auth') ||
      errorLower.includes('credential') ||
      errorLower.includes('token') ||
      errorLower.includes('oauth')
    ) {
      return {
        title: 'Connection Expired',
        message: 'Your connection to this service needs to be refreshed.',
        suggestion: 'Please reconnect your account in Settings.',
        icon: 'auth',
      };
    }

    // MCP server startup/initialization issues
    if (
      errorLower.includes('start') ||
      errorLower.includes('init') ||
      errorLower.includes('spawn') ||
      errorLower.includes('process')
    ) {
      return {
        title: 'Service Unavailable',
        message: 'The service is still starting up or encountered a problem.',
        suggestion: 'Please wait a moment and try again.',
        icon: 'warning',
      };
    }

    // MCP timeout
    if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
      return {
        title: 'Service Too Slow',
        message: 'The service took too long to respond.',
        suggestion: 'Please try again with a simpler request.',
        icon: 'warning',
      };
    }

    // Generic MCP error fallback
    return {
      title: 'Service Error',
      message: 'There was a problem communicating with the service.',
      suggestion: 'Please try again. If this persists, try reconnecting in Settings.',
      icon: 'error',
    };
  }

  // Tool execution errors (may not contain "mcp" but are MCP-related)
  if (
    errorLower.includes('tool_call') ||
    errorLower.includes('tool call') ||
    errorLower.includes('tool_use') ||
    errorLower.includes('tool use')
  ) {
    return {
      title: 'Action Failed',
      message: "The requested action couldn't be completed.",
      suggestion: 'Please try again or ask me to do this a different way.',
      icon: 'error',
    };
  }

  // Stream watchdog timeout — AI is working but stream went quiet
  if (errorLower.includes('stream_watchdog_timeout') || errorLower.includes('watchdog')) {
    return {
      title: 'Response Is Taking Longer Than Expected',
      message: 'The AI is still working on your request.',
      suggestion: 'Please wait a moment or try again with a shorter request.',
      icon: 'warning',
    };
  }

  // Provider capability mismatches: common with Bedrock, Vertex, and gateway models
  // when structured output, thinking, or effort fields are sent to unsupported models.
  if (
    (errorLower.includes('output_config') &&
      (errorLower.includes('extra inputs') ||
        errorLower.includes('not permitted') ||
        errorLower.includes('unsupported'))) ||
    errorLower.includes('thinking.type.enabled is not supported') ||
    errorLower.includes('adaptive thinking is not supported') ||
    errorLower.includes('does not support the effort parameter') ||
    (errorLower.includes('effort') && errorLower.includes('not supported')) ||
    (errorLower.includes('response_format') && errorLower.includes('not supported')) ||
    (errorLower.includes('json_schema') && errorLower.includes('not supported'))
  ) {
    return {
      title: 'Model Setting Not Supported',
      message: "The selected model or provider doesn't support one of the requested AI settings.",
      suggestion:
        'Switch to Auto model routing, choose a different model, or turn off structured output, thinking, or effort for this request.',
      icon: 'warning',
    };
  }

  // Invalid API key / unauthorized
  if (
    errorLower.includes('invalid_api_key') ||
    errorLower.includes('invalid api key') ||
    errorLower.includes('api key')
  ) {
    return {
      title: 'API Key Issue',
      message: 'There is a problem with your API key configuration.',
      suggestion: 'Please check your API key in Settings and try again.',
      icon: 'auth',
    };
  }

  // Quota exceeded / insufficient credits
  if (
    errorLower.includes('quota_exceeded') ||
    errorLower.includes('insufficient_credits') ||
    errorLower.includes('insufficient credits') ||
    errorLower.includes('quota exceeded')
  ) {
    return {
      title: 'Usage Limit Reached',
      message: "You've used your quota for now.",
      suggestion: 'Please check your billing in Settings or wait until your quota resets.',
      icon: 'payment',
    };
  }

  // Model not found
  if (errorLower.includes('model_not_found') || errorLower.includes('model not found')) {
    return {
      title: 'Model Unavailable',
      message: 'The selected model is not available right now.',
      suggestion: 'Try switching to a different model in the model selector.',
      icon: 'warning',
    };
  }

  // Network errors
  if (
    errorLower.includes('network') ||
    errorLower.includes('fetch') ||
    errorLower.includes('econnrefused') ||
    errorLower.includes('etimedout') ||
    errorLower.includes('fetch failed')
  ) {
    return {
      title: 'Connection Issue',
      message: 'Could not reach the server.',
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
    const retryAfterHint = extractRetryAfterHint(errorMessage);
    return {
      title: 'Slow Down',
      message: "You're sending requests too quickly.",
      suggestion: retryAfterHint
        ? `Please wait ${retryAfterHint} before trying again.`
        : 'Please wait a moment before trying again.',
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
export function formatErrorForChat(error: Error | string, _isSimpleMode: boolean): string {
  const friendly = getFriendlyError(error);

  let formatted = `**${friendly.title}**\n\n${friendly.message}`;
  if (friendly.suggestion) {
    formatted += `\n\n${friendly.suggestion}`;
  }

  return formatted;
}

/**
 * ERR-003: Context for contextual error suggestions.
 */
export interface ErrorContext {
  /** The component or feature where the error occurred */
  component?: string;
  /** The operation being attempted (e.g., 'send_message', 'save_settings') */
  operation?: string;
  /** The service involved (e.g., 'gmail', 'slack', 'notion') */
  service?: string;
  /** Whether the operation can be retried */
  canRetry?: boolean;
  /** Additional context data */
  extra?: Record<string, unknown>;
}

/**
 * ERR-003: Contextual suggestion mappings based on operation and error type.
 * Maps [operation, error_type] to specific suggestions.
 */
const CONTEXTUAL_SUGGESTIONS: Record<string, Record<string, string>> = {
  // Chat operations
  send_message: {
    network:
      'Your message was not sent. Please check your internet connection and try sending again.',
    timeout: 'The AI is taking longer than expected. Try a shorter or simpler request.',
    rate_limit: 'Too many messages sent. Please wait a moment before sending another message.',
    auth: 'Your session may have expired. Please sign in again to continue chatting.',
  },
  // Settings operations
  save_settings: {
    network: 'Your settings were not saved. Please check your connection and try again.',
    validation: 'Some settings have invalid values. Please check the highlighted fields.',
    default: 'Unable to save settings. Try again or restart the app if the problem persists.',
  },
  // File operations
  upload_file: {
    network: 'File upload failed. Please check your connection and try again.',
    payload_too_large:
      'This file is too large. Try compressing it or splitting into smaller parts.',
    validation: 'This file type is not supported. Please use a different file format.',
  },
  download_file: {
    network: 'Download failed. Please check your connection and try again.',
    not_found: 'The file is no longer available. It may have been deleted or moved.',
  },
  // Service connection operations
  connect_service: {
    network: 'Could not connect to the service. Please check your internet connection.',
    auth: 'Authentication failed. Please try reconnecting your account in Settings.',
    timeout: 'The service is not responding. Try again later.',
    default: 'Could not connect. Please check your credentials and try reconnecting.',
  },
  // Search operations
  search: {
    network: 'Search failed. Please check your connection and try again.',
    timeout: 'Search is taking too long. Try a more specific search term.',
    rate_limit: 'Too many searches. Please wait a moment before searching again.',
  },
  // Tool execution
  tool_execution: {
    network: 'The action failed due to a connection issue. Please try again.',
    timeout: 'The action took too long. Try a simpler request.',
    auth: 'This action requires authentication. Please reconnect the service in Settings.',
    default: 'The action could not be completed. Try a different approach.',
  },
};

/**
 * Service-specific suggestions for reconnection.
 */
const SERVICE_SUGGESTIONS: Record<string, string> = {
  gmail: 'Try reconnecting your Gmail account in Settings > Integrations.',
  google_drive: 'Try reconnecting your Google Drive in Settings > Integrations.',
  slack: 'Try reconnecting your Slack workspace in Settings > Integrations.',
  notion: 'Try reconnecting your Notion account in Settings > Integrations.',
  trello: 'Try reconnecting your Trello account in Settings > Integrations.',
  asana: 'Try reconnecting your Asana account in Settings > Integrations.',
  github: 'Try reconnecting your GitHub account in Settings > Integrations.',
  calendar: 'Try reconnecting your calendar in Settings > Integrations.',
  default: 'Try reconnecting the service in Settings > Integrations.',
};

/**
 * ERR-003: Get a contextual error suggestion based on operation and error type.
 * Provides more specific suggestions based on what the user was trying to do.
 *
 * @param error - The error that occurred
 * @param context - Optional context about the operation
 * @returns Enhanced FriendlyError with contextual suggestion
 *
 * @example
 * ```typescript
 * const friendly = getContextualError(error, {
 *   operation: 'send_message',
 *   service: 'slack'
 * });
 * // Returns more specific suggestion for message sending failures
 * ```
 */
export function getContextualError(error: Error | string, context?: ErrorContext): FriendlyError {
  // Start with the base friendly error
  const friendly = getFriendlyError(error);

  if (!context) {
    return friendly;
  }

  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorLower = errorMessage.toLowerCase();

  // Determine error type for lookup
  let errorType = 'default';
  if (
    errorLower.includes('network') ||
    errorLower.includes('fetch') ||
    errorLower.includes('econnrefused')
  ) {
    errorType = 'network';
  } else if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
    errorType = 'timeout';
  } else if (
    errorLower.includes('auth') ||
    errorLower.includes('unauthorized') ||
    errorLower.includes('401')
  ) {
    errorType = 'auth';
  } else if (errorLower.includes('rate') || errorLower.includes('429')) {
    errorType = 'rate_limit';
  } else if (errorLower.includes('validation') || errorLower.includes('invalid')) {
    errorType = 'validation';
  } else if (errorLower.includes('not found') || errorLower.includes('404')) {
    errorType = 'not_found';
  } else if (errorLower.includes('too large') || errorLower.includes('413')) {
    errorType = 'payload_too_large';
  }

  // Look up contextual suggestion based on operation
  if (context.operation) {
    const operationSuggestions = CONTEXTUAL_SUGGESTIONS[context.operation];
    if (operationSuggestions) {
      const contextualSuggestion =
        operationSuggestions[errorType] || operationSuggestions['default'];
      if (contextualSuggestion) {
        friendly.suggestion = contextualSuggestion;
      }
    }
  }

  // Add service-specific reconnection hint for auth errors
  if (errorType === 'auth' && context.service) {
    const serviceSuggestion =
      SERVICE_SUGGESTIONS[context.service] || SERVICE_SUGGESTIONS['default'];
    friendly.suggestion = `${friendly.suggestion || ''} ${serviceSuggestion}`.trim();
  }

  // Add retry hint if applicable
  if (context.canRetry === false && friendly.suggestion) {
    friendly.suggestion = friendly.suggestion.replace(
      /try again/gi,
      'the operation cannot be retried',
    );
  }

  return friendly;
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
