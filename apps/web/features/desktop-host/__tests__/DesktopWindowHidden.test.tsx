import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostBridgeStub } from '@/test/host-bridge-stub';
import { useDesktopWindowHidden } from '../hooks/use-desktop-voice-hotkey';

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  Reflect.deleteProperty(window, 'agiHost');
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('useDesktopWindowHidden', () => {
  it('fires when the shell hides the window', () => {
    Object.assign(window, { agiHost: hostBridgeStub() });
    const onHidden = vi.fn();
    renderHook(() => useDesktopWindowHidden(onHidden, true));

    setVisibility('visible');
    expect(onHidden).not.toHaveBeenCalled();
    setVisibility('hidden');
    expect(onHidden).toHaveBeenCalledTimes(1);
  });

  it('runs the latest callback', () => {
    Object.assign(window, { agiHost: hostBridgeStub() });
    const first = vi.fn();
    const second = vi.fn();
    const view = renderHook(({ cb }) => useDesktopWindowHidden(cb, true), {
      initialProps: { cb: first },
    });
    view.rerender({ cb: second });

    setVisibility('hidden');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stays quiet in a browser tab', () => {
    const onHidden = vi.fn();
    renderHook(() => useDesktopWindowHidden(onHidden, true));

    setVisibility('hidden');
    expect(onHidden).not.toHaveBeenCalled();
  });

  it('stays quiet while disabled and after unmount', () => {
    Object.assign(window, { agiHost: hostBridgeStub() });
    const onHidden = vi.fn();
    const disabled = renderHook(() => useDesktopWindowHidden(onHidden, false));
    setVisibility('hidden');
    expect(onHidden).not.toHaveBeenCalled();
    disabled.unmount();

    const mounted = renderHook(() => useDesktopWindowHidden(onHidden, true));
    mounted.unmount();
    setVisibility('hidden');
    expect(onHidden).not.toHaveBeenCalled();
  });
});
