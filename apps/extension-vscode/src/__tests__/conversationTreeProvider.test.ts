import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { ThreadSummary } from '@agiworkforce/types';
import {
  ConversationTreeItem,
  ConversationTreeProvider,
  isSameWorkspacePath,
} from '../features/trees/conversationTreeProvider';
import type { LocalRuntimeClient } from '../integrations/localRuntimeClient';
import type { LocalRuntimePool } from '../integrations/localRuntimePool';

function thread(id: string, updatedAt: string, cwd: string): ThreadSummary {
  return {
    id,
    title: `Session ${id}`,
    model: 'model-1',
    cwd,
    provider: 'anthropic',
    trustMode: 'byok',
    createdAt: updatedAt,
    updatedAt,
    createdBy: 'vscode',
    status: 'idle',
  };
}

describe('ConversationTreeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.workspace.workspaceFolders = [
      { name: 'a', index: 0, uri: vscode.Uri.file('/workspace/a') },
      { name: 'b', index: 1, uri: vscode.Uri.file('/workspace/b') },
    ];
  });

  it('renders runtime-owned thread metadata and the open-session command', () => {
    const summary = thread('one', new Date().toISOString(), '/workspace/a');
    const item = new ConversationTreeItem(summary);

    expect(item.label).toBe('Session one');
    expect(item.tooltip).toBe('model-1 · /workspace/a');
    expect(item.contextValue).toBe('conversation');
    expect(item.command).toEqual(
      expect.objectContaining({
        command: 'agi-workforce.openConversation',
        arguments: ['one'],
      }),
    );
  });

  it('lists every workspace, sorts newest first, and routes reads to the owning runtime', async () => {
    const a = {
      listThreads: vi.fn().mockResolvedValue({
        threads: [thread('old', '2026-07-13T00:00:00Z', '/workspace/a')],
      }),
      readThread: vi.fn().mockResolvedValue({
        thread: thread('old', '2026-07-13T00:00:00Z', '/workspace/a'),
        messages: [],
        transcriptTruncated: false,
      }),
    };
    const b = {
      listThreads: vi.fn().mockResolvedValue({
        threads: [thread('new', '2026-07-14T00:00:00Z', '/workspace/b')],
      }),
      readThread: vi.fn().mockResolvedValue({
        thread: thread('new', '2026-07-14T00:00:00Z', '/workspace/b'),
        messages: [],
        transcriptTruncated: false,
      }),
    };
    const pool = {
      forWorkspace: vi.fn(
        (cwd: string) => (cwd.endsWith('/a') ? a : b) as unknown as LocalRuntimeClient,
      ),
    } as unknown as LocalRuntimePool;
    const provider = new ConversationTreeProvider(pool);

    expect((await provider.getThreads()).map((value) => value.id)).toEqual(['new', 'old']);
    await provider.readThread('old');

    expect(a.readThread).toHaveBeenCalledWith('old');
    expect(b.readThread).not.toHaveBeenCalled();
  });

  it('archives through the owning runtime and refreshes the tree', async () => {
    const runtime = {
      listThreads: vi.fn().mockResolvedValue({
        threads: [thread('one', '2026-07-14T00:00:00Z', '/workspace/a')],
      }),
      archiveThread: vi.fn().mockResolvedValue(undefined),
    };
    const pool = {
      forWorkspace: vi.fn(() => runtime as unknown as LocalRuntimeClient),
    } as unknown as LocalRuntimePool;
    const provider = new ConversationTreeProvider(pool);
    const changed = vi.fn();
    provider.onDidChangeTreeData(changed);
    await provider.getThreads();

    await expect(provider.archiveThread('one')).resolves.toBe(true);
    expect(runtime.archiveThread).toHaveBeenCalledWith('one');
    expect(changed).toHaveBeenCalledOnce();
  });

  it('does not retain routing entries for threads removed from runtime history', async () => {
    const runtime = {
      listThreads: vi
        .fn()
        .mockResolvedValueOnce({
          threads: [thread('removed', '2026-07-14T00:00:00Z', '/workspace/a')],
        })
        .mockResolvedValue({ threads: [] }),
      readThread: vi.fn(),
    };
    const pool = {
      forWorkspace: vi.fn(() => runtime as unknown as LocalRuntimeClient),
    } as unknown as LocalRuntimePool;
    const provider = new ConversationTreeProvider(pool);

    await provider.getThreads();
    await provider.getThreads();

    await expect(provider.readThread('removed')).resolves.toBeUndefined();
    expect(runtime.readThread).not.toHaveBeenCalled();
  });

  it('filters listed sessions whose persisted cwd does not match the owning runtime', async () => {
    const runtime = {
      listThreads: vi.fn().mockResolvedValue({
        threads: [thread('foreign', '2026-07-14T00:00:00Z', '/workspace/b')],
      }),
      readThread: vi.fn(),
    };
    const pool = {
      forWorkspace: vi.fn(() => runtime as unknown as LocalRuntimeClient),
    } as unknown as LocalRuntimePool;
    vscode.workspace.workspaceFolders = [
      { name: 'a', index: 0, uri: vscode.Uri.file('/workspace/a') },
    ];
    const provider = new ConversationTreeProvider(pool);

    await expect(provider.getThreads()).resolves.toEqual([]);
    await expect(provider.resolveThread('foreign')).resolves.toBeUndefined();
    expect(runtime.readThread).not.toHaveBeenCalled();
  });

  it('rejects read metadata that crosses the owning workspace boundary', async () => {
    const runtime = {
      listThreads: vi.fn().mockResolvedValue({
        threads: [thread('one', '2026-07-14T00:00:00Z', '/workspace/a')],
      }),
      readThread: vi.fn().mockResolvedValue({
        thread: thread('one', '2026-07-14T00:00:00Z', '/workspace/b'),
        messages: [],
        transcriptTruncated: false,
      }),
    };
    const pool = {
      forWorkspace: vi.fn(() => runtime as unknown as LocalRuntimeClient),
    } as unknown as LocalRuntimePool;
    vscode.workspace.workspaceFolders = [
      { name: 'a', index: 0, uri: vscode.Uri.file('/workspace/a') },
    ];
    const provider = new ConversationTreeProvider(pool);
    await provider.getThreads();

    await expect(provider.resolveThread('one')).rejects.toThrow('ownership metadata');
  });

  it('rejects relative host cwd metadata even when it resolves to the owner path', () => {
    expect(isSameWorkspacePath(process.cwd(), '.')).toBe(false);
    expect(isSameWorkspacePath('/workspace/a', 'workspace/a')).toBe(false);
    expect(isSameWorkspacePath('/workspace/a', '/workspace/a/../a')).toBe(true);
  });
});
