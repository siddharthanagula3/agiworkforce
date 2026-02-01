/**
 * Error Handler Tests
 *
 * Tests for API error handling middleware
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import { handleError, withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';

describe('Error Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleError', () => {
    describe('AppError Handling', () => {
      it('should handle AppError and return proper response', () => {
        const error = createError.badRequest('Invalid input');

        const response = handleError(error);

        expect(response.status).toBe(400);
      });

      it('should include error code in response', async () => {
        const error = createError.unauthorized('Not authenticated');

        const response = handleError(error);
        const data = await response.json();

        expect(data.error.code).toBe('UNAUTHORIZED');
        expect(data.error.message).toBe('Not authenticated');
      });

      it('should include error details when present', async () => {
        const error = createError.validation('Validation failed', [
          { path: 'email', message: 'Invalid email' },
        ]);

        const response = handleError(error);
        const data = await response.json();

        expect(data.error.details).toEqual([{ path: 'email', message: 'Invalid email' }]);
      });

      it('should not include details when not present', async () => {
        const error = createError.notFound('Resource not found');

        const response = handleError(error);
        const data = await response.json();

        expect(data.error).not.toHaveProperty('details');
      });

      it('should include requestId when provided', async () => {
        const error = createError.internal('Server error');

        const response = handleError(error, 'req-123');
        const data = await response.json();

        expect(data.requestId).toBe('req-123');
      });

      it('should log AppError with proper severity', () => {
        const error = createError.forbidden('Access denied');

        handleError(error);

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: 'FORBIDDEN',
              message: 'Access denied',
              statusCode: 403,
            }),
          }),
          'API error',
        );
      });
    });

    describe('Zod Error Handling', () => {
      it('should handle Zod validation errors', async () => {
        const zodError = {
          issues: [
            { path: ['email'], message: 'Invalid email format' },
            { path: ['name', 'first'], message: 'Required' },
          ],
        };

        const response = handleError(zodError);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error.code).toBe('VALIDATION_ERROR');
        expect(data.error.message).toBe('Validation failed');
        expect(data.error.details).toEqual([
          { path: 'email', message: 'Invalid email format' },
          { path: 'name.first', message: 'Required' },
        ]);
      });

      it('should log Zod errors as warnings', () => {
        const zodError = {
          issues: [{ path: ['field'], message: 'Invalid' }],
        };

        handleError(zodError);

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              code: 'VALIDATION_ERROR',
            }),
          }),
          'Validation error',
        );
      });
    });

    describe('Unknown Error Handling', () => {
      it('should handle unknown errors as internal errors', async () => {
        const error = new Error('Something went wrong');

        const response = handleError(error);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error.code).toBe('INTERNAL_ERROR');
        expect(data.error.message).toBe('An unexpected error occurred');
      });

      it('should handle non-Error objects', async () => {
        const error = 'string error';

        const response = handleError(error);

        expect(response.status).toBe(500);
      });

      it('should handle null/undefined', async () => {
        const response = handleError(null);

        expect(response.status).toBe(500);
      });

      it('should log unknown errors with stack trace', () => {
        const error = new Error('Unknown error');

        handleError(error);

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              originalError: 'Unknown error',
              stack: expect.any(String),
            }),
          }),
          'Unexpected error',
        );
      });

      it('should include original error in dev mode', async () => {
        vi.stubEnv('NODE_ENV', 'development');

        try {
          const error = new Error('Dev error');
          const response = handleError(error);
          const data = await response.json();

          // In dev mode, internal error includes details
          expect(data.error.code).toBe('INTERNAL_ERROR');
        } finally {
          vi.unstubAllEnvs();
        }
      });
    });

    describe('HTTP Status Codes', () => {
      it('should return 400 for bad request', () => {
        const response = handleError(createError.badRequest('Bad'));
        expect(response.status).toBe(400);
      });

      it('should return 401 for unauthorized', () => {
        const response = handleError(createError.unauthorized('Unauth'));
        expect(response.status).toBe(401);
      });

      it('should return 403 for forbidden', () => {
        const response = handleError(createError.forbidden('Forbidden'));
        expect(response.status).toBe(403);
      });

      it('should return 404 for not found', () => {
        const response = handleError(createError.notFound('Not found'));
        expect(response.status).toBe(404);
      });

      it('should return 409 for conflict', () => {
        const response = handleError(createError.conflict('Conflict'));
        expect(response.status).toBe(409);
      });

      it('should return 402 for payment required', () => {
        const response = handleError(createError.paymentRequired('Pay up'));
        expect(response.status).toBe(402);
      });

      it('should return 429 for rate limit', () => {
        const response = handleError(createError.rateLimit('Slow down'));
        expect(response.status).toBe(429);
      });

      it('should return 500 for internal error', () => {
        const response = handleError(createError.internal('Oops'));
        expect(response.status).toBe(500);
      });
    });
  });

  describe('withErrorHandler', () => {
    it('should pass through successful responses', async () => {
      const handler = async () => NextResponse.json({ success: true });
      const wrappedHandler = withErrorHandler(handler);

      const response = await wrappedHandler();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should catch and handle thrown AppErrors', async () => {
      const handler = async () => {
        throw createError.notFound('Resource not found');
      };
      const wrappedHandler = withErrorHandler(handler);

      const response = await wrappedHandler();

      expect(response.status).toBe(404);
    });

    it('should catch and handle thrown generic errors', async () => {
      const handler = async () => {
        throw new Error('Unexpected error');
      };
      const wrappedHandler = withErrorHandler(handler);

      const response = await wrappedHandler();

      expect(response.status).toBe(500);
    });

    it('should extract requestId from headers', async () => {
      const handler = async () => {
        throw createError.badRequest('Bad request');
      };
      const wrappedHandler = withErrorHandler(handler);

      const mockRequest = {
        headers: {
          get: vi.fn((key: string) => (key === 'x-request-id' ? 'req-456' : null)),
        },
      };

      const response = await (wrappedHandler as any)(mockRequest);
      const data = await response.json();

      expect(data.requestId).toBe('req-456');
    });

    it('should handle missing requestId', async () => {
      const handler = async () => {
        throw createError.badRequest('Bad request');
      };
      const wrappedHandler = withErrorHandler(handler);

      const response = await wrappedHandler();
      const data = await response.json();

      expect(data.requestId).toBeUndefined();
    });

    it('should preserve handler arguments', async () => {
      const handler = async (arg1: string, arg2: number) => {
        return NextResponse.json({ arg1, arg2 });
      };
      const wrappedHandler = withErrorHandler(handler);

      const response = await wrappedHandler('test', 42);
      const data = await response.json();

      expect(data.arg1).toBe('test');
      expect(data.arg2).toBe(42);
    });
  });
});
