import { act, renderHook, cleanup } from '@testing-library/react-native';
import type { ToolApprovalPolicy } from '@agiworkforce/types';

const mockFetch = jest.fn();
const mockSave = jest.fn();
jest.mock('@/services/preferences', () => ({
  fetchToolApprovalNamespace: (...args: unknown[]) => mockFetch(...args),
  savePreferenceNamespace: (...args: unknown[]) => mockSave(...args),
}));
jest.mock('@/lib/mmkv', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
  whenMmkvReady: jest.fn(),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
}));

import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
  captureCloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  getToolApprovalPolicySnapshot as state,
  subscribeToolApprovalPolicy,
  toolApprovalPolicySummary,
} from '@/src/features/settings/tool-approvals/toolApprovalPolicyOwner';
import { useToolApprovalPolicySync } from '@/src/features/settings/tool-approvals/useToolApprovalPolicySync';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const response = (policy?: ToolApprovalPolicy, allowed = true) => ({
  settings: policy ? { defaultPolicy: policy } : {},
  autonomousToolApprovalsAllowed: allowed,
});
const releases: Array<() => void> = [];
function mount() {
  const release = subscribeToolApprovalPolicy(jest.fn());
  releases.push(release);
  return release;
}
function account(id: string) {
  activateCloudAccount(id);
  useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: id });
}
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  account('a');
  useChatAppModeStore.setState({ appMode: 'cloud' });
  useSettingsStore.setState({ toolApprovalPolicy: 'auto_approve_read_only' });
  mockFetch.mockResolvedValue(response('ask_every_time'));
  mockSave.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  releases.splice(0).forEach((release) => release());
});

it('shares a GET and synchronous save admission across two hook mounts, preserving the survivor', async () => {
  const put = deferred<void>();
  mockSave.mockReturnValue(put.promise);
  const a = renderHook(useToolApprovalPolicySync);
  const b = renderHook(useToolApprovalPolicySync);
  await act(settle);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch.mock.calls[0][1]).toMatchObject({ accountEpoch: captureCloudAccountEpoch() });
  act(() => {
    a.result.current.select('autonomous');
    b.result.current.select('auto_approve_read_only');
  });
  expect(mockSave).toHaveBeenCalledTimes(1);
  a.unmount();
  const c = renderHook(useToolApprovalPolicySync);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(c.result.current.status).toBe('saving');
  await act(async () => {
    put.resolve();
    await settle();
  });
  expect(b.result.current.policy).toBe('autonomous');
  expect(c.result.current.status).toBe('synced');
  expect(useSettingsStore.getState().toolApprovalPolicy).toBe('auto_approve_read_only');
});

it.each(['success', 'failure'] as const)(
  'retires final release GET %s and makes cleanup idempotent',
  async (outcome) => {
    const old = deferred<ReturnType<typeof response>>();
    mockFetch.mockReturnValueOnce(old.promise);
    const release = mount();
    const signal = mockFetch.mock.calls[0][1].signal as AbortSignal;
    release();
    release();
    mount();
    await settle();
    expect(signal.aborted).toBe(true);
    const fresh = state();
    if (outcome === 'success') old.resolve(response('autonomous', false));
    else old.reject(new Error('old'));
    await settle();
    expect(state()).toBe(fresh);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  },
);

it.each(['account', 'epoch', 'mode'] as const)(
  'retires %s transitions synchronously even before React renders',
  async (transition) => {
    mount();
    await settle();
    const staleSelect = state().select;
    const pending = deferred<ReturnType<typeof response>>();
    mockFetch.mockReturnValue(pending.promise);
    if (transition === 'account') account('b');
    if (transition === 'epoch') {
      invalidateCloudAccount();
      activateCloudAccount('a');
    }
    if (transition === 'mode') {
      useChatAppModeStore.setState({ appMode: 'local' });
      useChatAppModeStore.setState({ appMode: 'cloud' });
    }
    expect(state()).toMatchObject({ ready: false, autonomyForbidden: false, status: 'loading' });
    staleSelect('autonomous');
    state().select('autonomous');
    expect(mockSave).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().toolApprovalPolicy).toBe('auto_approve_read_only');
    pending.resolve(response());
    await settle();
    expect(state()).toMatchObject({ ready: true, policy: 'autonomous' });
    staleSelect('ask_every_time');
    expect(mockSave).not.toHaveBeenCalled();
  },
);

it.each(['success', 'failure'] as const)(
  'a retired PUT %s cannot publish or roll back the replacement owner',
  async (outcome) => {
    const old = deferred<void>();
    mockSave.mockReturnValueOnce(old.promise);
    const release = mount();
    await settle();
    state().select('autonomous');
    const retained = state().select;
    release();
    mockFetch.mockResolvedValue(response('auto_approve_read_only', false));
    mount();
    await settle();
    const fresh = state();
    retained('ask_every_time');
    if (outcome === 'success') old.resolve();
    else old.reject(new Error('old'));
    await settle();
    expect(state()).toBe(fresh);
    expect(mockSave).toHaveBeenCalledTimes(1);
  },
);

it('keeps Cloud callbacks from becoming Local edits and Local callbacks from surviving a roundtrip', async () => {
  mount();
  await settle();
  const cloudSelect = state().select;
  useChatAppModeStore.setState({ appMode: 'local' });
  const localSelect = state().select;
  cloudSelect('autonomous');
  expect(useSettingsStore.getState().toolApprovalPolicy).toBe('auto_approve_read_only');
  localSelect('ask_every_time');
  expect(useSettingsStore.getState().toolApprovalPolicy).toBe('ask_every_time');
  useChatAppModeStore.setState({ appMode: 'cloud' });
  useChatAppModeStore.setState({ appMode: 'local' });
  localSelect('autonomous');
  expect(useSettingsStore.getState().toolApprovalPolicy).toBe('ask_every_time');
});

it('keeps unknown/error unready, rejects blind writes, and reports failed saves as unsynced', async () => {
  const get = deferred<ReturnType<typeof response>>();
  mockFetch.mockReturnValueOnce(get.promise);
  const release = mount();
  expect(toolApprovalPolicySummary(state())).toBe('Loading…');
  get.reject(new Error('offline'));
  await settle();
  expect(toolApprovalPolicySummary(state())).toBe('Unavailable');
  state().select('autonomous');
  expect(mockSave).not.toHaveBeenCalled();
  release();
  mount();
  await settle();
  mockSave.mockRejectedValueOnce(new Error('uncertain commit'));
  state().select('autonomous');
  await settle();
  expect(state()).toMatchObject({ ready: true, policy: 'ask_every_time', status: 'error' });
  expect(toolApprovalPolicySummary(state())).toBe('Ask · Not synced');
});

it('defaults missing Cloud namespace to autonomous but applies organization fallback without changing Local history', async () => {
  mockFetch.mockResolvedValue(response(undefined, false));
  mount();
  await settle();
  expect(state()).toMatchObject({ policy: 'ask_every_time', autonomyForbidden: true, ready: true });
  state().select('autonomous');
  expect(mockSave).not.toHaveBeenCalled();
  state().select('auto_approve_read_only');
  await settle();
  expect(useSettingsStore.getState().toolApprovalPolicy).toBe('auto_approve_read_only');
});

it('requires loaded and signed-in Clerk identity to match the canonical owner', async () => {
  useAuthStore.setState({ clerkUserId: 'b' });
  mount();
  expect(state().ready).toBe(false);
  expect(mockFetch).not.toHaveBeenCalled();
  useAuthStore.setState({ clerkUserId: 'a', isClerkLoaded: false });
  expect(mockFetch).not.toHaveBeenCalled();
  useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: false });
  expect(mockFetch).not.toHaveBeenCalled();
  useAuthStore.setState({ isClerkSignedIn: true });
  await settle();
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

it('retries a failed load with other consumers mounted and shares one reload', async () => {
  mockFetch.mockRejectedValueOnce(new Error('offline'));
  mount();
  mount();
  await settle();
  const retry = state().retry;
  const get = deferred<ReturnType<typeof response>>();
  mockFetch.mockReturnValueOnce(get.promise);
  retry();
  retry();
  mount();
  expect(mockFetch).toHaveBeenCalledTimes(2);
  expect(state()).toMatchObject({ ready: false, status: 'loading' });
  get.resolve(response('autonomous'));
  await settle();
  expect(state()).toMatchObject({ ready: true, status: 'synced', policy: 'autonomous' });
  const put = deferred<void>();
  mockSave.mockReturnValueOnce(put.promise);
  state().select('ask_every_time');
  retry();
  expect(mockFetch).toHaveBeenCalledTimes(2);
  put.reject(new Error('commit outcome unknown'));
  await settle();
  state().retry();
  await settle();
  expect(state().status).toBe('synced');
});

it('rechecks admission after a subscriber retires a loading publication', () => {
  const release = subscribeToolApprovalPolicy(() => {
    if (state().status === 'loading') useChatAppModeStore.setState({ appMode: 'local' });
  });
  releases.push(release);
  expect(state().status).toBe('local');
  expect(mockFetch).not.toHaveBeenCalled();
});

it('rechecks admission after a subscriber retires an optimistic save publication', async () => {
  mount();
  await settle();
  releases.push(
    subscribeToolApprovalPolicy(() => {
      if (state().status === 'saving') useChatAppModeStore.setState({ appMode: 'local' });
    }),
  );
  state().select('autonomous');
  expect(mockSave).not.toHaveBeenCalled();
  expect(state()).toMatchObject({ status: 'local', policy: 'auto_approve_read_only' });
});

it.each(['account', 'epoch', 'mode'] as const)(
  'ignores pending GET and PUT settlements across a %s replacement',
  async (transition) => {
    const transitionOwner = () => {
      if (transition === 'account') account('b');
      if (transition === 'epoch') {
        invalidateCloudAccount();
        activateCloudAccount('a');
      }
      if (transition === 'mode') {
        useChatAppModeStore.setState({ appMode: 'local' });
        useChatAppModeStore.setState({ appMode: 'cloud' });
      }
    };
    const oldGet = deferred<ReturnType<typeof response>>();
    mockFetch.mockReturnValueOnce(oldGet.promise);
    mount();
    transitionOwner();
    await settle();
    const afterGetReplacement = state();
    oldGet.resolve(response('autonomous', false));
    await settle();
    expect(state()).toBe(afterGetReplacement);

    const oldPut = deferred<void>();
    mockSave.mockReturnValueOnce(oldPut.promise);
    state().select('autonomous');
    if (transition === 'account') account('c');
    else transitionOwner();
    await settle();
    const afterPutReplacement = state();
    oldPut.reject(new Error('retired write'));
    await settle();
    expect(state()).toBe(afterPutReplacement);
    expect(useSettingsStore.getState().toolApprovalPolicy).toBe('auto_approve_read_only');
  },
);
