jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(),
  getAuthHeaders: jest.fn(),
  refreshAuthSession: jest.fn(),
  clearAuthSession: jest.fn(),
}));

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
}));

jest.mock('../lib/constants', () => ({
  API_URL: 'https://api.test.local',
  TIMEOUTS: { DEFAULT: 8_000 },
}));

jest.mock('../lib/abortSignal', () => ({
  combineAbortSignals: (signals: AbortSignal[]) => signals[0],
}));

jest.mock('../lib/egressGuard', () => ({
  guardedFetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
}));

jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  invalidateCloudAccount: jest.fn(),
}));

jest.mock('../src/features/auth/services/cloudAccountTeardown', () => ({
  clearLocalCloudAccountState: jest.fn(),
}));

jest.mock('../src/platform/platformHeaders', () => ({
  platformRequestHeaders: () => ({}),
}));

import { api, resetApiAccountState } from '../services/api';
import {
  clearAuthSession,
  getAuthHeaders,
  getAuthToken,
  refreshAuthSession,
} from '../services/authSession';
import { Alert } from 'react-native';
import { TERMS_ACCEPTANCE_PATH } from '@agiworkforce/cloud-contracts';
import { CloudCredentialUnavailableError } from '../services/apiErrors';
import { invalidateCloudAccount } from '../src/features/auth/services/cloudAccountSession';
import { clearLocalCloudAccountState } from '../src/features/auth/services/cloudAccountTeardown';
import {
  isSignInOwedForEndedSession,
  settleSignInForEndedSession,
} from '../src/features/auth/services/endedSession';

const mockGetAuthToken = getAuthToken as jest.Mock;
const mockGetAuthHeaders = getAuthHeaders as jest.Mock;
const mockRefreshAuthSession = refreshAuthSession as jest.Mock;
const mockClearAuthSession = clearAuthSession as jest.Mock;

function mockToken(token: string) {
  mockGetAuthToken.mockResolvedValue(token);
  mockGetAuthHeaders.mockResolvedValue({ Authorization: `Bearer ${token}` });
}

function mockNoToken() {
  mockGetAuthToken.mockResolvedValue(null);
  mockGetAuthHeaders.mockResolvedValue({});
}

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn(async () => JSON.stringify(body)),
    json: jest.fn(async () => body),
    clone() {
      return this;
    },
  } as unknown as Response;
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  resetApiAccountState();
  settleSignInForEndedSession();
  mockToken('access-token-valid');
  mockRefreshAuthSession.mockResolvedValue(false);
  mockClearAuthSession.mockResolvedValue(undefined);
});

describe('2xx responses', () => {
  it('returns parsed JSON from a successful GET', async () => {
    const responseBody = { data: 'hello' };
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(200, responseBody));

    const result = await api.get<typeof responseBody>('/api/test');

    expect(result).toEqual(responseBody);
  });

  it('includes Authorization header from the session token', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(200, {}));

    await api.get('/api/secure');

    const calls = (globalThis.fetch as jest.Mock).mock.calls;
    const requestInit = calls[0]?.[1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer access-token-valid');
  });

  it('omits Authorization header when no session exists', async () => {
    mockNoToken();
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(200, {}));

    await api.get('/api/public');

    const calls = (globalThis.fetch as jest.Mock).mock.calls;
    const headers = (calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });
});

it('does not send a signed-in Terms request without a bound mobile credential', async () => {
  mockNoToken();
  const fetchSpy = jest.spyOn(globalThis, 'fetch');

  await expect(api.get(TERMS_ACCEPTANCE_PATH)).rejects.toBeInstanceOf(
    CloudCredentialUnavailableError,
  );
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(mockClearAuthSession).not.toHaveBeenCalled();
});

describe('401 handling, refresh and retry', () => {
  it('retries the request with a new token after successful refresh', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    fetchSpy
      .mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(makeResponse(200, { data: 'retried' }));

    mockRefreshAuthSession.mockResolvedValueOnce(true);
    mockGetAuthHeaders
      .mockResolvedValueOnce({ Authorization: 'Bearer access-token-valid' })
      .mockResolvedValueOnce({ Authorization: 'Bearer new-refreshed-token' });

    const result = await api.get<{ data: string }>('/api/needs-refresh');

    expect(result).toEqual({ data: 'retried' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(mockRefreshAuthSession).toHaveBeenCalledTimes(1);
  });

  it('clears the token-refresh deadline after a successful refresh', async () => {
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(401, {}))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));
    mockRefreshAuthSession.mockResolvedValueOnce(true);

    await api.get('/api/retry');

    const refreshTimerIndex = setTimeoutSpy.mock.calls.findIndex(([, delay]) => delay === 10_000);
    expect(refreshTimerIndex).toBeGreaterThanOrEqual(0);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(
      setTimeoutSpy.mock.results[refreshTimerIndex]?.value,
    );
  });

  it('does not retry a second time when _skipAuthRetry is set (avoids infinite loop)', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    fetchSpy.mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }));

    mockRefreshAuthSession.mockResolvedValueOnce(false);

    await expect(api.get('/api/expired')).rejects.toBeInstanceOf(CloudCredentialUnavailableError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the request remains unauthorized after refresh', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }));
    mockRefreshAuthSession.mockResolvedValueOnce(true);

    await expect(api.get('/api/still-refused')).rejects.toBeInstanceOf(
      CloudCredentialUnavailableError,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(mockRefreshAuthSession).toHaveBeenCalledTimes(1);
    expect(mockClearAuthSession).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe('a refusal the refresh cannot recover', () => {
  beforeEach(() => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(401, {}));
    mockRefreshAuthSession.mockResolvedValueOnce(false);
  });

  it('neither signs out nor leaves Cloud: Clerk alone says when a session has ended', async () => {
    await expect(api.get('/api/refused')).rejects.toBeInstanceOf(CloudCredentialUnavailableError);

    expect(mockClearAuthSession).not.toHaveBeenCalled();
    expect(invalidateCloudAccount).not.toHaveBeenCalled();
    expect(clearLocalCloudAccountState).not.toHaveBeenCalled();
    expect(isSignInOwedForEndedSession()).toBe(false);
  });

  it('raises no alert', async () => {
    await expect(api.get('/api/refused')).rejects.toThrow();

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('reports an account it could not confirm, never an expired session', async () => {
    await expect(api.get('/api/refused')).rejects.toThrow(
      'Could not confirm your account. Try again.',
    );
  });
});

describe('a 403 on the account check', () => {
  it('keeps the session and reports the reason the server gave', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeResponse(403, {
        error: {
          code: 'workspace_access_denied',
          message: 'You are not a member of that workspace.',
        },
      }),
    );

    await expect(api.get('/api/me?surface=mobile')).rejects.toMatchObject({
      status: 403,
      code: 'workspace_access_denied',
      message: 'You are not a member of that workspace.',
    });

    expect(invalidateCloudAccount).not.toHaveBeenCalled();
    expect(clearLocalCloudAccountState).not.toHaveBeenCalled();
    expect(mockClearAuthSession).not.toHaveBeenCalled();
    expect(isSignInOwedForEndedSession()).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe('a refusal of a request that carried no credential', () => {
  it('is not an expired session: nothing is torn down and no alert is raised', async () => {
    mockNoToken();
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(401, {}));
    mockRefreshAuthSession.mockResolvedValueOnce(false);

    await expect(api.get('/api/connectors')).rejects.toBeInstanceOf(
      CloudCredentialUnavailableError,
    );

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockClearAuthSession).not.toHaveBeenCalled();
    expect(invalidateCloudAccount).not.toHaveBeenCalled();
    expect(clearLocalCloudAccountState).not.toHaveBeenCalled();
  });

  it('is retried with the credential once the session can mint one', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(401, {}))
      .mockResolvedValueOnce(makeResponse(200, { connectors: [] }));
    mockGetAuthHeaders
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Authorization: 'Bearer minted-after-load' });
    mockRefreshAuthSession.mockResolvedValueOnce(true);

    await expect(api.get('/api/connectors')).resolves.toEqual({ connectors: [] });

    const retried = (fetchSpy.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>;
    expect(retried['Authorization']).toBe('Bearer minted-after-load');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('does not end the session when a caller-supplied credential is refused', async () => {
    mockNoToken();
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(401, {}));
    mockRefreshAuthSession.mockResolvedValueOnce(false);

    await expect(
      api.get('/api/refused', { headers: { authorization: 'Bearer caller-token' } }),
    ).rejects.toBeInstanceOf(CloudCredentialUnavailableError);

    expect(mockClearAuthSession).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe('concurrent 401 de-duplication', () => {
  it('serialises concurrent refresh calls, only one network call is made', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    fetchSpy
      .mockResolvedValueOnce(makeResponse(401, {}))
      .mockResolvedValueOnce(makeResponse(401, {}))
      .mockResolvedValue(makeResponse(200, { ok: true }));

    let resolveRefresh!: (value: unknown) => void;
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });

    mockRefreshAuthSession.mockReturnValueOnce(refreshPromise.then(() => true));

    const req1 = api.get('/api/concurrent-1');
    const req2 = api.get('/api/concurrent-2');

    await Promise.resolve();
    resolveRefresh(undefined);

    await Promise.allSettled([req1, req2]);

    expect(mockRefreshAuthSession).toHaveBeenCalledTimes(1);
  });
});

describe('non-401 errors pass through', () => {
  it('throws for 403 Forbidden without attempting refresh', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(403, 'Forbidden'));

    await expect(api.get('/api/forbidden')).rejects.toThrow('403');
    expect(mockRefreshAuthSession).not.toHaveBeenCalled();
  });

  it('throws for 500 Internal Server Error without attempting refresh', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(500, 'Server error'));

    await expect(api.get('/api/server-error')).rejects.toMatchObject({ status: 500 });
    expect(mockRefreshAuthSession).not.toHaveBeenCalled();
  });

  it('throws for 404 Not Found without attempting refresh', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(404, 'Not found'));

    await expect(api.get('/api/missing')).rejects.toThrow('404');
    expect(mockRefreshAuthSession).not.toHaveBeenCalled();
  });

  it('propagates network errors (fetch throws)', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network unreachable'));

    await expect(api.get('/api/offline')).rejects.toThrow('Network unreachable');
    expect(mockRefreshAuthSession).not.toHaveBeenCalled();
  });
});

describe('HTTP method helpers', () => {
  it('api.post sends method=POST with JSON body', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(201, { id: 'new-item' }));

    await api.post('/api/items', { name: 'test' });

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'test' }));
  });

  it('api.delete sends method=DELETE', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(204, {}));

    await api.delete('/api/items/1');

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('DELETE');
  });
});
