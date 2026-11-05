import { act, renderHook } from '@testing-library/react-native';
import {
  TIME_FOCUS_PREFERENCES_NAMESPACE,
  normalizeTimeFocusPreferences,
  type TimeFocusPreferences,
} from '@agiworkforce/types';
import {
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  managedCloudPreferencesNamespacePath,
} from '@agiworkforce/cloud-contracts';

const mockGet = jest.fn();
const mockPut = jest.fn();

jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
  },
}));
jest.mock('@/lib/mmkv', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));
jest.mock('@/src/features/auth/store', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand');
  return {
    useAuthStore: create(() => ({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'account-a',
    })),
  };
});
jest.mock('@/src/features/chat/store/appModeStore', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand');
  return { useChatAppModeStore: create(() => ({ appMode: 'cloud' })) };
});
jest.mock('@/stores/notificationPrefsStore', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand');
  const { normalizeTimeFocusPreferences: normalize } =
    jest.requireActual<typeof import('@agiworkforce/types')>('@agiworkforce/types');
  return {
    useNotificationPrefsStore: create<
      TimeFocusPreferences & {
        applyTimeFocusPreferences: (value: TimeFocusPreferences) => void;
      }
    >((set) => ({
      ...normalize({}, 'UTC'),
      applyTimeFocusPreferences: jest.fn((value: TimeFocusPreferences) => set(value)),
    })),
  };
});

import { useTimeFocusSync } from '@/src/features/settings/notifications/useTimeFocusSync';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useNotificationPrefsStore } from '@/stores/notificationPrefsStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  captureCloudAccountEpoch,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function readyHook() {
  const hook = renderHook(() => useTimeFocusSync());
  await act(async () => {});
  expect(hook.result.current.status).toBe('synced');
  return hook;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockGet.mockReset().mockResolvedValue({ settings: {} });
  mockPut.mockReset().mockResolvedValue(undefined);
  __resetCloudAccountSessionForTests();
  activateCloudAccount('account-a');
  useAuthStore.setState({ clerkUserId: 'account-a', isClerkLoaded: true, isClerkSignedIn: true });
  useChatAppModeStore.setState({ appMode: 'cloud' });
  useNotificationPrefsStore.setState(normalizeTimeFocusPreferences({}, 'UTC'));
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('time and focus account ownership', () => {
  it('reads and debounces current-owner saves through the canonical preference API', async () => {
    const account = captureCloudAccountEpoch();
    const { result } = await readyHook();
    expect(mockGet).toHaveBeenCalledWith(
      managedCloudPreferencesNamespacePath(TIME_FOCUS_PREFERENCES_NAMESPACE),
      { accountEpoch: account, signal: expect.any(AbortSignal) },
    );
    act(() => {
      result.current.push();
      jest.advanceTimersByTime(400);
    });
    act(() => {
      useNotificationPrefsStore.setState({ breakReminderMinutes: 30 });
      result.current.push();
      jest.advanceTimersByTime(599);
    });
    expect(mockPut).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith(
      MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
      {
        namespace: TIME_FOCUS_PREFERENCES_NAMESPACE,
        value: expect.objectContaining({ breakReminderMinutes: 30 }),
      },
      { accountEpoch: account, signal: expect.any(AbortSignal) },
    );
    expect(result.current.status).toBe('synced');
  });

  it.each(['mode', 'sign-out', 'identity', 'loaded', 'epoch', 'account-b'])(
    'cancels the queued save synchronously on %s change', async (kind) => {
      const { result } = await readyHook();
      act(() => {
        useNotificationPrefsStore.setState({ breakReminderMinutes: 30 });
        result.current.push();
        if (kind === 'mode') useChatAppModeStore.setState({ appMode: 'local' });
        if (kind === 'sign-out') useAuthStore.setState({ isClerkSignedIn: false });
        if (kind === 'identity') useAuthStore.setState({ clerkUserId: 'account-b' });
        if (kind === 'loaded') useAuthStore.setState({ isClerkLoaded: false });
        if (kind === 'epoch') invalidateCloudAccount();
        if (kind === 'account-b') {
          activateCloudAccount('account-b');
          useAuthStore.setState({ clerkUserId: 'account-b' });
        }
        jest.advanceTimersByTime(600);
      });
      expect(mockPut).not.toHaveBeenCalled();
      expect(useNotificationPrefsStore.getState().breakReminderMinutes).toBe(30);
      await act(async () => {});
      expect(result.current.status).toBe(kind === 'account-b' ? 'synced' : 'local');
    },
  );

  it.each(['account', 'mode', 'authentication', 'identity'])(
    'does not revive the timer when %s leaves and returns in one React batch', async (kind) => {
      const { result } = await readyHook();
      const original = captureCloudAccountEpoch();
      act(() => {
        result.current.push();
        if (kind === 'account') {
          activateCloudAccount('account-b');
          activateCloudAccount('account-a');
        } else if (kind === 'mode') {
          useChatAppModeStore.setState({ appMode: 'local' });
          useChatAppModeStore.setState({ appMode: 'cloud' });
        } else if (kind === 'authentication') {
          useAuthStore.setState({ isClerkSignedIn: false });
          useAuthStore.setState({ isClerkSignedIn: true });
        } else {
          useAuthStore.setState({ clerkUserId: 'account-b' });
          useAuthStore.setState({ clerkUserId: 'account-a' });
        }
        jest.advanceTimersByTime(600);
      });
      expect(mockPut).not.toHaveBeenCalled();
      if (kind === 'account') expect(captureCloudAccountEpoch()).not.toEqual(original);
      await act(async () => {});
      await act(async () => {
        result.current.push();
        jest.advanceTimersByTime(600);
      });
      expect(mockPut).toHaveBeenCalledTimes(1);
      expect(mockPut.mock.calls[0][2].accountEpoch).toEqual(captureCloudAccountEpoch());
    },
  );

  it('rejects an already-dispatched timer callback after its owner is retired', async () => {
    const { result } = await readyHook();
    const timeout = jest.spyOn(global, 'setTimeout');
    act(() => result.current.push());
    const callback = timeout.mock.calls.filter((call) => call[1] === 600).slice(-1)[0]?.[0];
    expect(typeof callback).toBe('function');
    act(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
      useChatAppModeStore.setState({ appMode: 'cloud' });
      if (typeof callback === 'function') callback();
    });
    expect(mockPut).not.toHaveBeenCalled();
    timeout.mockRestore();
    await act(async () => {});
  });

  it('keeps local edits without reading or saving while signed out', async () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    useAuthStore.setState({ isClerkSignedIn: false, clerkUserId: null });
    invalidateCloudAccount();
    const { result } = renderHook(() => useTimeFocusSync());
    await act(async () => {
      useNotificationPrefsStore.setState({ breakReminderMinutes: 30 });
      result.current.push();
      jest.advanceTimersByTime(600);
    });
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
    expect(useNotificationPrefsStore.getState().breakReminderMinutes).toBe(30);
    expect(result.current.status).toBe('local');
  });

  it.each(['resolve', 'reject'])(
    'does not publish an in-flight save %s into a replacement owner', async (outcome) => {
      const { result } = await readyHook();
      const old = deferred<void>();
      mockPut.mockImplementationOnce(() => old.promise);
      act(() => {
        result.current.push();
        jest.advanceTimersByTime(600);
      });
      const oldOptions = mockPut.mock.calls[0][2];
      const nextRead = deferred<unknown>();
      mockGet.mockImplementationOnce(() => nextRead.promise);
      act(() => {
        activateCloudAccount('account-b');
        useAuthStore.setState({ clerkUserId: 'account-b' });
      });
      expect(oldOptions.signal.aborted).toBe(true);
      await act(async () => {
        if (outcome === 'resolve') old.resolve(undefined);
        else old.reject(new Error('old account failed'));
      });
      expect(result.current.status).toBe('loading');
      expect(result.current.error).toBeNull();
      await act(async () => {
        nextRead.resolve({ settings: { breakReminderMinutes: 30 } });
      });
      expect(result.current.status).toBe('synced');
      expect(useNotificationPrefsStore.getState().breakReminderMinutes).toBe(30);
    },
  );

  it.each(['local', 'mode-return', 'account-return'])(
    'ignores in-flight completion after %s even when the owner ID matches again', async (transition) => {
      const { result } = await readyHook();
      const old = deferred<void>();
      mockPut.mockImplementationOnce(() => old.promise);
      act(() => {
        result.current.push();
        jest.advanceTimersByTime(600);
      });
      const nextRead = deferred<unknown>();
      mockGet.mockImplementationOnce(() => nextRead.promise);
      act(() => {
        if (transition === 'account-return') {
          activateCloudAccount('account-b');
          activateCloudAccount('account-a');
        } else {
          useChatAppModeStore.setState({ appMode: 'local' });
          if (transition === 'mode-return') useChatAppModeStore.setState({ appMode: 'cloud' });
        }
      });
      await act(async () => {
        old.resolve(undefined);
      });
      expect(result.current.status).toBe(transition === 'local' ? 'local' : 'loading');
      expect(result.current.error).toBeNull();
      expect(mockPut.mock.calls[0][2].signal.aborted).toBe(true);
      if (transition !== 'local') {
        await act(async () => {
          nextRead.resolve({ settings: {} });
        });
        expect(result.current.status).toBe('synced');
      }
    },
  );

  it.each(['resolve', 'reject'])(
    'does not publish an old read %s after switching to Local', async (outcome) => {
      const old = deferred<unknown>();
      mockGet.mockImplementationOnce(() => old.promise);
      const { result } = renderHook(() => useTimeFocusSync());
      act(() => {
        useChatAppModeStore.setState({ appMode: 'local' });
        useNotificationPrefsStore.setState({ breakReminderMinutes: 30 });
      });
      await act(async () => {
        if (outcome === 'resolve') old.resolve({ settings: { breakReminderMinutes: 60 } });
        else old.reject(new Error('old read failed'));
      });
      expect(result.current.status).toBe('local');
      expect(result.current.error).toBeNull();
      expect(useNotificationPrefsStore.getState().breakReminderMinutes).toBe(30);
      expect(mockGet.mock.calls[0][1].signal.aborted).toBe(true);
    },
  );

  it('cancels pending work on unmount', async () => {
    const { result, unmount } = await readyHook();
    act(() => result.current.push());
    unmount();
    act(() => jest.advanceTimersByTime(600));
    expect(mockPut).not.toHaveBeenCalled();
    expect(mockGet.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it.each(['resolve', 'reject'])(
    'aborts an in-flight save on unmount before it can %s', async (outcome) => {
      const { result, unmount } = await readyHook();
      const old = deferred<void>();
      mockPut.mockImplementationOnce(() => old.promise);
      act(() => {
        result.current.push();
        jest.advanceTimersByTime(600);
      });
      unmount();
      expect(mockPut.mock.calls[0][2].signal.aborted).toBe(true);
      await act(async () => {
        if (outcome === 'resolve') old.resolve(undefined);
        else old.reject(new Error('unmounted'));
      });
      expect(mockPut).toHaveBeenCalledTimes(1);
    },
  );

  it('reports current-owner failure and lets the next edit retry', async () => {
    const { result } = await readyHook();
    mockPut.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      result.current.push();
      jest.advanceTimersByTime(600);
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/Could not save/);
    await act(async () => {
      result.current.push();
      jest.advanceTimersByTime(600);
    });
    expect(mockPut).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('synced');
    expect(result.current.error).toBeNull();
  });

  it('reports current-owner read failure without sending a save', async () => {
    mockGet.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useTimeFocusSync());
    await act(async () => {});
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/Could not load/);
    expect(mockPut).not.toHaveBeenCalled();
  });
});
