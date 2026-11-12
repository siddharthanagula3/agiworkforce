import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { DEVELOPER_SESSION_PROTOCOL_VERSION } from '@agiworkforce/types';

import { setupCommands } from '../core/commandSetup';
import { LocalRuntimeClient } from '../integrations/localRuntimeClient';
import { t } from '../l10n';
import { Config } from '../platform/config';
import { __resetSubsystemHealthForTests } from '../core/subsystemHealth';
import { __resetStartupWorkForTests } from '../core/startupWork';
import type { AgiDiagnosticsProvider } from '../providers/diagnosticsProvider';

type RemoteEnvironmentModule = typeof import('../platform/remoteEnvironment');

vi.mock('../platform/remoteEnvironment', async (importOriginal) => ({
  ...(await importOriginal<RemoteEnvironmentModule>()),
  runCliVersion: vi.fn(async () => 'agi 1.0.0'),
  resolveCliPath: vi.fn(() => ({ ok: true, path: '/home/dev/.agi/bin/agi' })),
}));

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
    resumeConversation: ReturnType<typeof vi.fn>;
    prefillComposer: ReturnType<typeof vi.fn>;
    pushActiveProject: ReturnType<typeof vi.fn>;
  };
  let runtime: {
    listThreads: ReturnType<typeof vi.fn>;
    handOffThread: ReturnType<typeof vi.fn>;
    acceptHandoff: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    __resetStartupWorkForTests();
    handlers = new Map();
    terminals = [];
    runtime = {
      listThreads: vi.fn(),
      handOffThread: vi.fn(),
      acceptHandoff: vi.fn().mockResolvedValue(undefined),
    };
    activeThreadId = 'thread-7f3';
    turnInFlight = false;
    sidebar = {
      activeThreadId: () => activeThreadId,
      chatTurnInFlight: () => turnInFlight,
      reveal: vi.fn(),
      resetConversation: vi.fn(),
      resumeConversation: vi.fn().mockResolvedValue(undefined),
      prefillComposer: vi.fn(),
      pushActiveProject: vi.fn(),
      releaseForTerminal: vi.fn().mockResolvedValue(undefined),
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
      localRuntimes: { forWorkspace: vi.fn(() => runtime) } as never,
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

  it('answers a session link in a Restricted Mode folder by offering trust, starting nothing', async () => {
    const spawn = vi.fn();
    const client = new LocalRuntimeClient({
      cliPath: '/home/dev/.agi/bin/agi',
      workspaceTrusted: () => false,
      cwd: '/repo',
      clientVersion: '0.3.0',
      spawn,
    });
    runtime.listThreads.mockImplementation((params) => client.listThreads(params));
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
      t('webview.manageTrust') as never,
    );

    await handlers.get('agi-workforce.continueCliSession')?.('thread-cli');

    expect(spawn).not.toHaveBeenCalled();
    expect(runtime.handOffThread).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    expect(vi.mocked(vscode.window.showWarningMessage).mock.calls[0]?.[0]).toContain(
      'Restricted Mode',
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.trust.manage');
  });

  it('opens the accepted CLI session in the sidebar instead of leaving another thread selected', async () => {
    const issuedAt = new Date().toISOString();
    runtime.listThreads.mockResolvedValue({
      threads: [
        { id: 'thread-old', updatedAt: '2026-09-20T10:00:00.000Z' },
        { id: 'thread-cli', updatedAt: '2026-09-20T12:00:00.000Z' },
      ],
    });
    runtime.handOffThread.mockResolvedValue({
      protocolVersion: DEVELOPER_SESSION_PROTOCOL_VERSION,
      threadId: 'thread-cli',
      origin: 'developer_session',
      issuedBy: 'cli',
      issuedAt,
      fromEnvironment: 'local',
      toEnvironment: 'local',
      workspace: { cwd: vscode.Uri.file('/repo').fsPath },
      posture: { agentMode: 'agent', trustMode: 'local', permissionProfileId: 'default' },
    });
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('Continue here' as never);

    await handlers.get('agi-workforce.continueCliSession')?.();

    expect(runtime.acceptHandoff).toHaveBeenCalledOnce();
    expect(sidebar.resumeConversation).toHaveBeenCalledWith('thread-cli');
  });

  it('records the handoff only once it is accepted and opened, so a failed attempt can be retried', async () => {
    const handoff = {
      protocolVersion: DEVELOPER_SESSION_PROTOCOL_VERSION,
      threadId: 'thread-cli',
      origin: 'developer_session',
      issuedBy: 'cli',
      issuedAt: new Date().toISOString(),
      fromEnvironment: 'local',
      toEnvironment: 'local',
      workspace: { cwd: vscode.Uri.file('/repo').fsPath },
      posture: { agentMode: 'agent', trustMode: 'local', permissionProfileId: 'default' },
    };
    runtime.listThreads.mockResolvedValue({
      threads: [{ id: 'thread-cli', updatedAt: '2026-09-20T12:00:00.000Z' }],
    });
    runtime.handOffThread.mockResolvedValue(handoff);
    runtime.acceptHandoff.mockRejectedValueOnce(new Error('runtime handshake failed'));
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('Continue here' as never);

    await handlers.get('agi-workforce.continueCliSession')?.();

    expect(sidebar.resumeConversation).not.toHaveBeenCalled();
    expect(vi.mocked(vscode.window.showErrorMessage).mock.calls.at(-1)?.[0]).toContain(
      'runtime handshake failed',
    );

    await handlers.get('agi-workforce.continueCliSession')?.();

    expect(runtime.acceptHandoff).toHaveBeenCalledTimes(2);
    expect(sidebar.resumeConversation).toHaveBeenCalledWith('thread-cli');

    await handlers.get('agi-workforce.continueCliSession')?.();

    expect(runtime.acceptHandoff).toHaveBeenCalledTimes(2);
    expect(vi.mocked(vscode.window.showWarningMessage).mock.calls.at(-1)?.[0]).toContain(
      'already taken that session',
    );
  });

  it('does not touch the sidebar thread when the handoff review is declined', async () => {
    runtime.listThreads.mockResolvedValue({
      threads: [{ id: 'thread-cli', updatedAt: '2026-09-20T12:00:00.000Z' }],
    });
    runtime.handOffThread.mockResolvedValue({
      protocolVersion: DEVELOPER_SESSION_PROTOCOL_VERSION,
      threadId: 'thread-cli',
      origin: 'developer_session',
      issuedBy: 'cli',
      issuedAt: new Date().toISOString(),
      fromEnvironment: 'local',
      toEnvironment: 'local',
      workspace: { cwd: vscode.Uri.file('/repo').fsPath },
      posture: { agentMode: 'agent', trustMode: 'local', permissionProfileId: 'default' },
    });
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined as never);

    await handlers.get('agi-workforce.continueCliSession')?.();

    expect(runtime.acceptHandoff).not.toHaveBeenCalled();
    expect(sidebar.resumeConversation).not.toHaveBeenCalled();
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
  let reviewCode: ReturnType<typeof vi.fn<AgiDiagnosticsProvider['reviewCode']>>;

  beforeEach(() => {
    vi.clearAllMocks();
    __resetStartupWorkForTests();
    handlers = new Map();
    reviewCode = vi.fn<AgiDiagnosticsProvider['reviewCode']>().mockResolvedValue({
      status: 'completed',
      diagnosticCount: 2,
      summary: 'Two issues.',
    });
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

  it('reviews at the session effort unless a level is passed', async () => {
    vi.spyOn(Config, 'agentEffort').mockReturnValue('high');
    vscode.window.activeTextEditor = {
      document: { uri: vscode.Uri.file('/repo/src/app.ts') },
      selection: new vscode.Selection(0, 0, 0, 0),
    } as unknown as vscode.TextEditor;

    await handlers.get('agi-workforce.codeReview')?.();
    expect(reviewCode.mock.calls.at(-1)?.[3]).toBe('high');

    await handlers.get('agi-workforce.codeReview')?.('xhigh');
    expect(reviewCode.mock.calls.at(-1)?.[3]).toBe('xhigh');

    await handlers.get('agi-workforce.codeReview')?.('extreme');
    expect(reviewCode.mock.calls.at(-1)?.[3]).toBe('high');
  });

  it('says the review found nothing rather than staying silent', async () => {
    reviewCode.mockResolvedValue({
      status: 'completed',
      diagnosticCount: 0,
      summary: 'Looks fine.',
    });
    vscode.window.activeTextEditor = {
      document: { uri: vscode.Uri.file('/repo/src/app.ts') },
      selection: new vscode.Selection(0, 0, 0, 0),
    } as unknown as vscode.TextEditor;

    await handlers.get('agi-workforce.codeReview')?.();

    expect(
      vi.mocked(vscode.window.showInformationMessage).mock.calls.map(([text]) => String(text)),
    ).toContainEqual(expect.stringContaining('No issues found'));
  });

  it.each([
    'This file could not be safely resolved, so its contents are not sent anywhere.',
    'No code to review.',
  ])('shows why no review occurred without reporting success: %s', async (reason) => {
    reviewCode.mockResolvedValue({ status: 'not-reviewed', reason });
    vscode.window.activeTextEditor = {
      document: { uri: vscode.Uri.file('/repo/src/app.ts') },
      selection: new vscode.Selection(0, 0, 0, 0),
    } as unknown as vscode.TextEditor;

    await handlers.get('agi-workforce.codeReview')?.();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining(reason));
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
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
