import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { setAccountMemoryStore, type AccountMemoryStore } from '../memory/accountMemoryStore';
import { setChatFocus } from '../features/sidebar-webview/chatFocus';
import { setupCommands, type CommandDeps } from '../core/commandSetup';
import { __resetSubsystemHealthForTests } from '../core/subsystemHealth';

type Handler = (...args: unknown[]) => unknown;

describe('open developer session command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSubsystemHealthForTests();
  });

  it('opens the live first-party chat and resumes the selected runtime thread', async () => {
    const handlers = new Map<string, Handler>();
    vi.mocked(vscode.commands.registerCommand).mockImplementation(((
      id: string,
      handler: Handler,
    ) => {
      handlers.set(id, handler);
      return new vscode.Disposable(() => undefined);
    }) as never);
    const sidebarProvider = {
      reveal: vi.fn(),
      resumeConversation: vi.fn().mockResolvedValue(true),
    };
    const unused = new Proxy({}, { get: () => vi.fn() });
    setupCommands(
      { subscriptions: [], secrets: {} } as unknown as vscode.ExtensionContext,
      {
        sidebarProvider,
        conversationTreeProvider: unused,
        localRuntimes: unused,
        contextPanelProvider: unused,
        memoryTreeProvider: unused,
        diffDecorationProvider: unused,
        diagnosticsProvider: unused,
      } as unknown as CommandDeps,
    );

    await handlers.get('agi-workforce.openConversation')?.('history-1');

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('agi-workforce.sidebar.focus');
    expect(sidebarProvider.reveal).toHaveBeenCalledOnce();
    expect(sidebarProvider.resumeConversation).toHaveBeenCalledWith('history-1');
    expect(sidebarProvider.resumeConversation.mock.invocationCallOrder[0]).toBeGreaterThan(
      sidebarProvider.reveal.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("opens the AGI chat, never the editor's built-in chat", async () => {
    const handlers = new Map<string, Handler>();
    vi.mocked(vscode.commands.registerCommand).mockImplementation(((
      id: string,
      handler: Handler,
    ) => {
      handlers.set(id, handler);
      return new vscode.Disposable(() => undefined);
    }) as never);
    const sidebarProvider = { reveal: vi.fn() };
    const unused = new Proxy({}, { get: () => vi.fn() });
    setupCommands(
      { subscriptions: [], secrets: {} } as unknown as vscode.ExtensionContext,
      {
        sidebarProvider,
        conversationTreeProvider: unused,
        localRuntimes: unused,
        contextPanelProvider: unused,
        memoryTreeProvider: unused,
        diffDecorationProvider: unused,
        diagnosticsProvider: unused,
        nativeChatAvailable: true,
      } as unknown as CommandDeps,
    );

    await handlers.get('agi-workforce.chat')?.();

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('agi-workforce.sidebar.focus');
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('workbench.action.chat.open');
    expect(sidebarProvider.reveal).toHaveBeenCalledOnce();
  });
});

describe('palette entries that a tree row usually fills in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSubsystemHealthForTests();
  });

  afterEach(() => {
    setAccountMemoryStore(undefined);
  });

  function register(deps: Record<string, unknown>): Map<string, Handler> {
    const handlers = new Map<string, Handler>();
    vi.mocked(vscode.commands.registerCommand).mockImplementation(((
      id: string,
      handler: Handler,
    ) => {
      handlers.set(id, handler);
      return new vscode.Disposable(() => undefined);
    }) as never);
    const unused = new Proxy({}, { get: () => vi.fn() });
    setupCommands(
      { subscriptions: [], secrets: {} } as unknown as vscode.ExtensionContext,
      {
        sidebarProvider: unused,
        conversationTreeProvider: unused,
        localRuntimes: unused,
        contextPanelProvider: unused,
        memoryTreeProvider: unused,
        diffDecorationProvider: unused,
        diagnosticsProvider: unused,
        ...deps,
      } as unknown as CommandDeps,
    );
    return handlers;
  }

  it('asks which session to open when run from the palette', async () => {
    const thread = { id: 'thread-7', title: 'Fix the parser', cwd: '/workspace' };
    const sidebarProvider = { reveal: vi.fn(), resumeConversation: vi.fn() };
    const handlers = register({
      sidebarProvider,
      conversationTreeProvider: { getThreads: vi.fn().mockResolvedValue([thread]) },
    });
    vi.mocked(vscode.window.showQuickPick).mockImplementationOnce(
      (async (items: readonly { thread: unknown }[]) => items[0]) as never,
    );

    await handlers.get('agi-workforce.openConversation')?.();

    expect(sidebarProvider.resumeConversation).toHaveBeenCalledWith('thread-7');
  });

  it('opens nothing when the session pick is dismissed', async () => {
    const sidebarProvider = { reveal: vi.fn(), resumeConversation: vi.fn() };
    const handlers = register({
      sidebarProvider,
      conversationTreeProvider: {
        getThreads: vi.fn().mockResolvedValue([{ id: 't', title: 'T', cwd: '/workspace' }]),
      },
    });

    await expect(handlers.get('agi-workforce.openConversation')?.()).resolves.toBeUndefined();
    expect(sidebarProvider.resumeConversation).not.toHaveBeenCalled();
  });

  it('asks which memory to edit or delete when run from the palette', async () => {
    const fact = { id: 'fact-1', text: 'Prefer tabs', createdAt: '2026-11-11T00:00:00.000Z' };
    const store = {
      cachedFacts: () => [fact],
      update: vi.fn().mockResolvedValue({ applied: true, refusals: [] }),
      remove: vi.fn().mockResolvedValue({ applied: true, refusals: [] }),
    };
    setAccountMemoryStore(store as unknown as AccountMemoryStore);
    const handlers = register({});
    const pickFirst = (async (items: readonly { fact: unknown }[]) => items[0]) as never;
    vi.mocked(vscode.window.showQuickPick).mockImplementation(pickFirst);
    vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce('Prefer spaces');
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce('Delete' as never);

    await handlers.get('agi-workforce.memory.edit')?.();
    await handlers.get('agi-workforce.memory.delete')?.();

    expect(store.update).toHaveBeenCalledWith('fact-1', 'Prefer spaces');
    expect(store.remove).toHaveBeenCalledWith('fact-1');
    vi.mocked(vscode.window.showQuickPick).mockReset();
  });

  it('says there is nothing to edit instead of failing when no memory is saved', async () => {
    setAccountMemoryStore({ cachedFacts: () => [] } as unknown as AccountMemoryStore);
    const handlers = register({});

    await expect(handlers.get('agi-workforce.memory.edit')?.()).resolves.toBeUndefined();
    await expect(handlers.get('agi-workforce.memory.delete')?.()).resolves.toBeUndefined();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('no memories are saved'),
    );
  });

  it('keeps provider sign-in, which needs a provider, out of the palette', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
    ) as { contributes: { menus: { commandPalette: Array<{ command: string; when?: string }> } } };
    expect(pkg.contributes.menus.commandPalette).toContainEqual({
      command: 'agi-workforce.signInProvider',
      when: 'false',
    });
  });

  it('opens a fork in the editor chat that asked for it, not in the sidebar', async () => {
    const panel = {
      resetConversation: vi.fn(),
      resumeConversation: vi.fn().mockResolvedValue(true),
    };
    const sidebarProvider = { reveal: vi.fn(), resumeConversation: vi.fn() };
    const handlers = register({
      sidebarProvider,
      conversationTreeProvider: { forkThread: vi.fn().mockResolvedValue('fork-1') },
    });
    vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce('Try another approach');
    setChatFocus(panel, true);
    try {
      await handlers.get('agi-workforce.forkConversation')?.({
        thread: { id: 'thread-1', title: 'Parser', cwd: '/workspace' },
      });
    } finally {
      setChatFocus(panel, false);
    }

    expect(panel.resumeConversation).toHaveBeenCalledWith('fork-1');
    expect(sidebarProvider.resumeConversation).not.toHaveBeenCalled();
  });
});
