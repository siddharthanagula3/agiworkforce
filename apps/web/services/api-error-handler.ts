/**
 * API Error Handler Service
 * Provides utilities for handling network errors, timeouts, and retries
 */

import { toast } from 'sonner';

export interface FetchOptions extends RequestInit {
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  shouldRetry?: (status: number) => boolean;
}

export interface ApiError extends Error {
  status?: number;
  code?: string;
  isRetryable: boolean;
  originalError?: Error;
}

class ApiErrorHandler {
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private static readonly DEFAULT_MAX_RETRIES = 3;
  private static readonly DEFAULT_RETRY_DELAY = 1000;

  /**
   * Determines if an error is retryable based on status code
   */
  static isRetryableStatus(status: number): boolean {
    // Retry on 5xx errors and certain 4xx errors
    return status >= 500 || status === 408 || status === 429;
  }

  /**
   * Converts a network error to an ApiError
   */
  static toApiError(error: unknown, status?: number): ApiError {
    let message = 'An unexpected error occurred';
    let code = 'UNKNOWN_ERROR';
    let originalError: Error | undefined;

    if (error instanceof Error) {
      message = error.message;
      originalError = error;

      // Classify error types
      if (error.name === 'AbortError' || message.includes('timeout')) {
        code = 'TIMEOUT';
        message = 'Request timed out. Please try again.';
      } else if (message.includes('network') || message.includes('fetch')) {
        code = 'NETWORK_ERROR';
        message = 'Network error. Please check your connection.';
      }
    }

    const apiError = new Error(message) as ApiError;
    apiError.name = 'ApiError';
    apiError.code = code;
    apiError.status = status;
    apiError.isRetryable = status ? this.isRetryableStatus(status) : false;
    apiError.originalError = originalError;

    return apiError;
  }

  /**
   * Fetch with timeout support
   */
  static async fetchWithTimeout(url: string, options: FetchOptions = {}): Promise<Response> {
    const timeout = options.timeout ?? this.DEFAULT_TIMEOUT;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw this.toApiError(error);
    }
  }

  /**
   * Fetch with automatic retry logic
   */
  static async fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
    const maxRetries = options.maxRetries ?? this.DEFAULT_MAX_RETRIES;
    const retryDelay = options.retryDelay ?? this.DEFAULT_RETRY_DELAY;
    const shouldRetry = options.shouldRetry ?? this.isRetryableStatus.bind(this);

    let lastError: ApiError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, options);

        // Check if response status should trigger retry
        if (response.ok) {
          return response;
        }

        if (shouldRetry(response.status)) {
          lastError = this.toApiError(null, response.status);

          if (attempt < maxRetries) {
            // Exponential backoff
            const delay = retryDelay * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        return response;
      } catch (error) {
        lastError =
          error instanceof Error
            ? this.toApiError(error)
            : (new Error('Unknown error') as ApiError);
        lastError.isRetryable =
          lastError.code === 'TIMEOUT' ||
          (lastError.status ? this.isRetryableStatus(lastError.status) : false);

        if (!lastError.isRetryable || attempt >= maxRetries) {
          throw lastError;
        }

        // Exponential backoff
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Parse JSON response with error handling
   */
  static async parseJSON(response: Response): Promise<unknown> {
    try {
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error('Invalid content type');
      }
      return await response.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse response';
      throw this.toApiError(new Error(`JSON parse error: ${message}`));
    }
  }

  /**
   * Handle HTTP error status codes
   */
  static handleHttpError(status: number, message?: string): ApiError {
    let errorMessage = message;

    switch (status) {
      case 400:
        errorMessage = errorMessage || 'Bad request. Please check your input.';
        break;
      case 401:
        errorMessage = errorMessage || 'Unauthorized. Please log in again.';
        break;
      case 403:
        errorMessage = errorMessage || 'Access denied.';
        break;
      case 404:
        errorMessage = errorMessage || 'Resource not found.';
        break;
      case 408:
        errorMessage = errorMessage || 'Request timeout. Please try again.';
        break;
      case 429:
        errorMessage = errorMessage || 'Too many requests. Please wait a moment.';
        break;
      case 500:
        errorMessage = errorMessage || 'Server error. Please try again later.';
        break;
      case 502:
      case 503:
      case 504:
        errorMessage = errorMessage || 'Service temporarily unavailable. Please try again later.';
        break;
      default:
        errorMessage = errorMessage || `HTTP ${status} error`;
    }

    return this.toApiError(new Error(errorMessage), status);
  }

  /**
   * Show user-friendly error toast
   */
  static showErrorToast(error: ApiError | Error, actionLabel?: string): void {
    const message = error instanceof Error ? error.message : 'An error occurred';

    if (actionLabel) {
      toast.error(message, {
        action: {
          label: actionLabel,
          onClick: () => {
            // Action handler will be managed by caller
          },
        },
      });
    } else {
      toast.error(message);
    }
  }
}

export default ApiErrorHandler;
