/**
 * chatEditorPanel.test.ts — C13: chat in main editor (WebviewPanel)
 *
 * Verifies that `agi-workforce.openChatInEditor` is registered, creates a
 * WebviewPanel, and that repeated calls reveal the existing panel rather than
 * creating a new one (singleton pattern).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { activate } from '../extension';
import { __resetSubsystemHealthForTests } from '../services/subsystemHealth';
import { ChatEditorPanel } from '../providers/chatEditorPanel';

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
  let handlers: Map<string, (...args: unknown[]) => unknown>;
  let panelCreations: Array<{ viewType: string; title: string }>;
  let originalRegister: typeof vscode.commands.registerCommand;
  let originalCreatePanel: typeof vscode.window.createWebviewPanel;

  beforeEach(() => {
    handlers = new Map();
    panelCreations = [];

    originalRegister = vscode.commands.registerCommand;
    originalCreatePanel = vscode.window.createWebviewPanel;

    (
      vscode.commands as { registerCommand: typeof vscode.commands.registerCommand }
    ).registerCommand = vi.fn((id: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(id, handler);
      return { dispose: () => undefined } as vscode.Disposable;
    });

    const mockPanel = {
      webview: {
        options: {},
        html: '',
        postMessage: vi.fn().mockResolvedValue(true),
        onDidReceiveMessage: vi.fn().mockReturnValue({ dispose: () => undefined }),
        cspSource: 'vscode-resource:',
      },
      reveal: vi.fn(),
      onDidDispose: vi.fn().mockReturnValue({ dispose: () => undefined }),
      dispose: vi.fn(),
      viewColumn: vscode.ViewColumn.One,
    } as unknown as vscode.WebviewPanel;

    (
      vscode.window as { createWebviewPanel: typeof vscode.window.createWebviewPanel }
    ).createWebviewPanel = vi.fn((viewType: string, title: string) => {
      panelCreations.push({ viewType, title });
      return mockPanel;
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

  it('calls reveal on the existing panel instead of creating a second one', () => {
    const mockReveal = vi.fn();
    const mockPanel = {
      webview: {
        options: {},
        html: '',
        postMessage: vi.fn().mockResolvedValue(true),
        onDidReceiveMessage: vi.fn().mockReturnValue({ dispose: () => undefined }),
        cspSource: 'vscode-resource:',
      },
      reveal: mockReveal,
      onDidDispose: vi.fn().mockReturnValue({ dispose: () => undefined }),
      dispose: vi.fn(),
      viewColumn: vscode.ViewColumn.One,
    } as unknown as vscode.WebviewPanel;

    let callCount = 0;
    (
      vscode.window as { createWebviewPanel: typeof vscode.window.createWebviewPanel }
    ).createWebviewPanel = vi.fn(() => {
      callCount++;
      return mockPanel;
    });

    // Reset singleton so this test gets a clean slate independent of beforeEach
    ChatEditorPanel.__resetForTests();

    const handler = handlers.get('agi-workforce.openChatInEditor')!;
    handler(); // first call — creates panel
    handler(); // second call — should reveal, not create

    expect(callCount).toBe(1);
    expect(mockReveal).toHaveBeenCalledTimes(1);
  });

  it('does not interfere with sidebar webview registration', () => {
    // Both sidebar and chat-editor panel commands should be registered
    expect(handlers.has('agi-workforce.openChatInEditor')).toBe(true);
    expect(handlers.has('agi-workforce.chat')).toBe(true);
  });
});
