jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(),
  getAuthHeaders: jest.fn(),
  refreshAuthSession: jest.fn(),
  clearAuthSession: jest.fn(),
}));

const mockSignedAppTransaction = jest.fn();
jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Platform: { OS: 'ios' },
  NativeModules: {
    AGIAppTransaction: { signedAppTransaction: () => mockSignedAppTransaction() },
  },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.0' } },
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
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
  ...jest.requireActual('../src/features/auth/services/cloudAccountSession'),
  invalidateCloudAccount: () => mockInvalidateCloudAccount(),
}));

const mockClearLocalCloudAccountState = jest.fn();
jest.mock('../src/features/auth/services/cloudAccountTeardown', () => ({
  clearLocalCloudAccountState: () => mockClearLocalCloudAccountState(),
}));

const mockAnnouncePasskeyRequired = jest.fn();
jest.mock('../src/features/auth/services/accountSecurityEvents', () => ({
  announcePasskeyRequired: () => mockAnnouncePasskeyRequired(),
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

import {
  api,
  apiFetch,
  apiFetchBinary,
  ApiFreeCapacityError,
  ApiPaywallError,
  resetApiAccountState,
  recoverStreamSession,
} from '../services/api';
import { Alert } from 'react-native';
import { registerAppTransactionForAccount } from '../src/features/age-assurance/appTransaction';
import {
  activateCloudAccount,
  captureCloudAccountEpoch,
} from '../src/features/auth/services/cloudAccountSession';
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
    clone() {
      return this;
    },
  } as unknown as Response;
}

function deferredBody<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  let markStarted!: () => void;
  const started = new Promise<void>((done) => {
    markStarted = done;
  });
  const body = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return {
    started,
    resolve,
    reject,
    read: jest.fn(() => {
      markStarted();
      return body;
    }),
  };
}

describe('explicit caller-owned 401 recovery', () => {
  const options = {
    auth401Recovery: 'caller-owned' as const,
    headers: { Authorization: 'Bearer original-session-token' },
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([401, 409, 500, 'network'] as const)(
    'does not application-replay protected PUT after %s (UNRUN)',
    async (outcome) => {
      activateCloudAccount('protected-cancellation-owner');
      const accountEpoch = captureCloudAccountEpoch();
      const body = Object.freeze({
        expectedSchedule: Object.freeze({
          requestedAt: null,
          scheduledFor: '2026-11-08T18:00:00.123456Z',
        }),
      });
      const fetch = jest.spyOn(globalThis, 'fetch');
      if (outcome === 'network') fetch.mockRejectedValueOnce(new Error('Response lost'));
      else
        fetch.mockResolvedValueOnce(
          makeResponse(outcome, { error: 'Refused', reason: 'schedule_changed' }),
        );
      mockRefreshAuthSession.mockResolvedValue(true);
      await expect(
        api.put('/api/user/delete-account/cancel-schedule', body, {
          accountEpoch,
          auth401Recovery: 'caller-owned',
        }),
      ).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[0]).toBe(
        'https://api.test.local/api/user/delete-account/cancel-schedule',
      );
      expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT', body: JSON.stringify(body) });
      expect(mockRefreshAuthSession).not.toHaveBeenCalled();
      expect(mockClearAuthSession).not.toHaveBeenCalled();
      expect(mockInvalidateCloudAccount).not.toHaveBeenCalled();
      expect(mockClearLocalCloudAccountState).not.toHaveBeenCalled();
    },
  );

  it('preserves the raw refusal and sends the original bearer once', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('original refusal', {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'x-request-id': 'original-request' },
      }),
    );
    const response = await apiFetch('/api/auth/step-up', {}, options);
    expect(response.status).toBe(401);
    expect(response.statusText).toBe('Unauthorized');
    expect(response.headers.get('x-request-id')).toBe('original-request');
    expect(await response.text()).toBe('original refusal');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization).toBe(
      'Bearer original-session-token',
    );
    expect(mockRefreshAuthSession).not.toHaveBeenCalled();
    expect(mockClearAuthSession).not.toHaveBeenCalled();
    expect(mockInvalidateCloudAccount).not.toHaveBeenCalled();
    expect(mockClearLocalCloudAccountState).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('uses the normal typed 401 error for parsed requests', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(401, { error: 'rejected' }));
    await expect(api.post('/api/mobile/push-token', {}, options)).rejects.toMatchObject({
      name: 'ApiHttpError',
      status: 401,
      code: 'auth_required',
    });
    expect(mockRefreshAuthSession).not.toHaveBeenCalled();
    expect(mockClearAuthSession).not.toHaveBeenCalled();
  });

  it('preserves binary refusal bytes without ambient recovery', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const response = makeResponse(401, '', 'application/octet-stream');
    response.arrayBuffer = jest.fn().mockResolvedValue(bytes);
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
    await expect(apiFetchBinary('/api/original-credential', {}, options)).resolves.toEqual({
      ok: false,
      status: 401,
      contentType: 'application/octet-stream',
      bytes,
    });
    expect(mockRefreshAuthSession).not.toHaveBeenCalled();
    expect(mockClearAuthSession).not.toHaveBeenCalled();
  });

  it('keeps the timeout until the caller-owned refusal body settles', async () => {
    const body = deferredBody<string>();
    const response = new Response(null, { status: 401 });
    response.text = body.read;
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
    const setTimer = jest.spyOn(globalThis, 'setTimeout');
    const clearTimer = jest.spyOn(globalThis, 'clearTimeout');
    const pending = apiFetch('/api/original-credential', {}, { ...options, timeout: 12345 });
    await body.started;
    const timerIndex = setTimer.mock.calls.findIndex(([, delay]) => delay === 12345);
    const timer = setTimer.mock.results[timerIndex]?.value;
    expect(timerIndex).toBeGreaterThanOrEqual(0);
    expect(clearTimer).not.toHaveBeenCalledWith(timer);
    body.resolve('refused');
    await pending;
    expect(clearTimer).toHaveBeenCalledWith(timer);
  });

  it('retains the generation fence while a 401 body is read', async () => {
    const body = deferredBody<string>();
    const response = makeResponse(401, {});
    response.text = body.read;
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
    const pending = apiFetch('/api/original-credential', {}, options);
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'StaleApiAccountOperationError',
    });
    await body.started;
    resetApiAccountState();
    body.resolve('refused');
    await rejected;
    expect(mockClearAuthSession).not.toHaveBeenCalled();
  });

  it('releases the timeout when the refusal body fails', async () => {
    const failure = new Error('body failed');
    const response = makeResponse(401, {});
    response.text = jest.fn().mockRejectedValue(failure);
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
    const setTimer = jest.spyOn(globalThis, 'setTimeout');
    const clearTimer = jest.spyOn(globalThis, 'clearTimeout');
    await expect(
      apiFetch('/api/original-credential', {}, { ...options, timeout: 12345 }),
    ).rejects.toBe(failure);
    const timerIndex = setTimer.mock.calls.findIndex(([, delay]) => delay === 12345);
    expect(timerIndex).toBeGreaterThanOrEqual(0);
    expect(clearTimer).toHaveBeenCalledWith(setTimer.mock.results[timerIndex]?.value);
    expect(mockClearAuthSession).not.toHaveBeenCalled();
  });

  it('retains the account epoch fence before exposing a 401', async () => {
    activateCloudAccount('caller-owned-a');
    const accountEpoch = captureCloudAccountEpoch();
    const network = deferredBody<Response>();
    jest.spyOn(globalThis, 'fetch').mockImplementationOnce(network.read);
    const pending = apiFetch('/api/original-credential', {}, { ...options, accountEpoch });
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'StaleCloudAccountOperationError',
    });
    await network.started;
    activateCloudAccount('caller-owned-b');
    network.resolve(makeResponse(401, {}));
    await rejected;
    expect(mockRefreshAuthSession).not.toHaveBeenCalled();
    expect(mockClearAuthSession).not.toHaveBeenCalled();
  });

  it('does not change ambient refresh and terminal logout for ordinary custom headers', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(401, {}))
      .mockResolvedValueOnce(makeResponse(401, {}));
    mockRefreshAuthSession.mockResolvedValueOnce(true);
    await expect(
      api.get('/api/default-recovery', { headers: { 'Idempotency-Key': 'same-request' } }),
    ).rejects.toThrow('Session expired');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mockRefreshAuthSession).toHaveBeenCalledTimes(1);
    expect(mockClearAuthSession).toHaveBeenCalledTimes(1);
  });

  it('does not suppress passkey refusals with the 401-only option', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        makeResponse(403, { error: { details: { reason: 'passkey_required' } } }),
      );
    await expect(apiFetch('/api/original-credential', {}, options)).rejects.toMatchObject({
      name: 'ApiHttpError',
      status: 403,
      code: 'PASSKEY_REQUIRED',
    });
    expect(mockAnnouncePasskeyRequired).toHaveBeenCalledTimes(1);
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSignedAppTransaction.mockReset().mockResolvedValue('signed-app-transaction-jws');
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
  const requests = [
    ['JSON', (path: string) => api.get(path)],
    ['text', (path: string) => apiFetch(path)],
    ['binary', (path: string) => apiFetchBinary(path)],
  ] as const;

  it.each(requests)('rejects stale %s passkey refusal without security events', async (_, run) => {
    const body = deferredBody<unknown>();
    const response = makeResponse(403, {});
    response.json = body.read;
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);

    const pending = run('/api/account-scoped');
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'StaleApiAccountOperationError',
    });
    await body.started;
    resetApiAccountState();
    body.resolve({ error: { details: { reason: 'passkey_required' } } });
    await rejected;

    expect(mockAnnouncePasskeyRequired).not.toHaveBeenCalled();
    expect(mockInvalidateCloudAccount).not.toHaveBeenCalled();
    expect(mockClearLocalCloudAccountState).not.toHaveBeenCalled();
    expect(mockClearAuthSession).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it.each(requests)('rejects stale %s account refusal without signing out', async (_, run) => {
    const body = deferredBody<unknown>();
    const response = makeResponse(403, {});
    response.json = jest.fn().mockResolvedValueOnce({}).mockImplementationOnce(body.read);
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);

    const pending = run('/api/me');
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'StaleApiAccountOperationError',
    });
    await body.started;
    resetApiAccountState();
    body.resolve({ error: { code: 'ACCOUNT_UNAVAILABLE', message: 'Account unavailable' } });
    await rejected;

    expect(mockAnnouncePasskeyRequired).not.toHaveBeenCalled();
    expect(mockInvalidateCloudAccount).not.toHaveBeenCalled();
    expect(mockClearLocalCloudAccountState).not.toHaveBeenCalled();
    expect(mockClearAuthSession).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('does not fall through a stale malformed identity refusal into sign-out', async () => {
    const body = deferredBody<unknown>();
    const response = makeResponse(403, {});
    response.json = jest.fn().mockResolvedValueOnce({}).mockImplementationOnce(body.read);
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);

    const pending = api.get('/api/me');
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'StaleApiAccountOperationError',
    });
    await body.started;
    resetApiAccountState();
    body.reject(new Error('Invalid JSON'));
    await rejected;

    expect(mockInvalidateCloudAccount).not.toHaveBeenCalled();
    expect(mockClearAuthSession).not.toHaveBeenCalled();
  });

  it('rejects buffered text that settles after account teardown', async () => {
    const body = deferredBody<string>();
    const response = makeResponse(200, {});
    response.text = body.read;
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);

    const pending = apiFetch('/api/account-scoped');
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'StaleApiAccountOperationError',
    });
    await body.started;
    resetApiAccountState();
    body.resolve('account-a');
    await rejected;
  });

  it('rejects buffered binary that settles after account teardown', async () => {
    const body = deferredBody<ArrayBuffer>();
    const response = makeResponse(200, {});
    response.arrayBuffer = body.read;
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);

    const pending = apiFetchBinary('/api/account-scoped');
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'StaleApiAccountOperationError',
    });
    await body.started;
    resetApiAccountState();
    body.resolve(new ArrayBuffer(4));
    await rejected;
  });

  it('keeps the original owner through a refresh and deferred binary body', async () => {
    const body = deferredBody<ArrayBuffer>();
    const response = makeResponse(200, {});
    response.arrayBuffer = body.read;
    mockRefreshAuthSession.mockResolvedValueOnce(true);
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(401, {}))
      .mockResolvedValueOnce(response);

    const pending = apiFetchBinary('/api/account-scoped');
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'StaleApiAccountOperationError',
    });
    await body.started;
    resetApiAccountState();
    body.resolve(new ArrayBuffer(4));
    await rejected;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockRefreshAuthSession).toHaveBeenCalledTimes(1);
    expect(mockInvalidateCloudAccount).not.toHaveBeenCalled();
  });

  it('preserves a same-owner passkey refusal', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        makeResponse(403, { error: { details: { reason: 'passkey_required' } } }),
      );

    await expect(api.get('/api/account-scoped')).rejects.toMatchObject({
      name: 'ApiHttpError',
      code: 'PASSKEY_REQUIRED',
    });
    expect(mockAnnouncePasskeyRequired).toHaveBeenCalledTimes(1);
    expect(mockInvalidateCloudAccount).not.toHaveBeenCalled();
  });

  it('preserves a same-owner account refusal even when cleanup resets API ownership', async () => {
    mockClearLocalCloudAccountState.mockImplementationOnce(resetApiAccountState);
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeResponse(403, {
        error: { code: 'ACCOUNT_UNAVAILABLE', message: 'Account unavailable' },
      }),
    );

    await expect(api.get('/api/me')).rejects.toThrow('HTTP 403: Account unavailable');
    expect(mockInvalidateCloudAccount).toHaveBeenCalledTimes(1);
    expect(mockClearLocalCloudAccountState).toHaveBeenCalledTimes(1);
    expect(mockClearAuthSession).toHaveBeenCalledTimes(1);
  });

  it('returns same-owner binary bytes and preserves bodyless responses', async () => {
    const bytes = new ArrayBuffer(4);
    const response = makeResponse(200, {});
    response.arrayBuffer = jest.fn().mockResolvedValue(bytes);
    const bodyless = makeResponse(204, {});
    bodyless.arrayBuffer = jest.fn();
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response).mockResolvedValueOnce(bodyless);

    await expect(apiFetchBinary('/api/account-scoped')).resolves.toMatchObject({ bytes });
    const empty = await apiFetchBinary('/api/account-scoped');
    expect(empty.status).toBe(204);
    expect(empty.bytes.byteLength).toBe(0);
    expect(bodyless.arrayBuffer).not.toHaveBeenCalled();
  });

  it('returns same-owner text and preserves bodyless text responses', async () => {
    const response = new Response('account-b', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
    const bodyless = new Response(null, { status: 204 });
    const readBodyless = jest.spyOn(bodyless, 'text');
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response).mockResolvedValueOnce(bodyless);

    const result = await apiFetch('/api/account-scoped');
    await expect(result.text()).resolves.toBe('account-b');
    expect(result.headers.get('content-type')).toBe('text/plain');
    const empty = await apiFetch('/api/account-scoped');
    expect(empty.status).toBe(204);
    await expect(empty.text()).resolves.toBe('');
    expect(readBodyless).not.toHaveBeenCalled();
  });

  it('preserves same-owner binary body failures', async () => {
    const failure = new Error('Body read failed');
    const response = makeResponse(200, {});
    response.arrayBuffer = jest.fn().mockRejectedValue(failure);
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);

    await expect(apiFetchBinary('/api/account-scoped')).rejects.toBe(failure);
  });

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
    mockClearLocalCloudAccountState.mockImplementationOnce(resetApiAccountState);
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
      ((value: { status: number; body: string; headers: object }) => void) | undefined;
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

  it('ends the session when a refreshed attachment presign is still unauthorized', async () => {
    mockRefreshAuthSession.mockResolvedValueOnce(true);
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(401, { error: 'expired' }))
      .mockResolvedValueOnce(makeResponse(401, { error: 'expired' }));

    await expect(
      api.uploadFile({ name: 'attachment.txt', type: 'text/plain', uri: 'file:///attachment.txt' }),
    ).rejects.toThrow('session expired');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockRefreshAuthSession).toHaveBeenCalledTimes(1);
    expect(mockCreateUploadTask).not.toHaveBeenCalled();
    expect(mockInvalidateCloudAccount).toHaveBeenCalledTimes(1);
  });

  it('refreshes an expired session at attachment completion without uploading the file again', async () => {
    mockGetAuthToken
      .mockResolvedValueOnce('old-token')
      .mockResolvedValueOnce('old-token')
      .mockResolvedValueOnce('new-token');
    mockRefreshAuthSession.mockResolvedValueOnce(true);
    mockUploadAsync.mockResolvedValueOnce({ status: 200, body: '', headers: {} });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        makeResponse(200, {
          storageKey: 'users/account-a/attachment.txt',
          uploadUrl: 'https://storage.example.test/upload',
          uploadMethod: 'PUT',
          uploadHeaders: { 'Content-Type': 'text/plain' },
        }),
      )
      .mockResolvedValueOnce(makeResponse(401, { error: 'expired' }))
      .mockResolvedValueOnce(
        makeResponse(200, {
          attachment: {
            id: '128db2b5-2967-4e55-b99b-44822727c8ea',
            url: '/api/files/128db2b5-2967-4e55-b99b-44822727c8ea',
            mimeType: 'text/plain',
            name: 'attachment.txt',
            byteCount: 32,
            type: 'file',
          },
        }),
      );

    await expect(
      api.uploadFile({ name: 'attachment.txt', type: 'text/plain', uri: 'file:///attachment.txt' }),
    ).resolves.toMatchObject({ name: 'attachment.txt' });

    expect(mockUploadAsync).toHaveBeenCalledTimes(1);
    expect(mockRefreshAuthSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer old-token',
    });
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer new-token',
    });
  });

  it('clears a terminal session failure at attachment completion', async () => {
    mockUploadAsync.mockResolvedValueOnce({ status: 200, body: '', headers: {} });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        makeResponse(200, {
          storageKey: 'users/account-a/attachment.txt',
          uploadUrl: 'https://storage.example.test/upload',
          uploadMethod: 'PUT',
          uploadHeaders: { 'Content-Type': 'text/plain' },
        }),
      )
      .mockResolvedValueOnce(makeResponse(401, { error: 'expired' }));

    await expect(
      api.uploadFile({ name: 'attachment.txt', type: 'text/plain', uri: 'file:///attachment.txt' }),
    ).rejects.toThrow('session expired');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockUploadAsync).toHaveBeenCalledTimes(1);
    expect(mockInvalidateCloudAccount).toHaveBeenCalledTimes(1);
    expect(mockClearLocalCloudAccountState).toHaveBeenCalledTimes(1);
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
      reason: 'Video generation requires Max 20x',
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
          'No free capacity right now. Try again shortly, or use your own provider key. Paid upgrades are opening in stages, so they need an access code or a place on the upgrade waitlist.',
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

describe('stream refresh account ownership', () => {
  it.each([true, false])(
    'rejects a delayed refresh result %s without touching the next account',
    async (refreshed) => {
      activateCloudAccount('refresh-account-a');
      const account = captureCloudAccountEpoch();
      if (!account) throw new Error('Expected an active test account');
      const refresh = deferredBody<boolean>();
      mockRefreshAuthSession.mockImplementation(refresh.read);
      const pending = recoverStreamSession(account);
      const rejected = expect(pending).rejects.toMatchObject({
        name: 'StaleCloudAccountOperationError',
      });
      await refresh.started;
      activateCloudAccount('refresh-account-b');
      refresh.resolve(refreshed);
      await rejected;
      expect(mockInvalidateCloudAccount).not.toHaveBeenCalled();
      expect(mockClearLocalCloudAccountState).not.toHaveBeenCalled();
      expect(mockClearAuthSession).not.toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(captureCloudAccountEpoch()?.ownerId).toBe('refresh-account-b');
    },
  );
});

describe('caller-bound Cloud account request epochs', () => {
  it('rejects replacement credentials before dispatch even without an API generation reset', async () => {
    activateCloudAccount('bound-request-a');
    const accountEpoch = captureCloudAccountEpoch();
    const credentials = deferredBody<Record<string, string>>();
    mockGetAuthHeaders.mockImplementationOnce(credentials.read);
    const fetch = jest.spyOn(globalThis, 'fetch');
    const pending = api.post('/api/project-knowledge', {}, { accountEpoch });
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'StaleCloudAccountOperationError',
    });
    await credentials.started;
    activateCloudAccount('bound-request-b');
    credentials.resolve({ Authorization: 'Bearer replacement-test-token' });
    await rejected;
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a stale JSON receipt after the body await', async () => {
    activateCloudAccount('bound-body-a');
    const accountEpoch = captureCloudAccountEpoch();
    const body = deferredBody<unknown>();
    const response = makeResponse(200, {});
    response.json = body.read;
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
    const pending = api.post('/api/project-knowledge', {}, { accountEpoch });
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'StaleCloudAccountOperationError',
    });
    await body.started;
    activateCloudAccount('bound-body-b');
    body.resolve({ file: 'original receipt' });
    await rejected;
  });

  it.each([true, false])(
    'does not retry or sign out a replacement account after refresh returns %s',
    async (refreshed) => {
      activateCloudAccount('bound-refresh-a');
      const accountEpoch = captureCloudAccountEpoch();
      const refresh = deferredBody<boolean>();
      mockRefreshAuthSession.mockImplementationOnce(refresh.read);
      const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(401, {}));
      const pending = api.post('/api/project-knowledge', {}, { accountEpoch });
      const rejected = expect(pending).rejects.toMatchObject({
        name: 'StaleCloudAccountOperationError',
      });
      await refresh.started;
      activateCloudAccount('bound-refresh-b');
      refresh.resolve(refreshed);
      await rejected;
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(mockGetAuthHeaders).toHaveBeenCalledTimes(1);
      expect(mockInvalidateCloudAccount).not.toHaveBeenCalled();
      expect(mockClearLocalCloudAccountState).not.toHaveBeenCalled();
      expect(mockClearAuthSession).not.toHaveBeenCalled();
    },
  );
});

describe('native app-transaction preparation uses its original Cloud account', () => {
  beforeEach(() => {
    jest
      .mocked(globalThis.fetch)
      .mockReset()
      .mockRejectedValue(new Error('Unexpected fetch during native registration isolation'));
  });
  afterEach(() => jest.restoreAllMocks());

  it('reaches the real API transport for a current account', async () => {
    activateCloudAccount('native-registration-current');
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(200, { registered: true, consentWithdrawn: false }));

    await registerAppTransactionForAccount('native-registration-current');

    expect(mockSignedAppTransaction).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.test.local/api/mobile/age-assurance/app-transaction',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ signedAppTransaction: 'signed-app-transaction-jws' }),
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
  });

  it('never requests replacement credentials or dispatches stale native work', async () => {
    activateCloudAccount('native-registration-original');
    const native = deferredBody<string>();
    mockSignedAppTransaction.mockImplementationOnce(native.read);
    const fetch = jest.spyOn(globalThis, 'fetch');
    const pending = registerAppTransactionForAccount('native-registration-original');
    await native.started;
    activateCloudAccount('native-registration-replacement');
    resetApiAccountState();
    mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer replacement-test-token' });
    native.resolve('signed-app-transaction-jws');
    await pending;

    expect(mockSignedAppTransaction).toHaveBeenCalledTimes(1);
    expect(mockGetAuthHeaders).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
