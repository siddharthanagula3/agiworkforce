import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useComputerUseStore, DESKTOP_CONSENT_SETTINGS_KEY } from '../computerUseStore';
import { invoke } from '../../lib/tauri-mock';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

const mockInvoke = vi.mocked(invoke);

describe('withdrawing desktop control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    useComputerUseStore.getState().reset();
    useComputerUseStore.setState({ computerUseEnabled: false, consentAccepted: false });
  });

  // F20 (audit 2026-08-21): the native consent prompt tells the user the grant
  // lasts until computer use is turned off, so the toggle has to reach the
  // persisted grant rather than only the in-memory flag.
  it('deletes the persisted desktop grant when computer use is turned off', async () => {
    useComputerUseStore.setState({ computerUseEnabled: true, consentAccepted: true });

    useComputerUseStore.getState().setComputerUseEnabled(false);
    await vi.waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('settings_v2_delete', {
        key: DESKTOP_CONSENT_SETTINGS_KEY,
      }),
    );

    expect(useComputerUseStore.getState().computerUseEnabled).toBe(false);
    expect(useComputerUseStore.getState().consentAccepted).toBe(false);
  });

  it('reports a revocation the native side refused instead of pretending it happened', async () => {
    mockInvoke.mockImplementation((command) =>
      command === 'settings_v2_delete'
        ? Promise.reject(new Error('settings locked'))
        : Promise.resolve(undefined),
    );

    await useComputerUseStore.getState().revokeDesktopConsent();

    expect(useComputerUseStore.getState().error).toContain('Failed to withdraw desktop control');
  });

  it('does not touch the persisted grant when computer use is turned on', () => {
    useComputerUseStore.getState().setComputerUseEnabled(true);

    expect(mockInvoke).not.toHaveBeenCalledWith('settings_v2_delete', expect.anything());
    expect(useComputerUseStore.getState().computerUseEnabled).toBe(true);
  });
});
