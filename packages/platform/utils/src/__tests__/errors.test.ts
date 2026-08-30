import { describe, expect, it } from 'vitest';
import { ERROR_CODE_TO_HTTP_STATUS, ErrorCode } from '@agiworkforce/types';
import {
  AppError,
  createError,
  formatErrorForChat,
  getFriendlyError,
  isAppError,
  toAppError,
} from '../errors';

describe('createError', () => {
  it('derives every status code from the canonical contract map', () => {
    const cases = [
      [createError.unauthorized(), ErrorCode.UNAUTHORIZED],
      [createError.forbidden(), ErrorCode.FORBIDDEN],
      [createError.notFound(), ErrorCode.NOT_FOUND],
      [createError.validation('bad'), ErrorCode.VALIDATION_ERROR],
      [createError.conflict('dupe'), ErrorCode.CONFLICT],
      [createError.rateLimit(), ErrorCode.RATE_LIMIT_EXCEEDED],
      [createError.stripe('declined'), ErrorCode.STRIPE_ERROR],
      [createError.cloudDatabase('down'), ErrorCode.CLOUD_DB_ERROR],
      [createError.internal(), ErrorCode.INTERNAL_ERROR],
      [createError.serviceUnavailable(), ErrorCode.SERVICE_UNAVAILABLE],
      [createError.timeout(), ErrorCode.TIMEOUT],
      [createError.network(), ErrorCode.NETWORK_ERROR],
      [createError.payloadTooLarge(), ErrorCode.PAYLOAD_TOO_LARGE],
      [createError.badRequest('bad'), ErrorCode.VALIDATION_ERROR],
      [createError.paymentRequired(), ErrorCode.PAYMENT_REQUIRED],
    ] as const;

    for (const [error, code] of cases) {
      expect(error.code).toBe(code);
      expect(error.statusCode).toBe(ERROR_CODE_TO_HTTP_STATUS[code]);
    }
  });

  it('keeps details on the error and its JSON form', () => {
    const error = createError.validation('Email is required', { field: 'email' });
    expect(error.toJSON()).toEqual({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Email is required',
      details: { field: 'email' },
      statusCode: 400,
    });
    expect(error.isClientSafe()).toBe(true);
    expect(createError.internal().isClientSafe()).toBe(false);
  });
});

describe('isAppError / toAppError', () => {
  it('recognises AppError across the prototype chain', () => {
    expect(isAppError(createError.notFound())).toBe(true);
    expect(isAppError(new Error('plain'))).toBe(false);
    expect(isAppError('string')).toBe(false);
  });

  it('wraps unknown values without losing the message', () => {
    expect(toAppError(new Error('boom')).message).toBe('boom');
    expect(toAppError('boom').message).toBe('boom');
    const original = createError.forbidden('nope');
    expect(toAppError(original)).toBe(original);
  });
});

describe('getFriendlyError', () => {
  it('prefers the code table for an AppError over message sniffing', () => {
    const friendly = getFriendlyError(new AppError(ErrorCode.PAYMENT_REQUIRED, 'network fetch'));
    expect(friendly.title).toBe('Upgrade Required');
  });

  it('separates a connector reauthorization from an expired app session', () => {
    const connector = getFriendlyError(new Error('OAuth token revoked for provider'));
    expect(connector.title).toBe('Connection Needs Reauthorizing');
    expect(connector.suggestion).toMatch(/reconnect/i);

    const session = getFriendlyError(new Error('401 unauthorized'));
    expect(session.title).toBe('Sign In Required');
  });

  it('classifies a permission failure instead of falling back to generic', () => {
    for (const message of ['403 Forbidden', 'permission denied', 'insufficient permissions']) {
      const friendly = getFriendlyError(new Error(message));
      expect(friendly.title).toBe('Access Denied');
      expect(friendly.suggestion).toMatch(/will not help/i);
    }
  });

  it('does not send a user to sign in again for an authorization failure', () => {
    expect(getFriendlyError(new Error('Authorization failed: forbidden')).title).not.toBe(
      'Sign In Required',
    );
  });

  it('names the condition for network, timeout, quota and rate limit failures', () => {
    expect(getFriendlyError(new Error('fetch failed')).title).toBe('Connection Issue');
    expect(getFriendlyError(new Error('request timed out')).title).toBe('Taking Too Long');
    expect(getFriendlyError(new Error('insufficient_credits')).title).toBe('Usage Limit Reached');
    expect(getFriendlyError(new Error('429 rate limit')).title).toBe('Slow Down');
  });

  it('surfaces a retry-after hint when the provider supplied one', () => {
    expect(getFriendlyError(new Error('429 rate limit, retry after 30s.')).suggestion).toContain(
      '30s',
    );
  });

  it('never echoes the raw error text back to the user', () => {
    const raw = 'ECONNRESET while calling https://api.internal.example/v1/keys?token=sk-secret';
    const friendly = getFriendlyError(new Error(raw));
    expect(friendly.message).not.toContain('sk-secret');
    expect(friendly.message).not.toContain('api.internal.example');
    expect(friendly.title).toBeTruthy();
  });

  it('offers a surface-neutral next step in the generic fallback', () => {
    const friendly = getFriendlyError(new Error('something unmapped happened'));
    expect(friendly.title).toBe('Something Went Wrong');
    expect(friendly.suggestion).not.toMatch(/restarting the app/i);
    expect(friendly.suggestion).toMatch(/contact support/i);
  });
});

describe('formatErrorForChat', () => {
  it('renders title, message and suggestion', () => {
    const formatted = formatErrorForChat(new Error('403 forbidden'), false);
    expect(formatted).toContain('**Access Denied**');
    expect(formatted).toContain('Ask a workspace admin');
  });
});
