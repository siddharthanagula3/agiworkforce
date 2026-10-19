import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { activate } from '../extension';
import { __resetSubsystemHealthForTests } from '../core/subsystemHealth';
import { ContextItem, ContextPanelProvider } from '../features/trees';

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
    Object.defineProperty(vscode.window, 'activeTextEditor', {
      value: undefined,
      configurable: true,
      writable: true,
    });

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

  it('mentions a file in the AGI chat, never the editor built-in chat', async () => {
    const handler = handlers.get('agi-workforce.mentionFileInChat')!;
    await handler(vscode.Uri.file('/mock/workspace/src/foo.ts'));
    await handler(new ContextItem('/mock/workspace/src/context-item.ts', true, 128, 'typescript'));

    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'workbench.action.chat.open',
      expect.anything(),
    );
  });

  it('removes the ContextItem file rather than treating the tree item as a Uri', async () => {
    const removeFile = vi.spyOn(ContextPanelProvider.prototype, 'removeFile');
    const handler = handlers.get('agi-workforce.removeFromContext')!;
    const item = new ContextItem('/mock/workspace/src/pinned.ts', true, 64, 'typescript');

    await handler(item);

    expect(removeFile).toHaveBeenCalledOnce();
    expect(removeFile.mock.calls[0]?.[0].fsPath).toBe('/mock/workspace/src/pinned.ts');
  });

  it('shows warning and does not call executeCommand when no uri and no active editor', async () => {
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
