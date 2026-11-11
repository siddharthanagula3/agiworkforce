// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';

const authState = vi.hoisted(() => ({
  value: { user: { id: 'u1' }, logout: vi.fn(async () => undefined), isAuthenticated: true },
}));
const settingsState = vi.hoisted(() => ({ value: { data: { session_timeout: 15 } } }));

vi.mock('@shared/stores/authentication-store', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  useAuthStore: () => authState.value,
}));
vi.mock('@features/settings/hooks/use-settings-queries', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  useUserSettings: () => settingsState.value,
}));

import { useSessionTimeout } from './useSessionTimeout';

const ACTIVITY_STORAGE_KEY = 'agi_last_activity';
const MINUTE_MS = 60 * 1000;

function mountGuard() {
  const onWarning = vi.fn();
  const onSessionExtended = vi.fn();
  const onTimeout = vi.fn();
  function Guard() {
    useSessionTimeout({
      onWarning: (seconds) => onWarning(seconds),
      onSessionExtended: () => onSessionExtended(),
      onTimeout: () => onTimeout(),
    });
    return null;
  }
  const view = render(React.createElement(Guard));
  return { view, Guard, onWarning, onSessionExtended, onTimeout };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useSessionTimeout idle enforcement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T10:00:00Z'));
    localStorage.clear();
    authState.value = {
      user: { id: 'u1' },
      logout: vi.fn(async () => undefined),
      isAuthenticated: true,
    };
    settingsState.value = { data: { session_timeout: 15 } };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('does not treat the idle warning as activity and signs out at the configured window', async () => {
    const { onWarning, onSessionExtended, onTimeout } = mountGuard();
    await advance(1000);
    const startedAt = localStorage.getItem(ACTIVITY_STORAGE_KEY);
    expect(startedAt).not.toBeNull();

    await advance(13 * MINUTE_MS);
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onSessionExtended).not.toHaveBeenCalled();
    expect(localStorage.getItem(ACTIVITY_STORAGE_KEY)).toBe(startedAt);

    await advance(2 * MINUTE_MS + 31_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(authState.value.logout).toHaveBeenCalledTimes(1);
  });

  it('keeps the stored activity time across unrelated rerenders', async () => {
    const { view, Guard } = mountGuard();
    await advance(1000);
    const startedAt = localStorage.getItem(ACTIVITY_STORAGE_KEY);

    await advance(10 * MINUTE_MS);
    view.rerender(React.createElement(Guard));
    await advance(1000);

    expect(localStorage.getItem(ACTIVITY_STORAGE_KEY)).toBe(startedAt);
  });

  it('renews on real input during the warning and reports the extension', async () => {
    const { onSessionExtended, onTimeout } = mountGuard();
    await advance(13 * MINUTE_MS + 31_000);
    const warnedWith = localStorage.getItem(ACTIVITY_STORAGE_KEY);

    await act(async () => {
      window.dispatchEvent(new Event('keydown'));
    });

    expect(onSessionExtended).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(ACTIVITY_STORAGE_KEY)).not.toBe(warnedWith);

    await advance(5 * MINUTE_MS);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(authState.value.logout).not.toHaveBeenCalled();
  });

  it('still times out when storage cannot be read or written', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    const { onTimeout } = mountGuard();
    await advance(16 * MINUTE_MS);

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(authState.value.logout).toHaveBeenCalledTimes(1);
  });

  it('does not let a future stored timestamp keep an idle session alive', async () => {
    const { onTimeout } = mountGuard();
    await advance(1000);
    localStorage.setItem(ACTIVITY_STORAGE_KEY, String(Date.now() + 24 * 60 * MINUTE_MS));

    await advance(16 * MINUTE_MS);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});

type ImportedModule1 = typeof import('@shared/stores/authentication-store');
type ImportedModule0 = typeof import('@features/settings/hooks/use-settings-queries');
