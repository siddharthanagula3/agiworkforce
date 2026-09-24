import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { setupCommands } from '../core/commandSetup';
import { __resetSubsystemHealthForTests } from '../core/subsystemHealth';
import { __resetStartupWorkForTests } from '../core/startupWork';

interface Terminal {
  name: string;
  show: ReturnType<typeof vi.fn>;
  sendText: ReturnType<typeof vi.fn>;
}

function tree(): never {
  return { refresh: vi.fn(), onDidChangeTreeData: vi.fn(() => new vscode.Disposable()) } as never;
}

describe('taking a session somewhere else', () => {
  let handlers: Map<string, (...args: unknown[]) => unknown>;
  let terminals: Terminal[];
  let activeThreadId: string | undefined;
  let turnInFlight: boolean;
  let sidebar: {
    activeThreadId: () => string | undefined;
    chatTurnInFlight: () => boolean;
    reveal: ReturnType<typeof vi.fn>;
    resetConversation: ReturnType<typeof vi.fn>;
    prefillComposer: ReturnType<typeof vi.fn>;
    pushActiveProject: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    __resetStartupWorkForTests();
    handlers = new Map();
    terminals = [];
    activeThreadId = 'thread-7f3';
    turnInFlight = false;
    sidebar = {
      activeThreadId: () => activeThreadId,
      chatTurnInFlight: () => turnInFlight,
      reveal: vi.fn(),
      resetConversation: vi.fn(),
      prefillComposer: vi.fn(),
      pushActiveProject: vi.fn(),
    };
    vscode.window.activeTextEditor = undefined;

    vi.mocked(vscode.commands.registerCommand).mockImplementation((id, handler) => {
      handlers.set(id, handler);
      return new vscode.Disposable(() => undefined);
    });
    vi.mocked(vscode.window.createTerminal).mockImplementation((options: unknown) => {
      const terminal: Terminal = {
        name: String((options as { name?: string }).name ?? ''),
        show: vi.fn(),
        sendText: vi.fn(),
      };
      terminals.push(terminal);
      return terminal as unknown as vscode.Terminal;
    });
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
      nativeChatAvailable: false,
    });
  });

  afterEach(() => {
    __resetSubsystemHealthForTests();
    __resetStartupWorkForTests();
    vscode.workspace.workspaceFolders = undefined;
    vscode.window.activeTextEditor = undefined;
    vi.restoreAllMocks();
  });

  it('opens a terminal in the workspace that resumes the same session', async () => {
    await handlers.get('agi-workforce.continueInTerminal')?.();

    expect(terminals).toHaveLength(1);
    expect(terminals[0]?.show).toHaveBeenCalled();
    expect(terminals[0]?.sendText.mock.calls[0]?.[0]).toContain('--resume');
    expect(terminals[0]?.sendText.mock.calls[0]?.[0]).toContain('thread-7f3');
  });

  it('says what to do first instead of opening a terminal on nothing', async () => {
    activeThreadId = undefined;

    await handlers.get('agi-workforce.continueInTerminal')?.();

    expect(terminals).toHaveLength(0);
    expect(vi.mocked(vscode.window.showInformationMessage).mock.calls.at(-1)?.[0]).toContain(
      'send a message first',
    );
  });

  it('refuses a session id that would carry a shell command into the terminal', async () => {
    activeThreadId = 'thread; rm -rf /';

    await handlers.get('agi-workforce.continueInTerminal')?.();

    const sent = String(terminals[0]?.sendText.mock.calls[0]?.[0] ?? '');
    expect(sent).not.toMatch(/--resume thread; rm/u);
  });

  it('starts a new chat from the selection, carrying the lines it came from', async () => {
    vscode.window.activeTextEditor = {
      selection: new vscode.Selection(4, 0, 6, 8),
      document: { uri: vscode.Uri.file('/repo/src/app.ts') },
    } as unknown as vscode.TextEditor;
    vi.mocked(vscode.workspace.asRelativePath).mockReturnValue('src/app.ts');

    await handlers.get('agi-workforce.sendSelectionToNewSession')?.();

    expect(sidebar.resetConversation).toHaveBeenCalledOnce();
    expect(sidebar.prefillComposer).toHaveBeenCalledWith('@src/app.ts#L5-L7 ', [
      {
        path: 'src/app.ts',
        range: { startLine: 4, startCharacter: 0, endLine: 6, endCharacter: 8 },
      },
    ]);
  });

  it('names what a new chat would lose while a reply is still being written, and stops on no', async () => {
    turnInFlight = true;
    vscode.window.activeTextEditor = {
      selection: new vscode.Selection(0, 0, 0, 4),
      document: { uri: vscode.Uri.file('/repo/src/app.ts') },
    } as unknown as vscode.TextEditor;
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined as never);

    await handlers.get('agi-workforce.sendSelectionToNewSession')?.();

    const [, options, confirm] =
      vi.mocked(vscode.window.showWarningMessage).mock.calls.at(-1) ?? [];
    expect(options).toMatchObject({ modal: true });
    expect(String((options as { detail?: string }).detail)).toContain('will not be recoverable');
    expect(confirm).toBe('Start new chat');
    expect(sidebar.resetConversation).not.toHaveBeenCalled();
  });

  it('asks for a selection rather than opening an empty new chat', async () => {
    vscode.window.activeTextEditor = undefined;

    await handlers.get('agi-workforce.sendSelectionToNewSession')?.();

    expect(sidebar.resetConversation).not.toHaveBeenCalled();
    expect(vi.mocked(vscode.window.showWarningMessage).mock.calls.at(-1)?.[0]).toContain(
      'select the code',
    );
  });
});

describe('reviewing the open file', () => {
  let handlers: Map<string, (...args: unknown[]) => unknown>;
  let reviewCode: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    __resetStartupWorkForTests();
    handlers = new Map();
    reviewCode = vi.fn().mockResolvedValue({ diagnosticCount: 2 });
    vi.mocked(vscode.commands.registerCommand).mockImplementation((id, handler) => {
      handlers.set(id, handler);
      return new vscode.Disposable(() => undefined);
    });

    setupCommands(new vscode.ExtensionContext(), {
      sidebarProvider: {
        reveal: vi.fn(),
        resetConversation: vi.fn(),
        prefillComposer: vi.fn(),
        chatTurnInFlight: () => false,
        pushActiveProject: vi.fn(),
      } as never,
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
      diagnosticsProvider: { reviewCode } as never,
      nativeChatAvailable: false,
    });
  });

  afterEach(() => {
    __resetSubsystemHealthForTests();
    __resetStartupWorkForTests();
    vscode.window.activeTextEditor = undefined;
    vi.restoreAllMocks();
  });

  it('reviews the active editor and says how many findings came back', async () => {
    const editor = {
      document: { uri: vscode.Uri.file('/repo/src/app.ts') },
      selection: new vscode.Selection(0, 0, 0, 0),
    } as unknown as vscode.TextEditor;
    vscode.window.activeTextEditor = editor;

    await handlers.get('agi-workforce.codeReview')?.();

    expect(reviewCode).toHaveBeenCalledOnce();
    expect(reviewCode.mock.calls[0]?.[0]).toBe(editor);
    expect(
      vi.mocked(vscode.window.showInformationMessage).mock.calls.map(([text]) => String(text)),
    ).toContainEqual(expect.stringContaining('2'));
  });

  it('says the review found nothing rather than staying silent', async () => {
    reviewCode.mockResolvedValue({ diagnosticCount: 0 });
    vscode.window.activeTextEditor = {
      document: { uri: vscode.Uri.file('/repo/src/app.ts') },
      selection: new vscode.Selection(0, 0, 0, 0),
    } as unknown as vscode.TextEditor;

    await handlers.get('agi-workforce.codeReview')?.();

    expect(
      vi.mocked(vscode.window.showInformationMessage).mock.calls.map(([text]) => String(text)),
    ).toContainEqual(expect.stringContaining('No issues found'));
  });

  it('asks for a file rather than reviewing nothing', async () => {
    vscode.window.activeTextEditor = undefined;

    await handlers.get('agi-workforce.codeReview')?.();

    expect(reviewCode).not.toHaveBeenCalled();
    expect(vi.mocked(vscode.window.showWarningMessage).mock.calls.at(-1)?.[0]).toContain(
      'No active editor',
    );
  });
});
