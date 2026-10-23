import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { setupCommands } from '../core/commandSetup';
import { __resetSubsystemHealthForTests } from '../core/subsystemHealth';
import { __resetStartupWorkForTests } from '../core/startupWork';
import { runCliVersion } from '../platform/remoteEnvironment';

type RemoteEnvironmentModule = typeof import('../platform/remoteEnvironment');

vi.mock('../platform/remoteEnvironment', async (importOriginal) => ({
  ...(await importOriginal<RemoteEnvironmentModule>()),
  runCliVersion: vi.fn(),
}));

interface Terminal {
  name: string;
  exitStatus: undefined;
  show: ReturnType<typeof vi.fn>;
  sendText: ReturnType<typeof vi.fn>;
}

function tree(): never {
  return { refresh: vi.fn(), onDidChangeTreeData: vi.fn(() => new vscode.Disposable()) } as never;
}

function setUseTerminal(globalValue: boolean | undefined, workspaceValue?: boolean): void {
  vi.mocked(vscode.workspace.getConfiguration).mockImplementation(
    () =>
      ({
        get: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
        has: vi.fn().mockReturnValue(false),
        inspect: vi.fn((key: string) =>
          key === 'useTerminal'
            ? { key, defaultValue: false, globalValue, workspaceValue }
            : undefined,
        ),
      }) as never,
  );
}

describe('the Use terminal setting', () => {
  let handlers: Map<string, (...args: unknown[]) => unknown>;
  let terminals: Terminal[];
  let activeThreadId: string | undefined;
  let sidebar: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    __resetStartupWorkForTests();
    handlers = new Map();
    terminals = [];
    activeThreadId = undefined;
    sidebar = {
      activeThreadId: () => activeThreadId,
      chatTurnInFlight: () => false,
      reveal: vi.fn(),
      releaseForTerminal: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(runCliVersion).mockResolvedValue('agi 1.0.0');
    vi.mocked(vscode.commands.registerCommand).mockImplementation((id, handler) => {
      handlers.set(id, handler);
      return new vscode.Disposable(() => undefined);
    });
    vi.mocked(vscode.window.createTerminal).mockImplementation((options: unknown) => {
      const terminal: Terminal = {
        name: String((options as { name?: string }).name ?? ''),
        exitStatus: undefined,
        show: vi.fn(),
        sendText: vi.fn(),
      };
      terminals.push(terminal);
      return terminal as unknown as vscode.Terminal;
    });
    (vscode.window as { terminals: unknown[] }).terminals = [];
    vscode.workspace.workspaceFolders = [{ name: 'repo', index: 0, uri: vscode.Uri.file('/repo') }];

    setupCommands(new vscode.ExtensionContext(), {
      sidebarProvider: sidebar as never,
      conversationTreeProvider: tree(),
      cloudTasksTreeProvider: tree(),
      schedulesTreeProvider: tree(),
      projectsTreeProvider: tree(),
      artifactsTreeProvider: tree(),
      artifactContentProvider: {} as never,
      connectorsTreeProvider: tree(),
      localRuntimes: { forWorkspace: vi.fn() } as never,
      contextPanelProvider: tree(),
      memoryTreeProvider: tree(),
      diffDecorationProvider: {} as never,
      diagnosticsProvider: {} as never,
    });
  });

  afterEach(() => {
    __resetSubsystemHealthForTests();
    __resetStartupWorkForTests();
    vscode.workspace.workspaceFolders = undefined;
    vi.restoreAllMocks();
  });

  it('keeps the native chat when the setting is off', async () => {
    setUseTerminal(undefined);

    await handlers.get('agi-workforce.chat')?.();

    expect(terminals).toHaveLength(0);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('agi-workforce.sidebar.focus');
    expect(sidebar['reveal']).toHaveBeenCalled();
  });

  it('starts the CLI in an AGI terminal in the workspace when the setting is on', async () => {
    setUseTerminal(true);

    await handlers.get('agi-workforce.chat')?.();

    expect(terminals).toHaveLength(1);
    expect(terminals[0]?.name).toBe('AGI');
    expect(terminals[0]?.show).toHaveBeenCalled();
    expect(terminals[0]?.sendText).toHaveBeenCalledOnce();
    expect(String(terminals[0]?.sendText.mock.calls[0]?.[0])).not.toContain('--resume');
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('agi-workforce.sidebar.focus');
  });

  it('ignores a workspace value, so a repository cannot switch the mode on', async () => {
    setUseTerminal(undefined, true);

    await handlers.get('agi-workforce.chat')?.();

    expect(terminals).toHaveLength(0);
  });

  it('shows the terminal already running instead of starting a second CLI in it', async () => {
    setUseTerminal(true);
    const running = { name: 'AGI', exitStatus: undefined, show: vi.fn(), sendText: vi.fn() };
    (vscode.window as { terminals: unknown[] }).terminals = [running];

    await handlers.get('agi-workforce.chat')?.();

    expect(running.show).toHaveBeenCalled();
    expect(running.sendText).not.toHaveBeenCalled();
    expect(terminals).toHaveLength(0);
  });

  it('resumes the session the native chat is holding rather than starting another', async () => {
    setUseTerminal(true);
    activeThreadId = 'thread-7f3';

    await handlers.get('agi-workforce.chat')?.();

    expect(sidebar['releaseForTerminal']).toHaveBeenCalled();
    expect(terminals).toHaveLength(1);
    expect(String(terminals[0]?.sendText.mock.calls[0]?.[0])).toContain('--resume');
    expect(String(terminals[0]?.sendText.mock.calls[0]?.[0])).toContain('thread-7f3');
  });

  describe('without an AGI CLI on this machine', () => {
    beforeEach(() => {
      setUseTerminal(true);
      vi.mocked(runCliVersion).mockRejectedValue(
        Object.assign(new Error('spawn agi ENOENT'), { code: 'ENOENT' }),
      );
    });

    it('opens no terminal when the install offer is declined', async () => {
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined as never);

      await handlers.get('agi-workforce.chat')?.();

      expect(vi.mocked(vscode.window.showWarningMessage).mock.calls[0]?.[0]).toContain(
        'was not found',
      );
      expect(terminals).toHaveLength(0);
      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('agi-workforce.installCli');
    });

    it('offers the installer script and starts nothing when it does not finish', async () => {
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Install AGI CLI' as never);
      vi.mocked(vscode.commands.executeCommand).mockImplementation(((command: string) =>
        Promise.resolve(
          command === 'agi-workforce.installCli' ? { ok: false } : undefined,
        )) as never);

      await handlers.get('agi-workforce.chat')?.();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('agi-workforce.installCli');
      expect(terminals).toHaveLength(0);
    });

    it('starts the CLI once the install has finished', async () => {
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Install AGI CLI' as never);
      vi.mocked(vscode.commands.executeCommand).mockImplementation(((command: string) =>
        Promise.resolve(
          command === 'agi-workforce.installCli' ? { ok: true } : undefined,
        )) as never);

      await handlers.get('agi-workforce.chat')?.();

      expect(terminals).toHaveLength(1);
    });
  });
});
