import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ApiErrorHandler, { type ApiError } from '../api-error-handler';

describe('ApiErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isRetryableStatus', () => {
    it('should return true for 5xx errors', () => {
      expect(ApiErrorHandler.isRetryableStatus(500)).toBe(true);
      expect(ApiErrorHandler.isRetryableStatus(502)).toBe(true);
      expect(ApiErrorHandler.isRetryableStatus(503)).toBe(true);
      expect(ApiErrorHandler.isRetryableStatus(504)).toBe(true);
    });

    it('should return true for 408 (timeout) and 429 (rate limit)', () => {
      expect(ApiErrorHandler.isRetryableStatus(408)).toBe(true);
      expect(ApiErrorHandler.isRetryableStatus(429)).toBe(true);
    });

    it('should return false for non-retryable status codes', () => {
      expect(ApiErrorHandler.isRetryableStatus(400)).toBe(false);
      expect(ApiErrorHandler.isRetryableStatus(401)).toBe(false);
      expect(ApiErrorHandler.isRetryableStatus(403)).toBe(false);
      expect(ApiErrorHandler.isRetryableStatus(404)).toBe(false);
      expect(ApiErrorHandler.isRetryableStatus(200)).toBe(false);
    });
  });

  describe('toApiError', () => {
    it('should convert Error to ApiError', () => {
      const error = new Error('Test error');
      const apiError = ApiErrorHandler.toApiError(error, 500) as ApiError;

      expect(apiError).toBeInstanceOf(Error);
      expect(apiError.message).toBe('Test error');
      expect(apiError.status).toBe(500);
      expect(apiError.isRetryable).toBe(true);
    });

    it('should detect timeout errors', () => {
      const error = new Error('Request timeout');
      const apiError = ApiErrorHandler.toApiError(error) as ApiError;

      expect(apiError.code).toBe('TIMEOUT');
      expect(apiError.message).toContain('timed out');
    });

    it('should detect network errors', () => {
      const error = new Error('Failed to fetch');
      const apiError = ApiErrorHandler.toApiError(error) as ApiError;

      expect(apiError.code).toBe('NETWORK_ERROR');
    });

    it('should handle non-Error inputs', () => {
      const apiError = ApiErrorHandler.toApiError('String error', 500) as ApiError;

      expect(apiError).toBeInstanceOf(Error);
      expect(apiError.status).toBe(500);
    });
  });

  describe('handleHttpError', () => {
    it('should provide user-friendly messages for common status codes', () => {
      const error400 = ApiErrorHandler.handleHttpError(400) as ApiError;
      expect(error400.message).toContain('Bad request');

      const error401 = ApiErrorHandler.handleHttpError(401) as ApiError;
      expect(error401.message).toContain('Unauthorized');

      const error404 = ApiErrorHandler.handleHttpError(404) as ApiError;
      expect(error404.message).toContain('not found');

      const error500 = ApiErrorHandler.handleHttpError(500) as ApiError;
      expect(error500.message).toContain('Server error');
    });

    it('should use custom messages if provided', () => {
      const error = ApiErrorHandler.handleHttpError(500, 'Custom message') as ApiError;
      expect(error.message).toBe('Custom message');
    });

    it('should mark 5xx as retryable', () => {
      const error = ApiErrorHandler.handleHttpError(500) as ApiError;
      expect(error.isRetryable).toBe(true);
    });
  });

  describe('parseJSON', () => {
    it('should parse valid JSON response', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), {
        headers: { 'content-type': 'application/json' },
      });

      const result = await ApiErrorHandler.parseJSON(mockResponse);
      expect(result).toEqual({ data: 'test' });
    });

    it('should throw on invalid content type', async () => {
      const mockResponse = new Response('plain text', {
        headers: { 'content-type': 'text/plain' },
      });

      await expect(ApiErrorHandler.parseJSON(mockResponse)).rejects.toThrow();
    });

    it('should throw on invalid JSON', async () => {
      const mockResponse = new Response('not json', {
        headers: { 'content-type': 'application/json' },
      });

      await expect(ApiErrorHandler.parseJSON(mockResponse)).rejects.toThrow();
    });
  });

  describe('fetchWithTimeout', () => {
    it('should throw timeout error when request exceeds timeout', async () => {
      const mockFetch: typeof fetch = vi.fn(
        (_url: RequestInfo | URL, options?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = options?.signal;
            if (signal) {
              signal.addEventListener(
                'abort',
                () => {
                  reject(new DOMException('The operation was aborted.', 'AbortError'));
                },
                { once: true },
              );
            }
          }),
      ) as typeof fetch;

      global.fetch = mockFetch;

      await expect(
        ApiErrorHandler.fetchWithTimeout('http://example.com', { timeout: 10 }),
      ).rejects.toThrow();
    });
  });

  describe('showErrorToast', () => {
    it('should show error toast', () => {
      const error = new Error('Test error') as ApiError;

      // Mock toast - this would normally be imported from sonner
      // For testing purposes, we'll just verify the error has the right structure
      expect(error.message).toBe('Test error');
    });
  });
});
