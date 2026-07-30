/**
 * chatEditorPanel.test.ts — C13: chat in main editor (WebviewPanel)
 *
 * Verifies that `agi-workforce.openChatInEditor` is registered, creates an
 * independent WebviewPanel per invocation, and keeps the auxiliary agent-mode
 * command focused on the most recent live tab.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { activate } from '../extension';
import { __resetSubsystemHealthForTests } from '../core/subsystemHealth';
import { ChatEditorPanel } from '../providers/chatEditorPanel';
import { DiffDecorationProvider } from '../providers/diffDecorationProvider';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockContext(): vscode.ExtensionContext {
  return {
    subscriptions: [],
    secrets: {
      get: vi.fn().mockResolvedValue(undefined),
      store: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      onDidChange: vi.fn(),
    },
    extensionUri: vscode.Uri.file('/mock/extension'),
    extensionPath: '/mock/extension',
    globalState: {
      get: vi.fn().mockReturnValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockReturnValue([]),
      setKeysForSync: vi.fn(),
    },
    workspaceState: {
      get: vi.fn().mockReturnValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockReturnValue([]),
    },
    asAbsolutePath: vi.fn((p: string) => `/mock/extension/${p}`),
    storagePath: '/mock/storage',
    storageUri: vscode.Uri.file('/mock/storage'),
    globalStoragePath: '/mock/global-storage',
    globalStorageUri: vscode.Uri.file('/mock/global-storage'),
    logPath: '/mock/log',
    logUri: vscode.Uri.file('/mock/log'),
    extensionMode: 1,
    environmentVariableCollection: {} as never,
    extension: { packageJSON: { version: '0.3.0' } } as never,
    languageModelAccessInformation: {} as never,
  } as unknown as vscode.ExtensionContext;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('agi-workforce.openChatInEditor', () => {
  interface PanelHarness {
    panel: vscode.WebviewPanel;
    reveal: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
    receiveMessage?: (message: unknown) => Promise<void>;
    dispose?: () => void;
    changeViewState?: (active: boolean) => void;
  }

  let handlers: Map<string, (...args: unknown[]) => unknown>;
  let panelCreations: Array<{ viewType: string; title: string }>;
  let panels: PanelHarness[];
  let originalRegister: typeof vscode.commands.registerCommand;
  let originalCreatePanel: typeof vscode.window.createWebviewPanel;

  beforeEach(() => {
    handlers = new Map();
    panelCreations = [];
    panels = [];

    originalRegister = vscode.commands.registerCommand;
    originalCreatePanel = vscode.window.createWebviewPanel;

    (
      vscode.commands as { registerCommand: typeof vscode.commands.registerCommand }
    ).registerCommand = vi.fn((id: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(id, handler);
      return { dispose: () => undefined } as vscode.Disposable;
    });

    (
      vscode.window as { createWebviewPanel: typeof vscode.window.createWebviewPanel }
    ).createWebviewPanel = vi.fn((viewType: string, title: string) => {
      panelCreations.push({ viewType, title });
      const harness: PanelHarness = {
        panel: undefined as unknown as vscode.WebviewPanel,
        reveal: vi.fn(),
        postMessage: vi.fn().mockResolvedValue(true),
      };
      const panel = {
        active: true,
        webview: {
          options: {},
          html: '',
          postMessage: harness.postMessage,
          onDidReceiveMessage: vi.fn((handler: (message: unknown) => Promise<void>) => {
            harness.receiveMessage = handler;
            return { dispose: () => undefined };
          }),
          cspSource: 'vscode-resource:',
          asWebviewUri: vi.fn((uri: vscode.Uri) => uri),
        },
        reveal: harness.reveal,
        onDidChangeViewState: vi.fn(
          (handler: (event: vscode.WebviewPanelOnDidChangeViewStateEvent) => void) => {
            harness.changeViewState = (active: boolean) => {
              panel.active = active;
              handler({ webviewPanel: panel } as vscode.WebviewPanelOnDidChangeViewStateEvent);
            };
            return { dispose: () => undefined };
          },
        ),
        onDidDispose: vi.fn((handler: () => void) => {
          harness.dispose = handler;
          return { dispose: () => undefined };
        }),
        dispose: vi.fn(),
        viewColumn: vscode.ViewColumn.One,
      } as unknown as vscode.WebviewPanel & { active: boolean };
      harness.panel = panel;
      panels.push(harness);
      return panel;
    });

    activate(makeMockContext());
  });

  afterEach(() => {
    (
      vscode.commands as { registerCommand: typeof vscode.commands.registerCommand }
    ).registerCommand = originalRegister;
    (
      vscode.window as { createWebviewPanel: typeof vscode.window.createWebviewPanel }
    ).createWebviewPanel = originalCreatePanel;
    vi.restoreAllMocks();
    __resetSubsystemHealthForTests();
    ChatEditorPanel.__resetForTests();
  });

  it('registers agi-workforce.openChatInEditor command', () => {
    expect(handlers.has('agi-workforce.openChatInEditor')).toBe(true);
  });

  it('creates a WebviewPanel with the correct viewType and title on first call', () => {
    const handler = handlers.get('agi-workforce.openChatInEditor')!;
    handler();

    const chatPanels = panelCreations.filter((p) => p.viewType === 'agi-workforce.chatPanel');
    expect(chatPanels).toHaveLength(1);
    expect(chatPanels[0]!.title).toBe('AGI Chat');
  });

  it('creates independent, distinguishable tabs on repeated calls', () => {
    const handler = handlers.get('agi-workforce.openChatInEditor')!;
    handler();
    handler();

    expect(panels).toHaveLength(2);
    expect(panelCreations.filter((panel) => panel.viewType === ChatEditorPanel.viewType)).toEqual([
      { viewType: ChatEditorPanel.viewType, title: 'AGI Chat' },
      { viewType: ChatEditorPanel.viewType, title: 'AGI Chat 2' },
    ]);
    expect(panels[0]!.reveal).not.toHaveBeenCalled();
    expect(panels[1]!.reveal).not.toHaveBeenCalled();
  });

  it('keeps agentMode focused on the most recently active live tab', () => {
    const open = handlers.get('agi-workforce.openChatInEditor')!;
    const focus = handlers.get('agi-workforce.agentMode')!;
    open();
    open();
    panels[0]!.changeViewState?.(true);

    focus();

    expect(panels).toHaveLength(2);
    expect(panels[0]!.reveal).toHaveBeenCalledOnce();
    expect(panels[1]!.reveal).not.toHaveBeenCalled();
  });

  it('removes only the disposed tab from most-recent routing', () => {
    const open = handlers.get('agi-workforce.openChatInEditor')!;
    const focus = handlers.get('agi-workforce.agentMode')!;
    open();
    open();
    panels[1]!.dispose?.();

    focus();

    expect(panels).toHaveLength(2);
    expect(panels[0]!.reveal).toHaveBeenCalledOnce();
    expect(panels[1]!.reveal).not.toHaveBeenCalled();
  });

  it('restarts tab numbering after every editor chat is closed', () => {
    const open = handlers.get('agi-workforce.openChatInEditor')!;
    open();
    open();
    panels[0]!.dispose?.();
    panels[1]!.dispose?.();

    open();

    expect(panelCreations.at(-1)).toEqual({
      viewType: ChatEditorPanel.viewType,
      title: 'AGI Chat',
    });
  });

  it('keeps conversation events isolated to the originating tab', async () => {
    const open = handlers.get('agi-workforce.openChatInEditor')!;
    open();
    open();

    await panels[0]!.receiveMessage?.({ type: 'newChat' });

    expect(panels[0]!.postMessage).toHaveBeenCalledWith({ type: 'conversationCleared' });
    expect(panels[1]!.postMessage).not.toHaveBeenCalledWith({ type: 'conversationCleared' });
  });

  it('does not interfere with sidebar webview registration', () => {
    // Both sidebar and chat-editor panel commands should be registered
    expect(handlers.has('agi-workforce.openChatInEditor')).toBe(true);
    expect(handlers.has('agi-workforce.chat')).toBe(true);
  });

  it('routes Apply from the editor panel through the live diff provider', async () => {
    const showDiff = vi.spyOn(DiffDecorationProvider.prototype, 'showDiff').mockReturnValue({
      id: 'diff-editor-1',
    } as ReturnType<DiffDecorationProvider['showDiff']>);
    const selection = new vscode.Selection(0, 0, 0, 1);
    vscode.window.activeTextEditor = {
      selection,
      document: {
        uri: vscode.Uri.file('/mock/workspace/src/app.ts'),
        getText: vi.fn().mockReturnValue('x'),
      },
    } as unknown as vscode.TextEditor;

    handlers.get('agi-workforce.openChatInEditor')!();
    expect(panels[0]!.receiveMessage).toBeDefined();
    await panels[0]!.receiveMessage!({
      type: 'proposeDiff',
      payload: { code: 'const x = 1;', language: 'typescript' },
    });

    expect(showDiff).toHaveBeenCalledOnce();
    expect(panels[0]!.postMessage).toHaveBeenCalledWith({
      type: 'diffProposed',
      payload: { sessionId: 'diff-editor-1', filePath: 'src/app.ts' },
    });
  });
});
