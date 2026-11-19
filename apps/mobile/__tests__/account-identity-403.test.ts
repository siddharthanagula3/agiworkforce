import { Alert } from 'react-native';

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(),
  getAuthHeaders: jest.fn(),
  refreshAuthSession: jest.fn(),
  clearAuthSession: jest.fn(),
}));

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

jest.mock('../lib/egressGuard', () => ({ guardedFetch: jest.fn() }));

jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  invalidateCloudAccount: jest.fn(),
}));

jest.mock('../src/features/auth/services/cloudAccountTeardown', () => ({
  clearLocalCloudAccountState: jest.fn(),
}));

import { api } from '../services/api';
import {
  clearAuthSession,
  getAuthHeaders,
  getAuthToken,
  refreshAuthSession,
} from '../services/authSession';
import { guardedFetch } from '../lib/egressGuard';
import { invalidateCloudAccount } from '../src/features/auth/services/cloudAccountSession';
import { clearLocalCloudAccountState } from '../src/features/auth/services/cloudAccountTeardown';

const mockFetch = guardedFetch as jest.Mock;
const mockRefresh = refreshAuthSession as jest.Mock;

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: jest.fn(async () => JSON.stringify(body)),
    json: jest.fn(async () => body),
    clone() {
      return this;
    },
  } as unknown as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (getAuthToken as jest.Mock).mockResolvedValue('token-of-a-deleted-account');
  (getAuthHeaders as jest.Mock).mockResolvedValue({
    Authorization: 'Bearer token-of-a-deleted-account',
  });
  (clearAuthSession as jest.Mock).mockResolvedValue(undefined);
  mockRefresh.mockResolvedValue(false);
});

describe('a 403 from the server', () => {
  it('keeps the session when the identity route refuses for a reason it states', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(403, {
        error: { code: 'FORBIDDEN', message: 'You are not a member of that workspace.' },
      }),
    );

    await expect(api.get('/api/me?surface=mobile')).rejects.toThrow(
      'You are not a member of that workspace.',
    );

    expect(invalidateCloudAccount).not.toHaveBeenCalled();
    expect(clearLocalCloudAccountState).not.toHaveBeenCalled();
    expect(clearAuthSession).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('keeps the session when one action is denied on another route', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(403, { error: { code: 'FORBIDDEN' } }));

    await expect(api.get('/api/admin/security')).rejects.toThrow('403');

    expect(invalidateCloudAccount).not.toHaveBeenCalled();
    expect(clearLocalCloudAccountState).not.toHaveBeenCalled();
    expect(clearAuthSession).not.toHaveBeenCalled();
  });

  it('does not mistake a path that merely starts with the identity route', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(403, {}));

    await expect(api.get('/api/memory/entries')).rejects.toThrow('403');

    expect(clearLocalCloudAccountState).not.toHaveBeenCalled();
  });
});
