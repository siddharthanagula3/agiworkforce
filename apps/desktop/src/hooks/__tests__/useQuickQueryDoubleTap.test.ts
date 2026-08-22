import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useQuickQueryDoubleTap } from '../useQuickQueryDoubleTap';
import { useSettingsStore, useVoiceInputStore } from '../../stores/settingsStore';

function tapOption(times: number, gapMs = 100) {
  for (let index = 0; index < times; index += 1) {
    if (index > 0) vi.advanceTimersByTime(gapMs);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' }));
    });
  }
}

describe('useQuickQueryDoubleTap', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useSettingsStore.setState({
      globalHotkeyPreferences: { enabled: true, combo: 'Command+Shift+Space' },
    });
    useVoiceInputStore.setState({ hotkey: 'ctrl+shift+v' });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('opens Quick Query on a double tap of Option', () => {
    const onDoubleTap = vi.fn();
    renderHook(() => useQuickQueryDoubleTap(onDoubleTap));

    tapOption(2);

    expect(onDoubleTap).toHaveBeenCalledTimes(1);
  });

  it('ignores taps spaced further apart than the double-tap window', () => {
    const onDoubleTap = vi.fn();
    renderHook(() => useQuickQueryDoubleTap(onDoubleTap));

    tapOption(2, 500);

    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('stays shut while Option is the voice dictation hotkey', () => {
    useVoiceInputStore.setState({ hotkey: 'option' });
    const onDoubleTap = vi.fn();
    renderHook(() => useQuickQueryDoubleTap(onDoubleTap));

    tapOption(2);

    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('stays shut when the global hotkey preference is disabled', () => {
    useSettingsStore.setState({
      globalHotkeyPreferences: { enabled: false, combo: 'Command+Shift+Space' },
    });
    const onDoubleTap = vi.fn();
    renderHook(() => useQuickQueryDoubleTap(onDoubleTap));

    tapOption(2);

    expect(onDoubleTap).not.toHaveBeenCalled();
  });
});
