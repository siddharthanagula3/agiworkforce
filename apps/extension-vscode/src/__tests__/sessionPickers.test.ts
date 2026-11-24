import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { ThreadSummary } from '@agiworkforce/types';
import type {
  ConversationTreeProvider,
  SessionListingFailure,
} from '../features/trees/conversationTreeProvider';
import { showArchivedSessions } from '../features/trees/sessionPickers';
import { createdQuickPicks } from './__mocks__/vscode';

function archived(id: string): ThreadSummary {
  return {
    id,
    title: id,
    trustMode: 'local',
    status: 'archived',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    createdBy: 'vscode',
    cwd: '/workspace',
  };
}

async function show(
  restoreThread: (id: string) => Promise<boolean>,
  failures: SessionListingFailure[] = [],
) {
  const provider = {
    getArchivedThreads: async () => ({
      items: ['Alpha', 'Beta', 'Gamma'].map(archived),
      failures,
    }),
    restoreThread,
  } as unknown as ConversationTreeProvider;
  await showArchivedSessions(provider);
  return createdQuickPicks.at(-1)!;
}

describe('archived session recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createdQuickPicks.length = 0;
  });

  it('restores the selected sessions and keeps a failed selection available for retry', async () => {
    const restore = vi.fn(async (id: string) => {
      if (id === 'Beta') throw new Error('Workspace temporarily unavailable.');
      return true;
    });
    const pick = await show(restore);
    pick.selectedItems = pick.items.slice(0, 2);
    pick.fire('accept');
    pick.fire('accept');
    await vi.waitFor(() =>
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'Restored 1 of 2 archived sessions. Workspace temporarily unavailable.',
      ),
    );
    expect(restore.mock.calls).toEqual([['Alpha'], ['Beta']]);
    expect(pick.items).toEqual([
      expect.objectContaining({ label: 'Beta' }),
      expect.objectContaining({ label: 'Gamma' }),
    ]);
    expect(pick.selectedItems).toEqual([expect.objectContaining({ label: 'Beta' })]);
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    expect(pick.shown).toBe(true);
  });

  it('restores every listed item from the header without opening a conversation', async () => {
    const restore = vi.fn(async () => true);
    const pick = await show(restore);
    pick.fire('button', pick.buttons[0]);
    await vi.waitFor(() =>
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Restored 3 of 3 archived sessions.',
      ),
    );
    expect(restore.mock.calls).toEqual([['Alpha'], ['Beta'], ['Gamma']]);
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    expect(pick.disposed).toBe(true);
  });

  it('offers individual restore without offering Restore All on an incomplete archive', async () => {
    const restore = vi.fn(async () => true);
    const pick = await show(restore, [
      { folderName: 'Project', reason: 'Read interrupted.', partial: true },
    ]);

    expect(pick.buttons).toEqual([]);
    expect(pick.items).toHaveLength(3);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Read interrupted.'),
    );
    pick.fire('itemButton', { item: pick.items[0], button: pick.items[0]?.buttons[0] });
    await vi.waitFor(() => expect(restore).toHaveBeenCalledExactlyOnceWith('Alpha'));
  });
});
