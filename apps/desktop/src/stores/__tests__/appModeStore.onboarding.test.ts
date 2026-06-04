import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/tauri-mock', () => ({
  isTauri: true,
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
      planTier: 'free',
      hasOnboarded: false,
      hasSelectedMode: false,
      isOnline: true,
    });
    useAuthStore.setState({
      isAuthenticated: false,
      accessToken: null,
    });
  });

  it('allows Local Mode without authentication', () => {
    useAppModeStore.getState().setMode('local');

    expect(useAppModeStore.getState().mode).toBe('local');
  });

  it('does not activate Cloud Managed without a cloud session', () => {
    useAppModeStore.getState().setMode('cloud');

    expect(useAppModeStore.getState().mode).toBe('local');
  });
});
