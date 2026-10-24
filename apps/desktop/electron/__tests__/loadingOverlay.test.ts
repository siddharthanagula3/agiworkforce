import { beforeAll, describe, expect, it, vi } from 'vitest';
import { defineShellInkGlobals } from './shellTokenGlobals';

const created = vi.hoisted(() => ({ views: [] as Array<Record<string, unknown>> }));

vi.mock('electron', () => {
  class WebContentsView {
    options: unknown;
    setBounds = vi.fn();
    webContents = {
      setWindowOpenHandler: vi.fn(),
      loadURL: vi.fn(async () => undefined),
      close: vi.fn(),
    };
    constructor(options: unknown) {
      this.options = options;
      created.views.push(this as unknown as Record<string, unknown>);
    }
  }
  return { WebContentsView };
});

const { showLoadingOverlay } = await import('../loadingOverlay');

beforeAll(defineShellInkGlobals);

function fakeWindow() {
  const listeners = new Map<string, () => void>();
  return {
    listeners,
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    getContentBounds: () => ({ x: 0, y: 0, width: 1280, height: 800 }),
    on: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    removeListener: vi.fn((event: string) => listeners.delete(event)),
    isDestroyed: vi.fn(() => false),
  };
}

describe('the loading state over a window whose page has not drawn', () => {
  it('covers the window with a view that runs no script and has no bridge', () => {
    const win = fakeWindow();
    showLoadingOverlay(win as never);
    const view = created.views.at(-1) as {
      options: { webPreferences: Record<string, unknown> };
      setBounds: ReturnType<typeof vi.fn>;
      webContents: { loadURL: ReturnType<typeof vi.fn> };
    };

    expect(win.contentView.addChildView).toHaveBeenCalledWith(view);
    expect(view.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 1280, height: 800 });
    expect(view.options.webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
    });
    expect('preload' in view.options.webPreferences).toBe(false);
    expect(String(view.webContents.loadURL.mock.calls[0]?.[0])).toMatch(/^data:text\/html/u);
  });

  it('follows the window when it is resized', () => {
    const win = fakeWindow();
    showLoadingOverlay(win as never);
    const view = created.views.at(-1) as { setBounds: ReturnType<typeof vi.fn> };
    win.getContentBounds = () => ({ x: 0, y: 0, width: 900, height: 600 });

    win.listeners.get('resize')?.();

    expect(view.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 900, height: 600 });
  });

  it('removes the view and closes its page when taken away', () => {
    const win = fakeWindow();
    const remove = showLoadingOverlay(win as never);
    const view = created.views.at(-1) as { webContents: { close: ReturnType<typeof vi.fn> } };

    remove();

    expect(win.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(view.webContents.close).toHaveBeenCalledTimes(1);
    expect(win.listeners.has('resize')).toBe(false);
  });

  it('does not touch a window that is already gone', () => {
    const win = fakeWindow();
    const remove = showLoadingOverlay(win as never);
    win.isDestroyed.mockReturnValue(true);

    remove();

    expect(win.contentView.removeChildView).not.toHaveBeenCalled();
  });
});
