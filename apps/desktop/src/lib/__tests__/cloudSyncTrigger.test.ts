/**
 * Cloud sync trigger — MANAGED-ONLY gate (trust boundary).
 *
 * The auto-trigger must invoke the sync engine ONLY in AGI-managed cloud mode.
 * It must never fire in Local mode or BYOK mode (BYOK runs under appMode='cloud'
 * but selectPrivacyMode returns 'byok'). These tests pin that invariant against
 * the real triggerCloudSync code path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  privacyMode: 'managed' as 'managed' | 'byok' | 'local',
  userId: 'u1' as string | null,
  invoke: vi.fn(),
}));

vi.mock('../tauri-mock', () => ({ invoke: h.invoke }));
vi.mock('../../stores/appModeStore', () => ({
  useAppModeStore: { getState: () => ({ mode: 'cloud' }), subscribe: vi.fn(() => () => {}) },
  selectPrivacyMode: () => h.privacyMode,
}));
vi.mock('../../stores/auth', () => ({
  useUnifiedAuthStore: { getState: () => ({ user: h.userId ? { id: h.userId } : null }) },
}));

import { triggerCloudSync } from '../cloudSyncTrigger';

beforeEach(() => {
  h.invoke.mockReset();
  h.invoke.mockResolvedValue(undefined);
  h.privacyMode = 'managed';
  h.userId = 'u1';
});

describe('triggerCloudSync — managed-only gate', () => {
  it('invokes the sync command in managed mode with the current userId', () => {
    triggerCloudSync();
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith('sync_conversations_to_cloud', { userId: 'u1' });
  });

  it('does NOT invoke in Local mode', () => {
    h.privacyMode = 'local';
    triggerCloudSync();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('does NOT invoke in BYOK mode (appMode=cloud but privacyMode=byok)', () => {
    h.privacyMode = 'byok';
    triggerCloudSync();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('does NOT invoke when there is no authenticated user', () => {
    h.userId = null;
    triggerCloudSync();
    expect(h.invoke).not.toHaveBeenCalled();
  });
});
