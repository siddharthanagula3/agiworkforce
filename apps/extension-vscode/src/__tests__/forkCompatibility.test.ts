import { readFileSync } from 'node:fs';
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
    await receiveMessage?.({ type: 'ready', origin: 'agi-workforce-sidebar', epoch: 0 });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'composerDraft',
      payload: { text: '@src/queued.ts#L2-L3 ', references: [reference] },
    });
  });

  it('opens on a view that has neither visibility events nor a badge', () => {
    // The attention badge asks the host for two members a narrower fork need
    // not implement. Losing the badge there is acceptable; failing to open the
    // panel is not.
    const extensionContext = context();
    const provider = new SidebarProvider(
      extensionContext.extensionUri,
      extensionContext.secrets,
      extensionContext,
    );
    const view = {
      webview: {
        options: {},
        html: '',
        cspSource: 'vscode-webview://mock',
        asWebviewUri: (uri: vscode.Uri) => uri,
        onDidReceiveMessage: vi.fn(() => new vscode.Disposable(() => undefined)),
        postMessage: vi.fn().mockResolvedValue(true),
      },
      onDidDispose: vi.fn(() => new vscode.Disposable(() => undefined)),
    } as unknown as vscode.WebviewView;

    expect(() =>
      provider.resolveWebviewView(view, {} as vscode.WebviewViewResolveContext, {} as never),
    ).not.toThrow();
    expect((view as { badge?: unknown }).badge).toBeUndefined();
  });
});

/**
 * The forks people actually run this in. Each entry states the API surface
 * that fork gives an extension, so a regression shows up as the named fork
 * breaking rather than as a generic "Code-OSS" test going red.
 */
const FORKS = [
  {
    // Cursor ships the chat contribution point but refuses a third-party
    // participant, so registration throws rather than being absent.
    name: 'Cursor',
    appName: 'Cursor',
    chat: () => ({
      createChatParticipant: vi.fn(() => {
        throw new Error('Chat participants are reserved for the host in this product');
      }),
    }),
  },
  {
    name: 'Windsurf',
    appName: 'Windsurf',
    chat: () => ({ createChatParticipant: undefined }),
  },
  {
    // VSCodium is Code-OSS: the Chat API ships with the proprietary build only.
    name: 'VSCodium',
    appName: 'VSCodium',
    chat: () => undefined,
  },
] as const;

// The namespace itself, not one of its members: a fork that ships no Chat API
// has no `vscode.chat` at all, and the module binding cannot be assigned.
function defineChatNamespace(value: unknown): void {
  Object.defineProperty(vscode as unknown as Record<string, unknown>, 'chat', {
    configurable: true,
    value,
  });
}

const PROPRIETARY_COMMANDS = [
  'workbench.action.chat.open',
  'workbench.panel.chat.view.copilot.focus',
  'github.copilot.chat.explain',
  'cursor.chat.open',
  'windsurf.cascade.open',
];

describe.each(FORKS)('$name', (fork) => {
  let handlers: Map<string, (...args: unknown[]) => unknown>;
  let originalChat: typeof vscode.chat;
  let originalAppName: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = new Map();
    originalChat = vscode.chat;
    originalAppName = (vscode.env as Record<string, unknown>)['appName'];
    defineChatNamespace(fork.chat());
    Object.defineProperty(vscode.env, 'appName', { configurable: true, value: fork.appName });
    vi.mocked(vscode.commands.registerCommand).mockImplementation((id, handler) => {
      handlers.set(id, handler);
      return new vscode.Disposable(() => undefined);
    });
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file('/workspace') },
    ];
  });

  afterEach(() => {
    defineChatNamespace(originalChat);
    Object.defineProperty(vscode.env, 'appName', {
      configurable: true,
      value: originalAppName,
    });
    __resetSubsystemHealthForTests();
    vi.restoreAllMocks();
  });

  it(`activates on ${fork.name} and keeps Chat on the first-party sidebar`, async () => {
    expect(() => activate(context())).not.toThrow();
    expect(registerChatParticipant(context())).toBeUndefined();

    await handlers.get('agi-workforce.chat')?.();

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('agi-workforce.sidebar.focus');
    const invoked = vi.mocked(vscode.commands.executeCommand).mock.calls.map(([id]) => id);
    for (const proprietary of PROPRIETARY_COMMANDS) {
      expect(invoked).not.toContain(proprietary);
    }
  });

  it(`registers its own commands on ${fork.name} rather than relying on the Chat contribution`, () => {
    activate(context());

    expect(handlers.has('agi-workforce.chat')).toBe(true);
    expect(handlers.has('agi-workforce.pullCloudTaskIntoWorkspace')).toBe(true);
  });
});

describe('the manifest never makes a fork depend on the Chat API', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as {
    activationEvents: string[];
    contributes: { commands: Array<{ command: string }>; chatParticipants: unknown };
  };

  it('activates on startup, so a host that ignores chatParticipants still loads it', () => {
    expect(manifest.activationEvents).toContain('onStartupFinished');
  });

  it('offers every Chat entry point as a plain command too', () => {
    const commands = manifest.contributes.commands.map((entry) => entry.command);
    expect(commands).toContain('agi-workforce.chat');
    expect(commands).toContain('agi-workforce.pullCloudTaskIntoWorkspace');
  });
});
