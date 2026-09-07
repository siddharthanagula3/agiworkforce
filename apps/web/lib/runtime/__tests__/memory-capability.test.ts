import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetchPreferenceNamespace: vi.fn() }));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  PREFERENCE_NAMESPACE_SAVED_EVENT: 'agi:preference-namespace-saved',
  fetchPreferenceNamespace: (...args: unknown[]) => mocks.fetchPreferenceNamespace(...args),
}));

const {
  isMemoryCapabilityEnabled,
  isPastChatSearchEnabled,
  resetMemoryCapabilityCache,
  subscribeMemoryCapability,
} = await import('../memory-capability');

function savedEvent(namespace: string): CustomEvent {
  return new CustomEvent('agi:preference-namespace-saved', {
    detail: { namespace, value: { memory: true } },
  });
}

describe('memory capability cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMemoryCapabilityCache();
  });

  it('answers from one read while the read succeeds', async () => {
    mocks.fetchPreferenceNamespace.mockResolvedValue({ memory: true, searchPastChats: true });

    await expect(isMemoryCapabilityEnabled()).resolves.toBe(true);
    await expect(isPastChatSearchEnabled()).resolves.toBe(true);

    expect(mocks.fetchPreferenceNamespace).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed read', async () => {
    mocks.fetchPreferenceNamespace.mockRejectedValueOnce(new Error('offline'));
    mocks.fetchPreferenceNamespace.mockResolvedValue({ memory: true, searchPastChats: false });

    await expect(isMemoryCapabilityEnabled()).resolves.toBe(false);
    await expect(isMemoryCapabilityEnabled()).resolves.toBe(true);

    expect(mocks.fetchPreferenceNamespace).toHaveBeenCalledTimes(2);
  });

  it('re-reads after a capabilities preference is saved and tells its subscribers', async () => {
    mocks.fetchPreferenceNamespace.mockResolvedValueOnce({ memory: false, searchPastChats: false });
    mocks.fetchPreferenceNamespace.mockResolvedValue({ memory: true, searchPastChats: false });
    await expect(isMemoryCapabilityEnabled()).resolves.toBe(false);

    const changed = vi.fn();
    const unsubscribe = subscribeMemoryCapability(changed);

    window.dispatchEvent(savedEvent('capabilities'));

    expect(changed).toHaveBeenCalledTimes(1);
    await expect(isMemoryCapabilityEnabled()).resolves.toBe(true);

    unsubscribe();
    window.dispatchEvent(savedEvent('capabilities'));
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('ignores a save in another namespace', async () => {
    mocks.fetchPreferenceNamespace.mockResolvedValue({ memory: false, searchPastChats: false });
    await isMemoryCapabilityEnabled();

    const changed = vi.fn();
    const unsubscribe = subscribeMemoryCapability(changed);

    window.dispatchEvent(savedEvent('appearance'));

    expect(changed).not.toHaveBeenCalled();
    await isMemoryCapabilityEnabled();
    expect(mocks.fetchPreferenceNamespace).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
