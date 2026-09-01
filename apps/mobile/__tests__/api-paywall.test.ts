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

import { api, ApiFreeCapacityError, ApiPaywallError, resetApiAccountState } from '../services/api';
import {
  paywallActivityErrorFromApiError,
  paywallErrorStateFromApiError,
} from '../src/features/chat/utils/paywallRecovery';
import {
  freeCapacityCountdownMessage,
  freeCapacityErrorStateFromApiError,
  freeCapacityRetrySeconds,
} from '../src/features/chat/utils/freeCapacityRecovery';
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

describe('429 free-capacity payload', () => {
  const RETRY_AT = '2026-09-01T12:01:30.000Z';

  function freeCapacityBody(retryAt?: string) {
    return {
      error: {
        message:
          'No free capacity right now. Try again shortly, upgrade your plan, or use your own provider key.',
        type: 'insufficient_quota',
        code: 'free_capacity_unavailable',
        ...(retryAt ? { retry_at: retryAt } : {}),
        recovery: [
          { action: 'upgrade', href: '/pricing' },
          { action: 'byok', href: '/byok' },
        ],
      },
    };
  }

  it('parses retry_at into a typed free-capacity error', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(429, freeCapacityBody(RETRY_AT)));

    const error = await api
      .post('/api/llm/v1/chat/completions', { model: 'test', messages: [] })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiFreeCapacityError);
    expect(error).not.toBeInstanceOf(ApiPaywallError);
    expect((error as ApiFreeCapacityError).retryAtMs).toBe(Date.parse(RETRY_AT));
    expect((error as ApiFreeCapacityError).code).toBe('free_capacity_unavailable');
  });

  it('leaves retryAtMs null when the server omits retry_at', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(429, freeCapacityBody()));

    const error = await api.post('/api/llm/v1/chat/completions', {}).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiFreeCapacityError);
    expect((error as ApiFreeCapacityError).retryAtMs).toBeNull();
  });

  it('ignores an unparseable retry_at rather than counting down from NaN', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(429, freeCapacityBody('soon')));

    const error = await api.post('/api/llm/v1/chat/completions', {}).catch((caught) => caught);

    expect((error as ApiFreeCapacityError).retryAtMs).toBeNull();
  });

  it('turns the typed error into countdown copy that names no wire code', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(429, freeCapacityBody(RETRY_AT)));

    const error = (await api
      .post('/api/llm/v1/chat/completions', {})
      .catch((caught) => caught)) as ApiFreeCapacityError;
    const state = freeCapacityErrorStateFromApiError(error);
    const retryAtMs = Date.parse(RETRY_AT);

    expect(state).toEqual({ retryAtMs, code: 'free_capacity_unavailable' });
    expect(freeCapacityRetrySeconds(state.retryAtMs, retryAtMs - 12_000)).toBe(12);
    expect(freeCapacityCountdownMessage(12)).toBe('Free capacity is busy. You can retry in 12s.');
    expect(freeCapacityCountdownMessage(12)).not.toContain('free_capacity');
    expect(freeCapacityRetrySeconds(state.retryAtMs, retryAtMs)).toBe(0);
  });

  it('shows no countdown for a deadline as far out as a daily quota reset', async () => {
    const quotaResetAt = new Date(Date.parse(RETRY_AT) + 12 * 60 * 60 * 1_000).toISOString();
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(429, freeCapacityBody(quotaResetAt)));

    const error = (await api
      .post('/api/llm/v1/chat/completions', {})
      .catch((caught) => caught)) as ApiFreeCapacityError;

    expect(error.retryAtMs).toBe(Date.parse(quotaResetAt));
    expect(freeCapacityRetrySeconds(error.retryAtMs, Date.parse(RETRY_AT))).toBe(0);
  });
});

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

  it('keeps the generic wait copy for a rate-limit code it does not recognise', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeResponse(429, {
        error: { code: 'rate_limit_exceeded', type: 'insufficient_quota' },
      }),
    );

    const caught = await api.get('/api/test').catch((e) => e);

    expect(caught).not.toBeInstanceOf(ApiPaywallError);
    expect(caught).not.toBeInstanceOf(ApiFreeCapacityError);
    expect((caught as Error).message).toBe(
      'Too many requests right now. Please wait a moment and try again.',
    );
  });
});

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

describe('403 plan-upgrade feature classification', () => {
  const planUpgradeBody = {
    error: {
      code: 'plan_upgrade_required',
      message: 'Upgrade required',
      required_plans: ['max_15x'],
    },
  };

  it('classifies the video generation route as video_generation', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(403, planUpgradeBody));

    const error = await api.post('/api/media/video/generate', {}).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiPaywallError);
    expect((error as ApiPaywallError).feature).toBe('video_generation');
    expect((error as ApiPaywallError).recoveryAction).toBe('upgrade');
  });

  it('classifies the image generation route as image_generation', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(403, planUpgradeBody));

    const error = await api.post('/api/media/image/generate', {}).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiPaywallError);
    expect((error as ApiPaywallError).feature).toBe('image_generation');
  });

  it('does not mislabel an unrelated plan-upgrade response as image generation', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(403, planUpgradeBody));

    const error = await api.post('/api/some-future-paid-capability', {}).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiPaywallError);
    expect((error as ApiPaywallError).feature).toBe('paid_capability');
  });
});

describe('403 subscription feature classification', () => {
  it.each(['subscription_required', 'subscription_inactive'] as const)(
    'turns image-generation %s into an actionable paywall error',
    async (code) => {
      const message =
        code === 'subscription_required'
          ? 'No active subscription found. Please subscribe to use image generation.'
          : 'Your subscription is past_due. Please update your payment method.';
      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        makeResponse(403, {
          error: { code, type: 'invalid_request_error', message },
        }),
      );

      const error = await api.post('/api/media/image/generate', {}).catch((caught) => caught);

      expect(error).toBeInstanceOf(ApiPaywallError);
      expect(error).toMatchObject({
        code,
        feature: 'image_generation',
        requiredTier: 'pro',
        reason: message,
        recoveryAction: code === 'subscription_required' ? 'subscribe' : 'manage_billing',
      });
      expect(paywallErrorStateFromApiError(error as ApiPaywallError)).toMatchObject({
        code,
        recoveryAction: code === 'subscription_required' ? 'subscribe' : 'manage_billing',
      });
      expect(paywallActivityErrorFromApiError(error as ApiPaywallError)).toBe(message);
    },
  );

  it('never tells an inactive subscriber to upgrade when the server omits a reason', () => {
    const error = new ApiPaywallError('image_generation', 'pro', '', 'subscription_inactive');

    expect(paywallActivityErrorFromApiError(error)).toBe(
      'Your subscription is inactive. Update billing to continue.',
    );
    expect(paywallActivityErrorFromApiError(error)).not.toMatch(/upgrade/i);
  });
});

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
