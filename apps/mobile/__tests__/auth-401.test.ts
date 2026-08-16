

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(),
  getAuthHeaders: jest.fn(),
  refreshAuthSession: jest.fn(),
  clearAuthSession: jest.fn(),
}));

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

jest.mock('../lib/constants', () => ({
  API_URL: 'https://api.test.local',
  TIMEOUTS: { DEFAULT: 10_000 },
}));

jest.mock('../lib/abortSignal', () => ({
  combineAbortSignals: (signals: AbortSignal[]) => signals[0],
}));

import { api } from '../services/api';
import {
  clearAuthSession,
  getAuthHeaders,
  getAuthToken,
  refreshAuthSession,
} from '../services/authSession';
import { Alert } from 'react-native';

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
  } as unknown as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
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

describe('401 handling — refresh and retry', () => {
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

  it('does not retry a second time when _skipAuthRetry is set (avoids infinite loop)', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    fetchSpy.mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }));

    mockRefreshAuthSession.mockResolvedValueOnce(false);

    await expect(api.get('/api/expired')).rejects.toThrow('401');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('failed refresh triggers local cloud-session cleanup', () => {
  it('clears the auth session facade when refresh returns no session', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(401, {}));

    mockRefreshAuthSession.mockResolvedValueOnce(false);

    await expect(api.get('/api/expired')).rejects.toThrow('401');

    expect(mockClearAuthSession).toHaveBeenCalledTimes(1);
  });

  it('shows an alert when session is unrecoverably expired', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(401, {}));

    mockRefreshAuthSession.mockResolvedValueOnce(false);

    await expect(api.get('/api/expired')).rejects.toThrow();

    expect(Alert.alert).toHaveBeenCalledWith(
      'Session Expired',
      expect.stringContaining('sign in'),
      expect.any(Array),
    );
  });

  it('throws with a descriptive message after failed refresh', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(401, {}));

    mockRefreshAuthSession.mockResolvedValueOnce(false);

    await expect(api.get('/api/expired')).rejects.toThrow('Session expired');
  });
});

describe('concurrent 401 de-duplication', () => {
  it('serialises concurrent refresh calls — only one network call is made', async () => {
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

    await expect(api.get('/api/server-error')).rejects.toThrow('500');
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
