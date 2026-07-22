import { beforeEach, describe, expect, it, vi } from 'vitest';

// Simulate the real desktop (Tauri) runtime so the DCL-4 cloud path is exercised
// (supportsLocalAppMode = true is the runtime that used to be gated "coming soon").
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
  DESKTOP_CLOUD_TAGLINE,
  DESKTOP_CLOUD_TAGLINE_SHORT,
} from '../../constants/cloudAvailability';

// Nothing user-facing may frame cloud as gated: no coming-soon, invite, waitlist,
// or private-beta language anywhere in the availability copy or the mode toasts.
const BANNED = /coming soon|invite|waitlist|private[\s-]?beta/i;

describe('DCL-4: desktop managed cloud is open (public alpha)', () => {
  beforeEach(() => {
    toastInfo.mockClear();
    toastError.mockClear();
    useAppModeStore.setState({
      mode: 'local',
      hasOnboarded: false,
      hasSelectedMode: false,
      isOnline: true,
    });
    // Default: signed OUT. Individual tests opt into a session.
    useAuthStore.setState({ isAuthenticated: false, accessToken: null, plan: 'free' });
  });

  it('availability copy is honest — no coming-soon / invite / waitlist framing', () => {
    expect(DESKTOP_CLOUD_TAGLINE).not.toMatch(BANNED);
    expect(DESKTOP_CLOUD_TAGLINE_SHORT).not.toMatch(BANNED);
  });

  it('a signed-in account of ANY tier (including free) can enter Cloud mode', () => {
    useAuthStore.setState({ isAuthenticated: true, accessToken: 'token', plan: 'free' });
    useAppModeStore.getState().setMode('cloud');
    expect(useAppModeStore.getState().mode).toBe('cloud');
    // No tier-gate refusal fired.
    for (const call of toastError.mock.calls) {
      expect(String(call[0])).not.toMatch(/tier|basic|pro|max|enterprise/i);
    }
  });

  it('refuses Cloud when signed out and prompts sign-in (the mechanism, not a gate)', () => {
    useAppModeStore.getState().setMode('cloud');
    expect(useAppModeStore.getState().mode).toBe('local');
    expect(toastError).toHaveBeenCalledWith('Sign in to use AGI Cloud.');
    for (const call of [...toastError.mock.calls, ...toastInfo.mock.calls]) {
      expect(String(call[0])).not.toMatch(BANNED);
    }
  });

  it('keeps Local mode working (Local + BYOK live in Local mode on desktop)', () => {
    useAppModeStore.getState().setMode('local');
    expect(useAppModeStore.getState().mode).toBe('local');
  });
});
