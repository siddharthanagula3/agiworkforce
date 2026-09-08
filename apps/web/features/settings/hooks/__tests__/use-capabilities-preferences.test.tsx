import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchPreferenceNamespace: vi.fn(),
  savePreferenceNamespace: vi.fn(),
  readPreferencesVersion: vi.fn(),
}));

class PreferenceVersionConflictError extends Error {
  readonly namespace: string;
  readonly settings: unknown;
  readonly version: string | null;

  constructor(params: {
    message: string;
    namespace: string;
    settings: unknown;
    version: string | null;
  }) {
    super(params.message);
    this.name = 'PreferenceVersionConflictError';
    this.namespace = params.namespace;
    this.settings = params.settings;
    this.version = params.version;
  }
}

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: (...args: unknown[]) => mocks.fetchPreferenceNamespace(...args),
  savePreferenceNamespace: (...args: unknown[]) => mocks.savePreferenceNamespace(...args),
  readPreferencesVersion: (...args: unknown[]) => mocks.readPreferencesVersion(...args),
  PreferenceVersionConflictError,
}));

vi.mock('@/lib/runtime/memory-capability', () => ({ resetMemoryCapabilityCache: vi.fn() }));

const { useCapabilitiesPreferences, DEFAULT_CAPABILITIES_SETTINGS } =
  await import('../use-capabilities-preferences');

interface PendingWrite {
  memory: boolean;
  settled: boolean;
  settle: () => void;
}

const STORED_VERSION = '2026-09-07T10:00:00.000Z';
const NEXT_VERSION = '2026-09-07T10:00:01.000Z';

describe('the last capabilities choice is the one that survives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchPreferenceNamespace.mockResolvedValue({
      ...DEFAULT_CAPABILITIES_SETTINGS,
      memory: false,
    });
    mocks.readPreferencesVersion.mockResolvedValue(STORED_VERSION);
    mocks.savePreferenceNamespace.mockResolvedValue({ version: NEXT_VERSION });
  });

  it('leaves the server holding the last choice when an earlier write settles last', async () => {
    const stored: boolean[] = [];
    const writes: PendingWrite[] = [];
    mocks.savePreferenceNamespace.mockImplementation(
      (_namespace: string, value: { memory: boolean }) =>
        new Promise<void>((resolve) => {
          const write: PendingWrite = {
            memory: value.memory,
            settled: false,
            settle: () => {
              write.settled = true;
              stored.push(value.memory);
              resolve();
            },
          };
          writes.push(write);
        }),
    );

    const { result } = renderHook(() => useCapabilitiesPreferences());
    await waitFor(() => expect(mocks.fetchPreferenceNamespace).toHaveBeenCalled());

    act(() => result.current.setBoolean('memory', true));
    act(() => result.current.setBoolean('memory', false));
    await waitFor(() => expect(writes.length).toBeGreaterThan(0));

    // The newest request comes back first: the transport reordered them.
    await act(async () => {
      writes[writes.length - 1]!.settle();
    });

    for (let guard = 0; guard < 5; guard += 1) {
      const outstanding = writes.find((write) => !write.settled);
      if (!outstanding) break;
      await act(async () => {
        outstanding.settle();
      });
    }

    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(stored.at(-1)).toBe(false);
    expect(result.current.settings.memory).toBe(false);
  });
});

describe('a capability save only claims the key the user changed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchPreferenceNamespace.mockResolvedValue({
      ...DEFAULT_CAPABILITIES_SETTINGS,
      memory: false,
    });
    mocks.readPreferencesVersion.mockResolvedValue(STORED_VERSION);
    mocks.savePreferenceNamespace.mockResolvedValue({ version: NEXT_VERSION });
  });

  it('sends that key alone, as a merge, against the revision it read', async () => {
    const { result } = renderHook(() => useCapabilitiesPreferences());
    await waitFor(() => expect(mocks.readPreferencesVersion).toHaveBeenCalled());

    act(() => result.current.setBoolean('memory', true));
    await waitFor(() => expect(mocks.savePreferenceNamespace).toHaveBeenCalled());

    expect(mocks.savePreferenceNamespace).toHaveBeenCalledWith(
      'capabilities',
      { memory: true },
      { merge: true, expectedVersion: STORED_VERSION },
    );
  });

  it('carries the revision the last save returned into the next one', async () => {
    const { result } = renderHook(() => useCapabilitiesPreferences());
    await waitFor(() => expect(mocks.readPreferencesVersion).toHaveBeenCalled());

    act(() => result.current.setBoolean('memory', true));
    await waitFor(() => expect(result.current.saving).toBe(false));

    act(() => result.current.setBoolean('searchPastChats', true));
    await waitFor(() => expect(mocks.savePreferenceNamespace).toHaveBeenCalledTimes(2));

    expect(mocks.savePreferenceNamespace.mock.calls[1]).toEqual([
      'capabilities',
      { searchPastChats: true },
      { merge: true, expectedVersion: NEXT_VERSION },
    ]);
  });

  it('re-applies the choice on the newer revision when the namespace moved on', async () => {
    mocks.savePreferenceNamespace
      .mockRejectedValueOnce(
        new PreferenceVersionConflictError({
          message: 'These settings changed elsewhere.',
          namespace: 'capabilities',
          settings: { ...DEFAULT_CAPABILITIES_SETTINGS, searchPastChats: true },
          version: NEXT_VERSION,
        }),
      )
      .mockResolvedValueOnce({ version: '2026-09-07T10:00:02.000Z' });

    const { result } = renderHook(() => useCapabilitiesPreferences());
    await waitFor(() => expect(mocks.readPreferencesVersion).toHaveBeenCalled());

    act(() => result.current.setBoolean('memory', true));
    await waitFor(() => expect(mocks.savePreferenceNamespace).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.saving).toBe(false));

    expect(mocks.savePreferenceNamespace.mock.calls[1]).toEqual([
      'capabilities',
      { memory: true },
      { merge: true, expectedVersion: NEXT_VERSION },
    ]);
    expect(result.current.saveError).toBeNull();
    expect(result.current.settings.memory).toBe(true);
    expect(result.current.settings.searchPastChats).toBe(true);
  });

  it('keeps a choice made while an earlier save was still in flight', async () => {
    const releases: Array<() => void> = [];
    mocks.savePreferenceNamespace.mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve({ version: NEXT_VERSION }));
        }),
    );

    const { result } = renderHook(() => useCapabilitiesPreferences());
    await waitFor(() => expect(mocks.readPreferencesVersion).toHaveBeenCalled());

    act(() => result.current.setBoolean('memory', true));
    await waitFor(() => expect(releases.length).toBe(1));
    act(() => result.current.setBoolean('searchPastChats', true));

    await act(async () => {
      releases[0]!();
    });
    await waitFor(() => expect(mocks.savePreferenceNamespace).toHaveBeenCalledTimes(2));
    await act(async () => {
      releases[1]!();
    });

    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(mocks.savePreferenceNamespace.mock.calls[0]?.[1]).toEqual({ memory: true });
    expect(mocks.savePreferenceNamespace.mock.calls[1]?.[1]).toEqual({ searchPastChats: true });
    expect(result.current.settings.memory).toBe(true);
    expect(result.current.settings.searchPastChats).toBe(true);
  });
});
