import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetStartupWorkForTests, markInUse } from '../core/startupWork';
import { registerSessionAutoArchive } from '../features/trees/sessionAutoArchive';
import type { ConversationTreeProvider } from '../features/trees/conversationTreeProvider';

describe('session auto-archive schedule', () => {
  let subscription: vscode.Disposable | undefined;
  beforeEach(() => {
    __resetStartupWorkForTests();
    vi.useFakeTimers();
    vscode.workspace.isTrusted = true;
  });
  afterEach(() => {
    subscription?.dispose();
    subscription = undefined;
    __resetStartupWorkForTests();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function configure(globalValue: number | undefined, workspaceValue?: number) {
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      inspect: () => ({ defaultValue: 0, globalValue, workspaceValue }),
    } as unknown as vscode.WorkspaceConfiguration);
  }

  it('ignores repository configuration that tries to enable the schedule', async () => {
    configure(undefined, 7);
    const storage = new vscode.ExtensionContext().workspaceState;
    const archiveInactiveSessions = vi.fn().mockResolvedValue(0);
    subscription = registerSessionAutoArchive(
      storage,
      { archiveInactiveSessions } as unknown as ConversationTreeProvider,
      () => false,
    );
    markInUse('chat-view');
    await vi.advanceTimersByTimeAsync(3_000);
    expect(archiveInactiveSessions).not.toHaveBeenCalled();
  });

  it('checks for user opt-in and passes live protections to the runtime sweep', async () => {
    configure(7);
    vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));
    const storage = new vscode.ExtensionContext().workspaceState;
    await storage.update('agiWorkforce.unreadSessions', ['unread']);
    await storage.update('agiWorkforce.sessionGroups', {
      groups: [{ id: 'home', name: 'Keep' }],
      assignments: [{ sessionId: 'grouped', groupId: 'home' }],
    });
    const archiveInactiveSessions = vi.fn().mockResolvedValue(0);
    subscription = registerSessionAutoArchive(
      storage,
      { archiveInactiveSessions } as unknown as ConversationTreeProvider,
      (id) => id === 'opened',
    );
    await vi.advanceTimersByTimeAsync(3_000);
    expect(archiveInactiveSessions).not.toHaveBeenCalled();
    markInUse('chat-view');
    await vi.advanceTimersByTimeAsync(2_000);
    const [cutoff, canContinue, protectedSession] = archiveInactiveSessions.mock.calls[0]!;
    expect(cutoff.toISOString()).toBe('2026-11-16T12:00:05.000Z');
    expect(canContinue()).toBe(true);
    expect(['opened', 'unread', 'grouped', 'old'].map(protectedSession)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    vscode.workspace.isTrusted = false;
    expect(canContinue()).toBe(false);
  });
});
