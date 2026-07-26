const mockSecureFetch = jest.fn();
jest.mock('@/services/secureFetch', () => ({
  secureFetch: (input: unknown, init: unknown) => mockSecureFetch(input, init),
}));

const mockGetDeviceId = jest.fn();
jest.mock('@/lib/deviceId', () => ({
  getDeviceId: () => mockGetDeviceId(),
}));

const mockNetInfoRefresh = jest.fn().mockResolvedValue(undefined);
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { refresh: (...args: unknown[]) => mockNetInfoRefresh(...args) },
}));

let mockAppMode: unknown = 'local';
jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: {
    getState: () => ({ appMode: mockAppMode }),
  },
}));

import { EgressBlockedError, guardedFetch } from '../lib/egressGuard';
import { unregisterPushTokenForSignOut } from '../src/features/auth/services/signOutPushTokenCleanup';

describe('sign-out push-token cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppMode = 'local';
    mockGetDeviceId.mockResolvedValue('device A/1');
    mockSecureFetch.mockResolvedValue(new Response(null, { status: 204 }));
  });

  it('uses captured Clerk auth for only the exact TLS-pinned DELETE endpoint', async () => {
    await unregisterPushTokenForSignOut('captured-clerk-jwt');

    expect(mockSecureFetch).toHaveBeenCalledTimes(1);
    expect(mockSecureFetch).toHaveBeenCalledWith(
      'https://agiworkforce.com/api/mobile/push-token?deviceId=device+A%2F1',
      expect.objectContaining({
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer captured-clerk-jwt',
          'X-Requested-With': 'XMLHttpRequest',
        },
        signal: expect.any(Object),
      }),
    );
  });

  it('does not create a general Local-mode bypass for arbitrary Cloud requests', async () => {
    await unregisterPushTokenForSignOut('captured-clerk-jwt');
    mockSecureFetch.mockClear();

    await expect(
      guardedFetch('https://agiworkforce.com/api/chat/conversations', { method: 'DELETE' }),
    ).rejects.toBeInstanceOf(EgressBlockedError);
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });

  it('does not attempt a request without a captured Clerk credential', async () => {
    await unregisterPushTokenForSignOut('   ');

    expect(mockGetDeviceId).not.toHaveBeenCalled();
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });

  it('aborts best-effort cleanup after five seconds so offline sign-out can continue', async () => {
    jest.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    mockSecureFetch.mockImplementation(
      (_input: unknown, init: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          requestSignal = init.signal;
          init.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );

    try {
      const cleanup = unregisterPushTokenForSignOut('captured-clerk-jwt');
      await Promise.resolve();
      await Promise.resolve();

      jest.advanceTimersByTime(5_000);

      await expect(cleanup).rejects.toThrow('Push-token sign-out cleanup timed out');
      expect(requestSignal?.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
