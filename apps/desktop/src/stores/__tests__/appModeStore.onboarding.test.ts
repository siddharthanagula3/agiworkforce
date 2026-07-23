import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/tauri-mock', () => ({
  isTauri: true,
  supportsLocalAppMode: true,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { useAppModeStore } from '../appModeStore';
import { useAuthStore } from '../auth';

describe('app mode onboarding boundary', () => {
  beforeEach(() => {
    useAppModeStore.setState({
      mode: 'local',
      hasOnboarded: false,
      hasSelectedMode: false,
      isOnline: true,
    });
    useAuthStore.setState({
      isAuthenticated: false,
      accessToken: null,
      plan: 'free',
    });
  });

  it('allows Local Mode without authentication', () => {
    useAppModeStore.getState().setMode('local');

    expect(useAppModeStore.getState().mode).toBe('local');
  });

  it('opens the Cloud sign-in workspace without claiming an authenticated session', () => {
    useAppModeStore.getState().setMode('cloud');

    expect(useAppModeStore.getState().mode).toBe('cloud');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('drops the legacy persisted plan tier during hydration', async () => {
    localStorage.setItem(
      'app-mode-store',
      JSON.stringify({
        version: 2,
        state: {
          mode: 'local',
          planTier: 'enterprise',
          hasOnboarded: true,
          hasSelectedMode: true,
        },
      }),
    );

    await useAppModeStore.persist.rehydrate();

    const state = useAppModeStore.getState() as unknown as Record<string, unknown>;
    expect(state).not.toHaveProperty('planTier');
    expect(state).not.toHaveProperty('setPlanTier');
    expect(state['hasOnboarded']).toBe(true);
  });
});
