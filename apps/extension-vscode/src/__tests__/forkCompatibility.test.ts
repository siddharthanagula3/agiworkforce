import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { activate } from '../extension';
import { registerChatParticipant } from '../features/chat-participant/chatParticipant';
import { SidebarProvider } from '../features/sidebar-webview/sidebarProvider';
import { __resetSubsystemHealthForTests } from '../core/subsystemHealth';

function context(): vscode.ExtensionContext {
  return new vscode.ExtensionContext();
}

describe('Code-OSS fork compatibility', () => {
  let handlers: Map<string, (...args: unknown[]) => unknown>;
  let originalCreateParticipant: typeof vscode.chat.createChatParticipant;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = new Map();
    originalCreateParticipant = vscode.chat.createChatParticipant;
    vi.mocked(vscode.commands.registerCommand).mockImplementation((id, handler) => {
      handlers.set(id, handler);
      return new vscode.Disposable(() => undefined);
    });
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file('/workspace') },
    ];
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
      type: vscode.FileType.File,
      ctime: 0,
      mtime: 0,
      size: 20,
    });
  });

  afterEach(() => {
    Object.defineProperty(vscode.chat, 'createChatParticipant', {
      configurable: true,
      value: originalCreateParticipant,
    });
    vscode.window.activeTextEditor = undefined;
    __resetSubsystemHealthForTests();
    vi.restoreAllMocks();
  });

  it('activates and routes Chat commands to the first-party sidebar without native Chat API', async () => {
    Object.defineProperty(vscode.chat, 'createChatParticipant', {
      configurable: true,
      value: undefined,
    });

    expect(() => activate(context())).not.toThrow();
    await handlers.get('agi-workforce.chat')?.();

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('agi-workforce.sidebar.focus');
    expect(vi.mocked(vscode.commands.executeCommand).mock.calls.map(([id]) => id)).not.toContain(
      'workbench.action.chat.open',
    );
  });

  it('prefills a selected file reference without invoking proprietary chat commands', async () => {
    Object.defineProperty(vscode.chat, 'createChatParticipant', {
      configurable: true,
      value: undefined,
    });
    const uri = vscode.Uri.file('/workspace/src/app.ts');
    vscode.window.activeTextEditor = {
      document: { uri },
      selection: new vscode.Selection(4, 0, 6, 8),
    } as unknown as vscode.TextEditor;
    vi.spyOn(vscode.workspace, 'asRelativePath').mockReturnValue('src/app.ts');
    const prefillComposer = vi.spyOn(SidebarProvider.prototype, 'prefillComposer');
    activate(context());

    await handlers.get('agi-workforce.mentionFileInChat')?.(uri);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('agi-workforce.sidebar.focus');
    expect(prefillComposer).toHaveBeenCalledWith('@src/app.ts#L5-L7 ', [
      {
        path: 'src/app.ts',
        range: { startLine: 4, startCharacter: 0, endLine: 6, endCharacter: 8 },
      },
    ]);
    expect(vi.mocked(vscode.commands.executeCommand).mock.calls.map(([id]) => id)).not.toEqual(
      expect.arrayContaining([
        'workbench.action.chat.open',
        'workbench.panel.chat.view.copilot.focus',
      ]),
    );
  });

  it('falls back when a fork exposes but rejects native participant registration', () => {
    Object.defineProperty(vscode.chat, 'createChatParticipant', {
      configurable: true,
      value: vi.fn(() => {
        throw new Error('unsupported contribution');
      }),
    });

    expect(registerChatParticipant(context())).toBeUndefined();
  });

  it('holds a fallback draft until the first-party webview reports ready', async () => {
    const extensionContext = context();
    const provider = new SidebarProvider(
      extensionContext.extensionUri,
      extensionContext.secrets,
      extensionContext,
    );
    const reference = {
      path: 'src/queued.ts',
      range: { startLine: 1, startCharacter: 0, endLine: 2, endCharacter: 4 },
    };
    let receiveMessage: ((message: unknown) => Promise<void>) | undefined;
    const postMessage = vi.fn().mockResolvedValue(true);
    const view = {
      webview: {
        options: {},
        html: '',
        cspSource: 'vscode-webview://mock',
        asWebviewUri: (uri: vscode.Uri) => uri,
        onDidReceiveMessage: vi.fn((listener: (message: unknown) => Promise<void>) => {
          receiveMessage = listener;
          return new vscode.Disposable(() => undefined);
        }),
        postMessage,
      },
      onDidDispose: vi.fn(() => new vscode.Disposable(() => undefined)),
      show: vi.fn(),
    } as unknown as vscode.WebviewView;

    provider.prefillComposer('@src/queued.ts#L2-L3 ', [reference]);
    expect(postMessage).not.toHaveBeenCalled();

    provider.resolveWebviewView(view, {} as vscode.WebviewViewResolveContext, {} as never);
    await receiveMessage?.({ type: 'ready' });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'composerDraft',
      payload: { text: '@src/queued.ts#L2-L3 ', references: [reference] },
    });
  });
});
