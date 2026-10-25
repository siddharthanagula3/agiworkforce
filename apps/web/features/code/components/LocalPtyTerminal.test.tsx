import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopRuntimeEvent } from '@agiworkforce/local-runtime-contract';

type Listener<T> = (value: T) => void;

class FakeTerminal {
  static last: FakeTerminal | null = null;
  cols = 80;
  rows = 24;
  options: Record<string, unknown>;
  written: string[] = [];
  selection = '';
  private data: Listener<string>[] = [];
  private selected: Array<() => void> = [];

  constructor(options: Record<string, unknown>) {
    this.options = options;
    FakeTerminal.last = this;
  }

  loadAddon(): void {}
  open(): void {}
  focus(): void {}
  dispose = vi.fn();
  write(text: string): void {
    this.written.push(text);
  }
  onData(listener: Listener<string>) {
    this.data.push(listener);
    return { dispose: () => undefined };
  }
  onResize() {
    return { dispose: () => undefined };
  }
  onSelectionChange(listener: () => void) {
    this.selected.push(listener);
    return { dispose: () => undefined };
  }
  hasSelection(): boolean {
    return this.selection !== '';
  }
  getSelection(): string {
    return this.selection;
  }
  type(text: string): void {
    for (const listener of this.data) listener(text);
  }
  select(text: string): void {
    this.selection = text;
    for (const listener of this.selected) listener();
  }
}

vi.mock('@xterm/xterm', () => ({ Terminal: FakeTerminal }));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    proposeDimensions() {
      return { cols: 80, rows: 24 };
    }
    fit = (): void => undefined;
  },
}));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

const { LocalPtyTerminal } = await import('./LocalPtyTerminal');

let runtimeListeners: Array<(event: DesktopRuntimeEvent) => void> = [];

function emit(event: DesktopRuntimeEvent) {
  act(() => {
    for (const listener of runtimeListeners) listener(event);
  });
}

function installHost({
  open = async (): Promise<unknown> => ({ ok: true, value: { terminalId: 'term-1' } }),
  terminal = {},
}: {
  open?: () => Promise<unknown>;
  terminal?: Record<string, unknown>;
} = {}) {
  const invokeRuntime = vi.fn(async (command: string) => {
    if (command === 'developer_terminal_open') return open();
    return { ok: true, value: true };
  });
  Object.assign(window, {
    agiHost: {
      shell: 'electron',
      platform: 'electron-darwin',
      appVersion: '1.2.0',
      onRuntimeEvent: vi.fn((listener: (event: DesktopRuntimeEvent) => void) => {
        runtimeListeners.push(listener);
        return () => {
          runtimeListeners = runtimeListeners.filter((entry) => entry !== listener);
        };
      }),
      onDeepLink: vi.fn(() => () => undefined),
      onVoiceHotkey: vi.fn(() => () => undefined),
      onHostCommand: vi.fn(() => () => undefined),
      openExternal: vi.fn(async () => undefined),
      readPreferences: vi.fn(async () => ({
        preferences: {
          terminal: {
            cursorStyle: 'bar',
            cursorBlink: false,
            copyOnSelect: false,
            scrollback: 10_000,
            ...terminal,
          },
        },
      })),
      invokeRuntime,
    },
  });
  return { invokeRuntime };
}

beforeEach(() => {
  runtimeListeners = [];
  FakeTerminal.last = null;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  Reflect.deleteProperty(window, 'agiHost');
  vi.unstubAllGlobals();
});

describe('the terminal the user types into', () => {
  it('opens a shell sized to the pane with the saved cursor and passes typing through', async () => {
    const { invokeRuntime } = installHost();
    render(<LocalPtyTerminal rootId="root-1" />);

    await waitFor(() =>
      expect(invokeRuntime).toHaveBeenCalledWith('developer_terminal_open', {
        rootId: 'root-1',
        cols: 80,
        rows: 24,
      }),
    );
    expect(FakeTerminal.last?.options).toMatchObject({
      cursorStyle: 'bar',
      cursorBlink: false,
      scrollback: 10_000,
    });

    act(() => FakeTerminal.last?.type('ls\r'));
    await waitFor(() =>
      expect(invokeRuntime).toHaveBeenCalledWith('developer_terminal_write', {
        rootId: 'root-1',
        terminalId: 'term-1',
        data: 'ls\r',
      }),
    );
  });

  it('shows what the shell printed before it answered, and nothing from other terminals', async () => {
    let answer: (value: unknown) => void = () => undefined;
    installHost({ open: () => new Promise((resolve) => (answer = resolve)) });
    render(<LocalPtyTerminal rootId="root-1" />);
    await waitFor(() => expect(runtimeListeners.length).toBeGreaterThan(0));

    emit({ kind: 'developer-terminal', rootId: 'root-1', terminalId: 'term-1', data: 'prompt % ' });
    emit({ kind: 'developer-terminal', rootId: 'root-1', terminalId: 'term-9', data: 'other' });
    emit({ kind: 'developer-terminal', rootId: 'root-2', terminalId: 'term-1', data: 'elsewhere' });
    await act(async () => answer({ ok: true, value: { terminalId: 'term-1' } }));

    await waitFor(() => expect(FakeTerminal.last?.written).toEqual(['prompt % ']));
    emit({ kind: 'developer-terminal', rootId: 'root-1', terminalId: 'term-1', data: 'ok\r\n' });
    expect(FakeTerminal.last?.written).toEqual(['prompt % ', 'ok\r\n']);
  });

  it('says when the shell ends and starts a new one on request', async () => {
    const { invokeRuntime } = installHost();
    render(<LocalPtyTerminal rootId="root-1" />);
    await waitFor(() =>
      expect(invokeRuntime).toHaveBeenCalledWith('developer_terminal_open', expect.anything()),
    );
    await waitFor(() => expect(runtimeListeners.length).toBeGreaterThan(0));

    emit({ kind: 'developer-terminal', rootId: 'root-1', terminalId: 'term-1', exitCode: 2 });
    expect(await screen.findByText('The shell ended with exit code 2.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start a new shell' }));
    await waitFor(() =>
      expect(
        invokeRuntime.mock.calls.filter(([command]) => command === 'developer_terminal_open'),
      ).toHaveLength(2),
    );
  });

  it('explains a shell that could not start and offers to try again', async () => {
    installHost({
      open: async () => ({
        ok: false,
        error: { code: 'runtime-unavailable', message: 'Update the AGI CLI to use the terminal.' },
      }),
    });
    render(<LocalPtyTerminal rootId="root-1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Update the AGI CLI/);
    expect(screen.getByRole('button', { name: 'Start a new shell' })).toBeInTheDocument();
  });

  it('closes its shell when the tab goes away', async () => {
    const { invokeRuntime } = installHost();
    const view = render(<LocalPtyTerminal rootId="root-1" />);
    await waitFor(() =>
      expect(invokeRuntime).toHaveBeenCalledWith('developer_terminal_open', expect.anything()),
    );
    await waitFor(() => expect(screen.queryByLabelText('Starting the shell…')).toBeNull());
    view.unmount();
    expect(invokeRuntime).toHaveBeenCalledWith('developer_terminal_close', {
      rootId: 'root-1',
      terminalId: 'term-1',
    });
    expect(FakeTerminal.last?.dispose).toHaveBeenCalled();
  });

  it('copies a selection only when copy on select is on', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    installHost({ terminal: { copyOnSelect: true } });
    render(<LocalPtyTerminal rootId="root-1" />);
    await waitFor(() => expect(screen.queryByLabelText('Starting the shell…')).toBeNull());

    act(() => FakeTerminal.last?.select('npm test'));
    expect(writeText).toHaveBeenCalledWith('npm test');
  });
});
