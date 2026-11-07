import { act, cleanup, renderHook } from '@testing-library/react-native';
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
  return { useAuthStore: create(() => ({
    isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'account-a',
  })) };
});
jest.mock('@/src/features/chat/store/appModeStore', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand');
  return { useChatAppModeStore: create(() => ({ appMode: 'cloud' })) };
});

import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  captureCloudAccountEpoch,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE as NAMESPACE,
  AGENT_ACTIVITY_PUSH_PREFERENCE_KEY as KEY,
  useAgentActivityPushSync,
} from '@/src/features/settings/notifications/useAgentActivityPushSync';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const response = (enabled: boolean) => ({ settings: { [KEY]: enabled } });
const transitions = ['account', 'epoch', 'mode', 'signed-in', 'identity', 'loaded'] as const;
type Transition = (typeof transitions)[number];

function leaveAndReturn(kind: Transition) {
  if (kind === 'account') {
    activateCloudAccount('account-b');
    useAuthStore.setState({ clerkUserId: 'account-b' });
    activateCloudAccount('account-a');
    useAuthStore.setState({ clerkUserId: 'account-a' });
  } else if (kind === 'epoch') {
    invalidateCloudAccount();
    activateCloudAccount('account-a');
  } else if (kind === 'mode') {
    useChatAppModeStore.setState({ appMode: 'local' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
  } else if (kind === 'signed-in') {
    useAuthStore.setState({ isClerkSignedIn: false });
    useAuthStore.setState({ isClerkSignedIn: true });
  } else if (kind === 'identity') {
    useAuthStore.setState({ clerkUserId: 'account-b' });
    useAuthStore.setState({ clerkUserId: 'account-a' });
  } else {
    useAuthStore.setState({ isClerkLoaded: false });
    useAuthStore.setState({ isClerkLoaded: true });
  }
}

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue(response(true));
  mockPut.mockReset().mockResolvedValue(undefined);
  __resetCloudAccountSessionForTests();
  activateCloudAccount('account-a');
  useAuthStore.setState({ clerkUserId: 'account-a', isClerkLoaded: true, isClerkSignedIn: true });
  useChatAppModeStore.setState({ appMode: 'cloud' });
});
afterEach(() => { cleanup(); __resetCloudAccountSessionForTests(); });

async function readyHook() {
  const hook = renderHook(() => useAgentActivityPushSync());
  await act(async () => {});
  expect(hook.result.current.status).toBe('synced');
  return hook;
}

describe('agent activity push ownership', () => {
  it('forwards the matching epoch and signal through reads and patch-only saves', async () => {
    const { result } = await readyHook();
    const options = { accountEpoch: captureCloudAccountEpoch(), signal: expect.any(AbortSignal) };
    expect(mockGet).toHaveBeenCalledWith(managedCloudPreferencesNamespacePath(NAMESPACE), options);
    await act(async () => { result.current.setEnabled(false); });
    expect(mockPut).toHaveBeenCalledWith(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
      { namespace: NAMESPACE, patch: { [KEY]: false } }, options);
    expect(result.current).toMatchObject({ enabled: false, ready: true, canRetry: false, status: 'synced' });
  });

  it.each(['missing-epoch', 'identity', 'signed-out', 'not-loaded', 'local'])(
    'does not read, write, or retry with %s', (kind) => {
      if (kind === 'missing-epoch') invalidateCloudAccount();
      if (kind === 'identity') useAuthStore.setState({ clerkUserId: 'account-b' });
      if (kind === 'signed-out') useAuthStore.setState({ isClerkSignedIn: false });
      if (kind === 'not-loaded') useAuthStore.setState({ isClerkLoaded: false });
      if (kind === 'local') useChatAppModeStore.setState({ appMode: 'local' });
      const { result } = renderHook(() => useAgentActivityPushSync());
      act(() => { result.current.setEnabled(false); result.current.retry(); });
      expect(mockGet).not.toHaveBeenCalled();
      expect(mockPut).not.toHaveBeenCalled();
      expect(result.current).toMatchObject({ ready: false, canRetry: false,
        status: kind === 'local' ? 'local' : 'error' });
    },
  );

  it.each(transitions)('retires old reads and callbacks across batched %s ABA', async (kind) => {
    const oldRead = deferred<ReturnType<typeof response>>();
    mockGet.mockReturnValueOnce(oldRead.promise).mockResolvedValue(response(false));
    const { result } = renderHook(() => useAgentActivityPushSync());
    const old = result.current;
    const signal = mockGet.mock.calls[0][1].signal as AbortSignal;
    await act(async () => { leaveAndReturn(kind); });
    expect(signal.aborted).toBe(true);
    expect(result.current).toMatchObject({ enabled: false, ready: true, status: 'synced' });
    const reads = mockGet.mock.calls.length;
    await act(async () => { old.setEnabled(true); old.retry(); oldRead.resolve(response(true)); });
    expect(mockGet).toHaveBeenCalledTimes(reads);
    expect(mockPut).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ enabled: false, ready: true, status: 'synced' });
  });

  it.each(transitions)('ignores old read rejection after %s ABA', async (kind) => {
    const oldRead = deferred<ReturnType<typeof response>>();
    mockGet.mockReturnValueOnce(oldRead.promise).mockResolvedValue(response(false));
    const { result } = renderHook(() => useAgentActivityPushSync());
    await act(async () => { leaveAndReturn(kind); });
    await act(async () => { oldRead.reject(new Error('old read failure')); });
    expect(result.current).toMatchObject({ enabled: false, ready: true, canRetry: false,
      status: 'synced', error: null });
  });

  it.each(transitions)('ignores old successful saves and ready callbacks after %s ABA', async (kind) => {
    const oldSave = deferred<void>();
    mockPut.mockReturnValueOnce(oldSave.promise);
    const { result } = await readyHook();
    const old = result.current;
    act(() => { old.setEnabled(false); });
    const signal = mockPut.mock.calls[0][2].signal as AbortSignal;
    await act(async () => { leaveAndReturn(kind); });
    expect(signal.aborted).toBe(true);
    await act(async () => { old.setEnabled(false); oldSave.resolve(undefined); });
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ enabled: true, ready: true, canRetry: false, status: 'synced' });
  });

  it.each(transitions)('ignores old failed saves after %s ABA', async (kind) => {
    const oldSave = deferred<void>();
    mockPut.mockReturnValueOnce(oldSave.promise);
    const { result } = await readyHook();
    act(() => { result.current.setEnabled(false); });
    mockGet.mockResolvedValue(response(false));
    await act(async () => { leaveAndReturn(kind); });
    await act(async () => { oldSave.reject(new Error('old failure')); });
    expect(result.current).toMatchObject({ enabled: false, ready: true, canRetry: false, status: 'synced', error: null });
  });

  it('keeps loading and saving single-flight even with repeated callbacks in one batch', async () => {
    const read = deferred<ReturnType<typeof response>>();
    const save = deferred<void>();
    mockGet.mockReturnValueOnce(read.promise);
    mockPut.mockReturnValueOnce(save.promise);
    const { result } = renderHook(() => useAgentActivityPushSync());
    act(() => { result.current.setEnabled(false); result.current.retry(); });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockPut).not.toHaveBeenCalled();
    await act(async () => { read.resolve(response(true)); });
    act(() => {
      result.current.setEnabled(false);
      result.current.setEnabled(true);
      result.current.retry();
    });
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('saving');
    await act(async () => { save.resolve(undefined); });
    expect(result.current).toMatchObject({ enabled: false, status: 'synced' });
  });

  it('recovers a failed read through one explicit retry before permitting edits', async () => {
    mockGet.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useAgentActivityPushSync());
    await act(async () => {});
    expect(result.current).toMatchObject({ ready: false, canRetry: true, status: 'error' });
    const retryRead = deferred<ReturnType<typeof response>>();
    mockGet.mockReturnValueOnce(retryRead.promise);
    act(() => {
      result.current.setEnabled(false);
      result.current.retry();
      result.current.retry();
    });
    expect(mockPut).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ ready: false, canRetry: false, status: 'loading' });
    await act(async () => { retryRead.resolve(response(false)); });
    expect(result.current).toMatchObject({ enabled: false, ready: true, canRetry: false, status: 'synced' });
  });

  it('reloads uncertain remote state after a failed save instead of blindly retrying the write', async () => {
    const { result } = await readyHook();
    mockPut.mockRejectedValueOnce(new Error('response lost'));
    await act(async () => { result.current.setEnabled(false); });
    expect(result.current).toMatchObject({ enabled: true, ready: false, canRetry: true, status: 'error' });
    act(() => { result.current.setEnabled(false); });
    expect(mockPut).toHaveBeenCalledTimes(1);
    mockGet.mockResolvedValueOnce(response(false));
    await act(async () => { result.current.retry(); });
    expect(result.current).toMatchObject({ enabled: false, ready: true, canRetry: false, status: 'synced' });
    expect(mockPut).toHaveBeenCalledTimes(1);
    await act(async () => { result.current.setEnabled(true); });
    expect(mockPut).toHaveBeenCalledTimes(2);
  });

  it('retires failed-owner retry callbacks before a new owner can use them', async () => {
    mockGet.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useAgentActivityPushSync());
    await act(async () => {});
    const old = result.current;
    expect(old.canRetry).toBe(true);
    await act(async () => { leaveAndReturn('epoch'); });
    const reads = mockGet.mock.calls.length;
    act(() => { old.retry(); old.setEnabled(false); });
    expect(mockGet).toHaveBeenCalledTimes(reads);
    expect(mockPut).not.toHaveBeenCalled();
    expect(result.current.status).toBe('synced');
  });

  it.each(['read', 'save'])('aborts pending %s and retires callbacks on unmount', async (kind) => {
    const pendingRead = deferred<ReturnType<typeof response>>();
    const pendingSave = deferred<void>();
    if (kind === 'read') mockGet.mockReturnValueOnce(pendingRead.promise);
    const hook = renderHook(() => useAgentActivityPushSync());
    await act(async () => {});
    if (kind === 'save') {
      mockPut.mockReturnValueOnce(pendingSave.promise);
      act(() => { hook.result.current.setEnabled(false); });
    }
    const old = hook.result.current;
    const signal = mockGet.mock.calls[0][1].signal as AbortSignal;
    hook.unmount();
    expect(signal.aborted).toBe(true);
    const reads = mockGet.mock.calls.length;
    const writes = mockPut.mock.calls.length;
    await act(async () => {
      old.setEnabled(true);
      old.retry();
      pendingRead.resolve(response(false));
      pendingSave.resolve(undefined);
      leaveAndReturn('account');
    });
    expect(mockGet).toHaveBeenCalledTimes(reads);
    expect(mockPut).toHaveBeenCalledTimes(writes);
  });
});
