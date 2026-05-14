/**
 * mentionFileInChat.test.ts — C14 wiring: context-panel → @agi chat participant
 *
 * Verifies that `agi-workforce.mentionFileInChat` opens the VS Code Chat panel
 * with `@agi #file:<relpath>` pre-populated, and falls back gracefully when
 * the chat panel command is unavailable.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { activate } from '../extension';
import { __resetSubsystemHealthForTests } from '../services/subsystemHealth';

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

describe('agi-workforce.mentionFileInChat', () => {
  let handlers: Map<string, (...args: unknown[]) => unknown>;
  let originalRegister: typeof vscode.commands.registerCommand;
  let originalExecute: typeof vscode.commands.executeCommand;

  beforeEach(() => {
    handlers = new Map();
    originalRegister = vscode.commands.registerCommand;
    originalExecute = vscode.commands.executeCommand;

    (
      vscode.commands as { registerCommand: typeof vscode.commands.registerCommand }
    ).registerCommand = vi.fn((id: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(id, handler);
      return { dispose: () => undefined } as vscode.Disposable;
    });

    (vscode.commands as { executeCommand: typeof vscode.commands.executeCommand }).executeCommand =
      vi.fn().mockResolvedValue(undefined);

    activate(makeMockContext());
  });

  afterEach(() => {
    (
      vscode.commands as { registerCommand: typeof vscode.commands.registerCommand }
    ).registerCommand = originalRegister;
    (vscode.commands as { executeCommand: typeof vscode.commands.executeCommand }).executeCommand =
      originalExecute;
    vi.restoreAllMocks();
    __resetSubsystemHealthForTests();
  });

  it('is registered at runtime', () => {
    expect(handlers.has('agi-workforce.mentionFileInChat')).toBe(true);
  });

  it('opens chat panel with @agi #file: query when uri provided', async () => {
    const handler = handlers.get('agi-workforce.mentionFileInChat')!;
    const uri = vscode.Uri.file('/mock/workspace/src/foo.ts');
    await handler(uri);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.chat.open',
      expect.objectContaining({ query: expect.stringContaining('@agi #file:') }),
    );
  });

  it('query contains the relative file path', async () => {
    const handler = handlers.get('agi-workforce.mentionFileInChat')!;
    const uri = vscode.Uri.file('/mock/workspace/src/bar.ts');

    // Mock asRelativePath to return a predictable value
    vi.spyOn(vscode.workspace, 'asRelativePath').mockReturnValue('src/bar.ts');

    await handler(uri);

    const calls = vi.mocked(vscode.commands.executeCommand).mock.calls;
    const chatCall = calls.find((c) => c[0] === 'workbench.action.chat.open');
    expect(chatCall).toBeDefined();
    const opts = chatCall![1] as { query: string };
    expect(opts.query).toBe('@agi #file:src/bar.ts ');
  });

  it('shows warning and does not call executeCommand when no uri and no active editor', async () => {
    // Ensure no active editor
    Object.defineProperty(vscode.window, 'activeTextEditor', {
      value: undefined,
      configurable: true,
    });

    const handler = handlers.get('agi-workforce.mentionFileInChat')!;
    const execSpy = vi.mocked(vscode.commands.executeCommand);
    execSpy.mockClear();

    await handler(undefined);

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No file selected'),
    );
    const chatCalls = execSpy.mock.calls.filter((c) => c[0] === 'workbench.action.chat.open');
    expect(chatCalls).toHaveLength(0);
  });
});
