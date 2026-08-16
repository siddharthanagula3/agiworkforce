
import { apiClient } from './api';
import { APIException, type APIResponse as BaseAPIResponse } from '@shared/stores/query-client';
import { toast } from 'sonner';
import { isRetryableError, getRetryDelay, getErrorMessage } from './error-utils';

export type { APIResponse } from '@shared/stores/query-client';

export interface APIErrorDetails {
  code: string;
  message: string;
  status: number;
  details?: unknown;
  timestamp: string;
  requestId?: string;
}

export interface ErrorHandler {
  handle: (error: APIException) => void;
  shouldRetry: (error: APIException) => boolean;
  getRetryDelay: (error: APIException, attempt: number) => number;
}

class DefaultErrorHandler implements ErrorHandler {
  handle(error: APIException): void {
    console.error('API Error:', error);

    const userMessage = getErrorMessage(error);
    toast.error(userMessage);
  }

  shouldRetry(error: APIException): boolean {
    return isRetryableError(error);
  }

  getRetryDelay(_error: APIException, attempt: number): number {
    return getRetryDelay(attempt);
  }
}

class AuthErrorHandler implements ErrorHandler {
  handle(error: APIException): void {
    if (error.code === 'AUTH_FAILED' || error.code === 'REFRESH_FAILED') {
      window.location.assign(new URL('/login', window.location.origin));
    } else {
      toast.error('Authentication error. Please log in again.');
    }
  }

  shouldRetry(_error: APIException): boolean {
    return false;
  }

  getRetryDelay(): number {
    return 0;
  }
}

class ErrorHandlerRegistry {
  private handlers: Map<string, ErrorHandler> = new Map();
  private defaultHandler: ErrorHandler = new DefaultErrorHandler();

  register(code: string, handler: ErrorHandler): void {
    this.handlers.set(code, handler);
  }

  getHandler(code: string | undefined): ErrorHandler {
    return (code && this.handlers.get(code)) || this.defaultHandler;
  }

  handleError(error: APIException): void {
    const handler = this.getHandler(error.code);
    handler.handle(error);
  }

  shouldRetry(error: APIException): boolean {
    const handler = this.getHandler(error.code);
    return handler.shouldRetry(error);
  }

  getRetryDelay(error: APIException, attempt: number): number {
    const handler = this.getHandler(error.code);
    return handler.getRetryDelay(error, attempt);
  }
}

export const errorHandlers = new ErrorHandlerRegistry();

errorHandlers.register('AUTH_FAILED', new AuthErrorHandler());
errorHandlers.register('REFRESH_FAILED', new AuthErrorHandler());

export class EnhancedAPIClient {
  private baseClient = apiClient;
  private maxRetries = 3;

  async request<T = unknown>(
    endpoint: string,
    _options: RequestInit = {},
  ): Promise<BaseAPIResponse<T>> {
    let lastError: APIException | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.baseClient.get<T>(endpoint);
        return response;
      } catch (error) {
        lastError = error as APIException;

        errorHandlers.handleError(lastError);

        if (attempt < this.maxRetries && errorHandlers.shouldRetry(lastError)) {
          const delay = errorHandlers.getRetryDelay(lastError, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Request failed');
  }

  async post<T = unknown>(endpoint: string, data?: unknown): Promise<BaseAPIResponse<T>> {
    let lastError: APIException | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.baseClient.post<T>(endpoint, data);
        return response;
      } catch (error) {
        lastError = error as APIException;

        errorHandlers.handleError(lastError);

        if (attempt < this.maxRetries && errorHandlers.shouldRetry(lastError)) {
          const delay = errorHandlers.getRetryDelay(lastError, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Request failed');
  }

  async put<T = unknown>(endpoint: string, data?: unknown): Promise<BaseAPIResponse<T>> {
    let lastError: APIException | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.baseClient.put<T>(endpoint, data);
        return response;
      } catch (error) {
        lastError = error as APIException;

        errorHandlers.handleError(lastError);

        if (attempt < this.maxRetries && errorHandlers.shouldRetry(lastError)) {
          const delay = errorHandlers.getRetryDelay(lastError, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Request failed');
  }

  async delete<T = unknown>(endpoint: string): Promise<BaseAPIResponse<T>> {
    let lastError: APIException | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.baseClient.delete<T>(endpoint);
        return response;
      } catch (error) {
        lastError = error as APIException;

        errorHandlers.handleError(lastError);

        if (attempt < this.maxRetries && errorHandlers.shouldRetry(lastError)) {
          const delay = errorHandlers.getRetryDelay(lastError, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Request failed');
  }
}

export const enhancedApiClient = new EnhancedAPIClient();

export const handleAPIError = (error: unknown): string => {
  if (error instanceof APIException) {
    errorHandlers.handleError(error);
    return error.message;
  }

  return getErrorMessage(error);
};

/**
 * Check if an error is retryable
 * @deprecated Use isRetryableError from @shared/lib/error-utils instead
 */
export { isRetryableError } from './error-utils';

/**
 * Get retry delay for a given attempt
 * @deprecated Use getRetryDelay from @shared/lib/error-utils instead
 */
export { getRetryDelay } from './error-utils';

export const queryErrorHandler = (error: unknown) => {
  if (error instanceof APIException) {
    errorHandlers.handleError(error);
  } else {
    toast.error('An unexpected error occurred');
  }
};

export const mutationErrorHandler = (error: unknown) => {
  if (error instanceof APIException) {
    errorHandlers.handleError(error);
  } else {
    toast.error('Operation failed. Please try again.');
  }
};
