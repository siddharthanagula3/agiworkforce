import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (...args: never[]) => void;

class FakeWebContents {
  listeners = new Map<string, Listener[]>();
  url = '';
  setWindowOpenHandler = vi.fn();
  on(event: string, listener: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }
  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? [])
      (listener as Listener)(...(args as never[]));
  }
  getURL(): string {
    return this.url;
  }
}

class FakeWindow {
  static last: FakeWindow | null = null;
  webContents = new FakeWebContents();
  private handlers = new Map<string, Listener[]>();
  destroyed = false;
  constructor() {
    FakeWindow.last = this;
  }
  once(event: string, listener: Listener): this {
    return this.on(event, listener);
  }
  on(event: string, listener: Listener): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), listener]);
    return this;
  }
  emit(event: string): void {
    for (const listener of this.handlers.get(event) ?? []) (listener as Listener)();
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
  isVisible(): boolean {
    return true;
  }
  focus = vi.fn();
  show = vi.fn();
  destroy(): void {
    this.destroyed = true;
    this.emit('closed');
  }
  async loadURL(url: string): Promise<void> {
    this.webContents.url = url;
  }
}

vi.mock('electron', () => ({
  BrowserWindow: FakeWindow,
  session: {
    fromPartition: () => ({
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    }),
  },
  shell: { openExternal: vi.fn() },
}));

const { openLocalPreview, readPreviewConsoleErrors, closeLocalPreview } =
  await import('../previewWindow');

const PAGE = 'http://localhost:5173/';

beforeEach(() => {
  closeLocalPreview();
  FakeWindow.last = null;
});

describe('reading the errors of the preview window', () => {
  it('reports nothing and no page while no preview is open', () => {
    expect(readPreviewConsoleErrors(false)).toEqual({ url: null, errors: [], dropped: 0 });
  });

  it('keeps console errors and a crashed page, and ignores other console levels', async () => {
    await openLocalPreview(PAGE);
    const contents = FakeWindow.last!.webContents;
    contents.emit('console-message', {
      level: 'error',
      message: 'Uncaught ReferenceError: foo is not defined',
      sourceId: `${PAGE}src/main.ts`,
      lineNumber: 4,
    });
    contents.emit('console-message', {
      level: 'warning',
      message: 'deprecated',
      sourceId: '',
      lineNumber: 1,
    });
    contents.emit('console-message', {
      level: 'info',
      message: 'hello',
      sourceId: '',
      lineNumber: 1,
    });
    contents.emit('render-process-gone', {}, { reason: 'crashed' });

    const report = readPreviewConsoleErrors(false);
    expect(report.url).toBe(PAGE);
    expect(report.errors.map((error) => error.message)).toEqual([
      'Uncaught ReferenceError: foo is not defined',
      'The preview page stopped (crashed).',
    ]);
    expect(report.errors[0]).toMatchObject({ source: `${PAGE}src/main.ts`, line: 4 });
  });

  it('forgets errors once they are read with clear, and when the page reloads', async () => {
    await openLocalPreview(PAGE);
    const contents = FakeWindow.last!.webContents;
    const fail = (message: string) =>
      contents.emit('console-message', { level: 'error', message, sourceId: '', lineNumber: 0 });

    fail('first');
    expect(readPreviewConsoleErrors(true).errors).toHaveLength(1);
    expect(readPreviewConsoleErrors(false).errors).toHaveLength(0);

    fail('second');
    contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
    expect(readPreviewConsoleErrors(false).errors).toHaveLength(1);
    contents.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false });
    expect(readPreviewConsoleErrors(false).errors).toHaveLength(1);
    contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
    expect(readPreviewConsoleErrors(false).errors).toHaveLength(0);
  });

  it('drops what it held when the preview window closes', async () => {
    await openLocalPreview(PAGE);
    FakeWindow.last!.webContents.emit('console-message', {
      level: 'error',
      message: 'late',
      sourceId: '',
      lineNumber: 0,
    });
    closeLocalPreview();

    expect(readPreviewConsoleErrors(false)).toEqual({ url: null, errors: [], dropped: 0 });
  });
});
