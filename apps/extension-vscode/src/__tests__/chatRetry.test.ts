import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  RETRY_LAST_MESSAGE_COMMAND,
  registerChatRetryCommand,
  resolveRetryTarget,
  type ChatRetrySource,
  type ChatTurn,
} from '../features/chat/retry';
import { ChatStateManager } from '../features/sidebar-webview/ChatStateManager';

function transcript(...turns: ChatTurn[]): ChatTurn[] {
  return turns;
}

describe('retry the last message', () => {
  it('resends the last thing the person asked, not the assistant turn after it', () => {
    const decision = resolveRetryTarget({
      transcript: transcript(
        { role: 'user', text: 'first' },
        { role: 'user', text: 'rename the module', references: [] },
        { role: 'assistant', text: 'partial answer' },
      ),
      streaming: false,
    });

    expect(decision).toEqual({ ok: true, target: { text: 'rename the module', references: [] } });
  });

  it('refuses while an answer is still streaming, and says what to do', () => {
    const decision = resolveRetryTarget({
      transcript: transcript({ role: 'user', text: 'go' }),
      streaming: true,
    });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.refusal).toBe('streaming');
    expect(decision.ok === false && decision.message).toContain('stop it');
  });

  it('refuses an empty transcript and one whose only user turn is blank', () => {
    expect(resolveRetryTarget({ transcript: [], streaming: false }).ok).toBe(false);
    expect(
      resolveRetryTarget({
        transcript: transcript({ role: 'user', text: '   ' }),
        streaming: false,
      }).ok,
    ).toBe(false);
  });

  it('registers a command that resends through the chat source', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    vi.spyOn(vscode.commands, 'registerCommand').mockImplementation(((
      id: string,
      handler: (...args: unknown[]) => unknown,
    ) => {
      handlers.set(id, handler);
      return { dispose: vi.fn() };
    }) as typeof vscode.commands.registerCommand);
    const info = vi.spyOn(vscode.window, 'showInformationMessage').mockResolvedValue(undefined);

    const resend = vi.fn();
    const source: ChatRetrySource = {
      transcript: () => transcript({ role: 'user', text: 'rename the module' }),
      isStreaming: () => false,
      resend,
    };
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;

    registerChatRetryCommand(context, source);
    expect(handlers.has(RETRY_LAST_MESSAGE_COMMAND)).toBe(true);
    expect(context.subscriptions).toHaveLength(1);

    await handlers.get(RETRY_LAST_MESSAGE_COMMAND)?.();
    expect(resend).toHaveBeenCalledWith('rename the module', []);
    expect(info).not.toHaveBeenCalled();
  });

  it('tells the person why instead of resending when there is nothing to retry', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    vi.spyOn(vscode.commands, 'registerCommand').mockImplementation(((
      id: string,
      handler: (...args: unknown[]) => unknown,
    ) => {
      handlers.set(id, handler);
      return { dispose: vi.fn() };
    }) as typeof vscode.commands.registerCommand);
    const info = vi.spyOn(vscode.window, 'showInformationMessage').mockResolvedValue(undefined);

    const resend = vi.fn();
    registerChatRetryCommand({ subscriptions: [] } as unknown as vscode.ExtensionContext, {
      transcript: () => [],
      isStreaming: () => false,
      resend,
    });

    await handlers.get(RETRY_LAST_MESSAGE_COMMAND)?.();
    expect(resend).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('There is no message to retry yet.');
  });
});

describe('the sidebar chat is the retry source', () => {
  it('offers the last turn the person sent, even when that send never started', async () => {
    vscode.workspace.isTrusted = true;
    vscode.workspace.workspaceFolders = undefined;
    const context = new vscode.ExtensionContext();
    const manager = new ChatStateManager(context.secrets, context, () => undefined);

    await manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'rename the module' },
    });

    expect(manager.turnInFlight()).toBe(false);
    expect(
      resolveRetryTarget({
        transcript: manager.chatTranscript(),
        streaming: manager.turnInFlight(),
      }),
    ).toEqual({ ok: true, target: { text: 'rename the module', references: [] } });
  });

  it('has nothing to retry in a conversation that was just reset', async () => {
    vscode.workspace.isTrusted = true;
    const context = new vscode.ExtensionContext();
    const manager = new ChatStateManager(context.secrets, context, () => undefined);

    await manager.handleMessage({ type: 'sendMessage', payload: { text: 'rename the module' } });
    manager.resetConversation();

    expect(manager.chatTranscript()).toEqual([]);
  });
});
