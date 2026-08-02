import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
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
        nativeChatAvailable: false,
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
});
