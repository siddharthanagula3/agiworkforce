import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import v3English from '../../i18n/locales/en/v3.json';

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
    useAuthStore.setState({ isAuthenticated: false, accessToken: null, plan: 'free' });
  });

  it('availability copy is honest, no coming-soon / invite / waitlist framing', () => {
    expect(DESKTOP_CLOUD_TAGLINE).not.toMatch(BANNED);
    expect(DESKTOP_CLOUD_TAGLINE_SHORT).not.toMatch(BANNED);
    expect(v3English.sidebar.mode.cloudUnavailable).not.toMatch(BANNED);
  });

  it('a signed-in account of ANY tier (including free) can enter Cloud mode', () => {
    useAuthStore.setState({ isAuthenticated: true, accessToken: 'token', plan: 'free' });
    useAppModeStore.getState().setMode('cloud');
    expect(useAppModeStore.getState().mode).toBe('cloud');
    for (const call of toastError.mock.calls) {
      expect(String(call[0])).not.toMatch(/tier|basic|pro|max|enterprise/i);
    }
  });

  it('enters the Cloud workspace when signed out so the shell can render device sign-in', () => {
    useAppModeStore.getState().setMode('cloud');
    expect(useAppModeStore.getState().mode).toBe('cloud');
    expect(toastError).not.toHaveBeenCalled();
    for (const call of [...toastError.mock.calls, ...toastInfo.mock.calls]) {
      expect(String(call[0])).not.toMatch(BANNED);
    }
  });

  it('keeps Local mode working (Local + BYOK live in Local mode on desktop)', () => {
    useAppModeStore.getState().setMode('local');
    expect(useAppModeStore.getState().mode).toBe('local');
  });
});
