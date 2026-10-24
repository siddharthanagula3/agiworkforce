import { describe, expect, it, vi } from 'vitest';
import { hideWindow, shouldHideOnClose } from '../windowLifecycle';

describe('closing the main window', () => {
  it('hides it on a Mac so the dock icon brings the same window back', () => {
    expect(shouldHideOnClose({ platform: 'darwin', quitting: false })).toBe(true);
  });

  it('closes it for real when the app is quitting', () => {
    expect(shouldHideOnClose({ platform: 'darwin', quitting: true })).toBe(false);
  });

  it.each(['win32', 'linux'] as const)('closes it on %s', (platform) => {
    expect(shouldHideOnClose({ platform, quitting: false })).toBe(false);
  });
});

describe('hiding a window', () => {
  it('hides a normal window at once', () => {
    const win = {
      isFullScreen: () => false,
      setFullScreen: vi.fn(),
      once: vi.fn(),
      hide: vi.fn(),
    };

    hideWindow(win);

    expect(win.hide).toHaveBeenCalledTimes(1);
    expect(win.setFullScreen).not.toHaveBeenCalled();
  });

  it('leaves full screen first so its space is not left empty', () => {
    let leave: () => void = () => undefined;
    const win = {
      isFullScreen: () => true,
      setFullScreen: vi.fn(),
      once: vi.fn((_event: string, listener: () => void) => {
        leave = listener;
      }),
      hide: vi.fn(),
    };

    hideWindow(win);
    expect(win.setFullScreen).toHaveBeenCalledWith(false);
    expect(win.hide).not.toHaveBeenCalled();

    leave();
    expect(win.hide).toHaveBeenCalledTimes(1);
  });
});
