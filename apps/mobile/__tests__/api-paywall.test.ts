/**
 * api.ts — ApiPaywallError detection tests
 *
 * Verifies that:
 *  - HTTP 429 with { kind: 'paywall', feature, requiredTier, reason } throws ApiPaywallError
 *  - ApiPaywallError carries the correct fields
 *  - HTTP 429 without paywall body throws a generic Error
 *  - HTTP 429 with non-JSON body throws a generic Error
 *  - Non-429 errors pass through unchanged
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(),
  getAuthHeaders: jest.fn(),
  refreshAuthSession: jest.fn(),
  clearAuthSession: jest.fn(),
}));

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('../lib/constants', () => ({
  API_URL: 'https://api.test.local',
  TIMEOUTS: { DEFAULT: 10_000, UPLOAD: 30_000 },
}));

jest.mock('../lib/abortSignal', () => ({
  combineAbortSignals: (signals: AbortSignal[]) => signals[0],
}));

jest.mock('../lib/egressGuard', () => ({
  guardedFetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
}));

const mockInvalidateCloudAccount = jest.fn();
jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  invalidateCloudAccount: () => mockInvalidateCloudAccount(),
}));

const mockClearLocalCloudAccountState = jest.fn();
jest.mock('../src/features/auth/services/cloudAccountTeardown', () => ({
  clearLocalCloudAccountState: () => mockClearLocalCloudAccountState(),
}));

const mockGetInfoAsync = jest.fn();
const mockUploadAsync = jest.fn();
const mockCancelUploadAsync = jest.fn();
const mockCreateUploadTask = jest.fn(() => ({
  uploadAsync: (...args: unknown[]) => mockUploadAsync(...args),
  cancelAsync: (...args: unknown[]) => mockCancelUploadAsync(...args),
}));
jest.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  createUploadTask: (...args: unknown[]) => mockCreateUploadTask(...args),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { api, ApiPaywallError, resetApiAccountState } from '../services/api';
import { waitFor } from '@testing-library/react-native';
import {
  clearAuthSession,
  getAuthHeaders,
  getAuthToken,
  refreshAuthSession,
} from '../services/authSession';

const mockGetAuthToken = getAuthToken as jest.Mock;
const mockGetAuthHeaders = getAuthHeaders as jest.Mock;
const mockRefreshAuthSession = refreshAuthSession as jest.Mock;
const mockClearAuthSession = clearAuthSession as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(status: number, body: unknown, contentType = 'application/json'): Response {
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h === 'content-type' ? contentType : null) },
    text: jest.fn(async () => bodyText),
    json: jest.fn(async () => (typeof body === 'string' ? JSON.parse(body) : body)),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  resetApiAccountState();
  mockGetAuthToken.mockResolvedValue('test-token');
  mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer test-token' });
  mockRefreshAuthSession.mockResolvedValue(false);
  mockClearAuthSession.mockResolvedValue(undefined);
  mockGetInfoAsync.mockResolvedValue({
    exists: true,
    isDirectory: false,
    size: 32,
  });
  mockCancelUploadAsync.mockResolvedValue(undefined);
});

describe('Cloud account request isolation', () => {
  it('rejects an account-A response that resolves after account teardown', async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    jest.spyOn(globalThis, 'fetch').mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );

    const accountARequest = api.get<{ owner: string }>('/api/account-scoped');
    await Promise.resolve();
    await Promise.resolve();

    resetApiAccountState();
    resolveResponse?.(makeResponse(200, { owner: 'account-a' }));

    await expect(accountARequest).rejects.toMatchObject({
      name: 'StaleApiAccountOperationError',
    });

    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(200, { owner: 'account-b' }));
    await expect(api.get('/api/account-scoped')).resolves.toEqual({ owner: 'account-b' });
  });

  it('invalidates and clears Cloud account state synchronously on terminal 401', async () => {
    mockRefreshAuthSession.mockResolvedValueOnce(false);
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(401, { error: 'expired' }));

    const request = api.get('/api/account-scoped');
    await expect(request).rejects.toThrow('Session expired');

    expect(mockInvalidateCloudAccount).toHaveBeenCalledTimes(1);
    expect(mockClearLocalCloudAccountState).toHaveBeenCalledTimes(1);
    expect(mockClearAuthSession).toHaveBeenCalledTimes(1);
  });

  it('cancels an in-flight direct-to-storage upload on account teardown', async () => {
    let resolveUpload:
      | ((value: { status: number; body: string; headers: object }) => void)
      | undefined;
    mockUploadAsync.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeResponse(200, {
        storageKey: 'users/account-a/attachment.txt',
        uploadUrl: 'https://storage.example.test/upload',
        uploadMethod: 'PUT',
        uploadHeaders: { 'Content-Type': 'text/plain' },
      }),
    );

    const accountAUpload = api.uploadFile({
      name: 'attachment.txt',
      type: 'text/plain',
      uri: 'file:///attachment.txt',
    });
    await Promise.resolve();
    await waitFor(() => expect(mockCreateUploadTask).toHaveBeenCalledTimes(1));

    resetApiAccountState();
    expect(mockCancelUploadAsync).toHaveBeenCalledTimes(1);
    resolveUpload?.({ status: 200, body: '', headers: {} });

    await expect(accountAUpload).rejects.toMatchObject({
      name: 'StaleApiAccountOperationError',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects an insecure presigned upload destination before creating a native task', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeResponse(200, {
        storageKey: 'users/account-a/attachment.txt',
        uploadUrl: 'http://storage.example.test/upload',
        uploadMethod: 'PUT',
        uploadHeaders: { 'Content-Type': 'text/plain' },
      }),
    );

    await expect(
      api.uploadFile({
        name: 'attachment.txt',
        type: 'text/plain',
        uri: 'file:///attachment.txt',
      }),
    ).rejects.toThrow('Refusing an insecure upload destination');
    expect(mockCreateUploadTask).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 1. Paywall 429 throws ApiPaywallError
// ---------------------------------------------------------------------------

describe('429 with paywall payload', () => {
  it('throws ApiPaywallError with correct fields', async () => {
    const paywallBody = {
      kind: 'paywall',
      feature: 'token_cap',
      requiredTier: 'basic',
      reason: '2M tokens used this month',
    };
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(429, paywallBody));

    let caught: unknown;
    try {
      await api.post('/api/llm/v1/chat/completions', { model: 'test', messages: [] });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiPaywallError);
    const paywallErr = caught as ApiPaywallError;
    expect(paywallErr.feature).toBe('token_cap');
    expect(paywallErr.requiredTier).toBe('basic');
    expect(paywallErr.reason).toBe('2M tokens used this month');
    expect(paywallErr.name).toBe('ApiPaywallError');
  });

  it('message contains feature, requiredTier, and reason', async () => {
    const paywallBody = {
      kind: 'paywall',
      feature: 'image_quota',
      requiredTier: 'pro',
      reason: '10/10 images used',
    };
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(429, paywallBody));

    await expect(api.post('/api/llm/v1/chat/completions', {})).rejects.toThrow(
      'Paywall: image_quota requires pro tier.',
    );
  });

  it('uses "token_cap" and canonical "basic" defaults when fields are missing', async () => {
    const paywallBody = { kind: 'paywall' };
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(429, paywallBody));

    let caught: unknown;
    try {
      await api.get('/api/chat');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiPaywallError);
    const paywallErr = caught as ApiPaywallError;
    expect(paywallErr.feature).toBe('token_cap');
    expect(paywallErr.requiredTier).toBe('basic');
    expect(paywallErr.reason).toBe('');
  });

  it('handles max_15x tier correctly', async () => {
    const paywallBody = {
      kind: 'paywall',
      feature: 'video_generation',
      requiredTier: 'max_15x',
      reason: 'Video generation requires Max 15x',
    };
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(429, paywallBody));

    const err = await api.get('/api/chat').catch((e) => e);
    expect(err).toBeInstanceOf(ApiPaywallError);
    expect((err as ApiPaywallError).requiredTier).toBe('max_15x');
  });
});

// ---------------------------------------------------------------------------
// 2. 429 without paywall body — generic Error
// ---------------------------------------------------------------------------

describe('429 without paywall payload', () => {
  it('throws generic Error when body is rate-limit plain text', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(429, 'Too many requests', 'text/plain'));

    const err = await api.get('/api/chat').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ApiPaywallError);
  });

  it('throws generic Error when body is JSON without kind=paywall', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(429, { error: 'rate_limited', retryAfter: 60 }));

    const caught = await api.get('/api/test').catch((e) => e);

    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(ApiPaywallError);
  });
});

// ---------------------------------------------------------------------------
// 3. Non-429 errors pass through unaffected
// ---------------------------------------------------------------------------

describe('non-429 errors pass through', () => {
  it('throws plain Error for 500', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(500, 'server error'));

    const err = await api.get('/api/test').catch((e) => e);
    expect(err).not.toBeInstanceOf(ApiPaywallError);
    expect((err as Error).message).toBe(
      'The server hit a problem handling this request. Please try again.',
    );
  });

  it('does NOT throw ApiPaywallError for 403', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(403, 'forbidden'));

    const err = await api.get('/api/test').catch((e) => e);
    expect(err).not.toBeInstanceOf(ApiPaywallError);
  });

  it('2xx responses still return parsed JSON', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(200, { tier: 'basic' }));

    const result = await api.get<{ tier: string }>('/api/auth/me');
    expect(result.tier).toBe('basic');
  });
});

// ---------------------------------------------------------------------------
// 4. ApiPaywallError is instanceof Error
// ---------------------------------------------------------------------------

describe('ApiPaywallError class', () => {
  it('is an instance of Error', () => {
    const err = new ApiPaywallError('token_cap', 'basic', 'reason');
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of ApiPaywallError', () => {
    const err = new ApiPaywallError('token_cap', 'basic', '');
    expect(err).toBeInstanceOf(ApiPaywallError);
  });

  it('carries all three fields', () => {
    const err = new ApiPaywallError('image_quota', 'max_15x', 'custom reason');
    expect(err.feature).toBe('image_quota');
    expect(err.requiredTier).toBe('max_15x');
    expect(err.reason).toBe('custom reason');
  });
});
