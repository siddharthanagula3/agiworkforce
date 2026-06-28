import { beforeEach, describe, expect, it, vi } from 'vitest';

// Simulate the real desktop (Tauri) runtime so the PA-3 cloud gate is exercised.
vi.mock('../../lib/runtimeEnvironment', () => ({
  isTauri: true,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
}));

const { toastInfo, toastError } = vi.hoisted(() => ({
  toastInfo: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { info: toastInfo, error: toastError },
}));

import { useAppModeStore } from '../appModeStore';
import { useAuthStore } from '../auth';
import {
  DESKTOP_CLOUD_COMING_SOON,
  DESKTOP_CLOUD_COMING_SOON_SHORT,
} from '../../constants/cloudAvailability';

const BANNED = /invite|waitlist|private[\s-]?beta/i;

describe('PA-3 / DESK-CLOUD-COPY-01: desktop managed-cloud copy is honest interim', () => {
  beforeEach(() => {
    toastInfo.mockClear();
    toastError.mockClear();
    useAppModeStore.setState({
      mode: 'local',
      planTier: 'free',
      hasOnboarded: false,
      hasSelectedMode: false,
      isOnline: true,
    });
    // Even a fully signed-in, cloud-entitled account must not enter Cloud mode
    // on desktop — the runtime cannot serve it yet.
    useAuthStore.setState({
      isAuthenticated: true,
      accessToken: 'token',
    });
  });

  it('copy says cloud is on Web & Mobile, desktop coming soon — never "available on desktop"', () => {
    expect(DESKTOP_CLOUD_COMING_SOON).toBe(
      'AGI Cloud is available on Web & Mobile — desktop support is coming soon.',
    );
    expect(DESKTOP_CLOUD_COMING_SOON).toMatch(/coming soon/i);
    // No invite / waitlist / private-beta framing — the product is public alpha.
    expect(DESKTOP_CLOUD_COMING_SOON).not.toMatch(BANNED);
    expect(DESKTOP_CLOUD_COMING_SOON_SHORT).not.toMatch(BANNED);
    // Must never claim managed cloud is available ON desktop.
    expect(DESKTOP_CLOUD_COMING_SOON.toLowerCase()).not.toContain('available on desktop');
  });

  it('refuses to enter Cloud mode on desktop and surfaces the honest interim message', () => {
    useAppModeStore.getState().setMode('cloud');

    // The desktop runtime stays in Local mode, so chatStore.isCloudMode() never
    // becomes true and no cloud-send can reach ERR_CLOUD_NOT_IMPLEMENTED.
    expect(useAppModeStore.getState().mode).toBe('local');
    expect(toastInfo).toHaveBeenCalledWith(DESKTOP_CLOUD_COMING_SOON);
    // No invite/waitlist refusal copy.
    for (const call of toastError.mock.calls) {
      expect(String(call[0])).not.toMatch(BANNED);
    }
    for (const call of toastInfo.mock.calls) {
      expect(String(call[0])).not.toMatch(BANNED);
    }
  });

  it('keeps Local mode working (BYOK lives in Local mode on desktop)', () => {
    useAppModeStore.getState().setMode('cloud'); // refused → stays local
    useAppModeStore.getState().setMode('local');
    expect(useAppModeStore.getState().mode).toBe('local');
  });
});
