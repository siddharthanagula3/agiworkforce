import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchPreferenceNamespace: vi.fn(),
  savePreferenceNamespace: vi.fn(),
}));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: (...args: unknown[]) => mocks.fetchPreferenceNamespace(...args),
  savePreferenceNamespace: (...args: unknown[]) => mocks.savePreferenceNamespace(...args),
}));

vi.mock('@/lib/runtime/memory-capability', () => ({ resetMemoryCapabilityCache: vi.fn() }));

const { useCapabilitiesPreferences, DEFAULT_CAPABILITIES_SETTINGS } =
  await import('../use-capabilities-preferences');

interface PendingWrite {
  memory: boolean;
  settled: boolean;
  settle: () => void;
}

describe('the last capabilities choice is the one that survives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchPreferenceNamespace.mockResolvedValue({
      ...DEFAULT_CAPABILITIES_SETTINGS,
      memory: false,
    });
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
