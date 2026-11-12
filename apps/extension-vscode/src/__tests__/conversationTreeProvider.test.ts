import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { ThreadSummary } from '@agiworkforce/types';
import {
  ConversationTreeErrorItem,
  ConversationTreeItem,
  ConversationTreeProvider,
} from '../features/trees/conversationTreeProvider';
import { isSameWorkspacePath } from '../integrations/developerSessionValidation';
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

  it('tells open chats when a session is archived or permanently deleted', async () => {
    const runtime = {
      listThreads: vi.fn().mockResolvedValue({
        threads: [
          thread('kept', '2026-07-13T00:00:00Z', '/workspace/a'),
          thread('gone', '2026-07-13T00:00:00Z', '/workspace/a'),
        ],
      }),
      archiveThread: vi.fn().mockResolvedValue(undefined),
      deleteThread: vi.fn().mockResolvedValue(undefined),
    };
    vscode.workspace.workspaceFolders = [
      { name: 'a', index: 0, uri: vscode.Uri.file('/workspace/a') },
    ];
    const provider = new ConversationTreeProvider({
      forWorkspace: vi.fn(() => runtime as unknown as LocalRuntimeClient),
    } as unknown as LocalRuntimePool);
    const removed: string[] = [];
    provider.onDidRemoveThread((id) => removed.push(id));

    await provider.archiveThread('kept');
    await provider.deleteThread('gone');

    expect(removed).toEqual(['kept', 'gone']);
    provider.dispose();
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

  it('continues a web conversation here once the CLI imports it into this folder', async () => {
    const imported = thread(
      '5f1c0d2e-0000-4000-8000-000000000001',
      '2026-10-18T00:00:00Z',
      '/workspace/a',
    );
    const runtime = {
      listThreads: vi.fn().mockResolvedValue({ threads: [] }),
      readThread: vi.fn().mockResolvedValue({
        thread: imported,
        messages: [{ role: 'user', text: 'Started on the web' }],
        transcriptTruncated: false,
      }),
    };
    const pool = {
      forWorkspace: vi.fn(() => runtime as unknown as LocalRuntimeClient),
    } as unknown as LocalRuntimePool;
    const provider = new ConversationTreeProvider(pool);

    await expect(provider.adoptAccountConversation(imported.id, '/workspace/a')).resolves.toBe(
      true,
    );
    await expect(provider.resolveThread(imported.id)).resolves.toMatchObject({
      cwd: '/workspace/a',
    });
    expect(runtime.listThreads).not.toHaveBeenCalled();
  });

  it('declines a web conversation the CLI cannot import into this folder', async () => {
    const elsewhere = thread(
      '5f1c0d2e-0000-4000-8000-000000000002',
      '2026-10-18T00:00:00Z',
      '/other',
    );
    const refusing = { readThread: vi.fn().mockRejectedValue(new Error('session not found')) };
    const misplaced = {
      readThread: vi
        .fn()
        .mockResolvedValue({ thread: elsewhere, messages: [], transcriptTruncated: false }),
    };
    const refusingPool = {
      forWorkspace: vi.fn(() => refusing as unknown as LocalRuntimeClient),
    } as unknown as LocalRuntimePool;
    const misplacedPool = {
      forWorkspace: vi.fn(() => misplaced as unknown as LocalRuntimeClient),
    } as unknown as LocalRuntimePool;

    await expect(
      new ConversationTreeProvider(refusingPool).adoptAccountConversation(
        elsewhere.id,
        '/workspace/a',
      ),
    ).resolves.toBe(false);
    await expect(
      new ConversationTreeProvider(misplacedPool).adoptAccountConversation(
        elsewhere.id,
        '/workspace/a',
      ),
    ).resolves.toBe(false);
  });

  it('asks for cloud sessions and lists them as read-only cloud rows', async () => {
    const cloud: ThreadSummary = {
      ...thread('cloud:5f1c', '2026-07-15T00:00:00Z', ''),
      cwd: undefined,
      location: 'cloud',
    };
    const runtime = {
      listThreads: vi.fn().mockResolvedValue({ threads: [cloud] }),
      readThread: vi.fn().mockResolvedValue({
        thread: cloud,
        messages: [{ role: 'user', text: 'Fix the test' }],
        transcriptTruncated: false,
      }),
    };
    vscode.workspace.workspaceFolders = [
      { name: 'a', index: 0, uri: vscode.Uri.file('/workspace/a') },
    ];
    const pool = {
      forWorkspace: vi.fn(() => runtime as unknown as LocalRuntimeClient),
    } as unknown as LocalRuntimePool;
    const provider = new ConversationTreeProvider(pool);

    expect((await provider.getThreads()).map((value) => value.id)).toEqual(['cloud:5f1c']);
    expect(runtime.listThreads).toHaveBeenCalledWith(
      expect.objectContaining({ includeCloud: true }),
    );
    await expect(provider.readThread('cloud:5f1c')).resolves.toEqual(
      expect.objectContaining({ thread: cloud }),
    );
    const item = new ConversationTreeItem(cloud);
    expect(item.contextValue).toBe('cloudConversation');
    expect(String(item.description)).toContain('Cloud');
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

  it('deletes through the owning runtime and drops the row', async () => {
    const runtime = {
      listThreads: vi.fn().mockResolvedValue({
        threads: [thread('one', '2026-07-14T00:00:00Z', '/workspace/a')],
      }),
      deleteThread: vi.fn().mockResolvedValue(undefined),
    };
    const pool = {
      forWorkspace: vi.fn(() => runtime as unknown as LocalRuntimeClient),
    } as unknown as LocalRuntimePool;
    const provider = new ConversationTreeProvider(pool);
    const changed = vi.fn();
    provider.onDidChangeTreeData(changed);
    await provider.getThreads();

    await expect(provider.deleteThread('one')).resolves.toBe(true);
    expect(runtime.deleteThread).toHaveBeenCalledWith('one');
    expect(changed).toHaveBeenCalledOnce();
    runtime.listThreads.mockResolvedValue({ threads: [] });
    await expect(provider.deleteThread('missing')).resolves.toBe(false);
  });

  it('forks through the owning runtime and routes the copy to the same one', async () => {
    // Fork leaves the original where it is, so the copy has to inherit its
    // runtime: a fork the tree cannot route is a session nothing can resume.
    const runtime = {
      listThreads: vi.fn().mockResolvedValue({
        threads: [thread('one', '2026-07-14T00:00:00Z', '/workspace/a')],
      }),
      forkThread: vi
        .fn()
        .mockResolvedValue(thread('one-fork', '2026-07-14T00:01:00Z', '/workspace/a')),
      readThread: vi.fn().mockResolvedValue({
        thread: thread('one-fork', '2026-07-14T00:01:00Z', '/workspace/a'),
        messages: [],
      }),
    };
    const pool = {
      forWorkspace: vi.fn(() => runtime as unknown as LocalRuntimeClient),
    } as unknown as LocalRuntimePool;
    const provider = new ConversationTreeProvider(pool);
    const changed = vi.fn();
    provider.onDidChangeTreeData(changed);
    await provider.getThreads();

    await expect(provider.forkThread('one', 'A copy')).resolves.toBe('one-fork');
    expect(runtime.forkThread).toHaveBeenCalledWith('one', 'A copy', undefined);
    expect(changed).toHaveBeenCalledOnce();

    await provider.readThread('one-fork');
    expect(runtime.readThread).toHaveBeenCalledWith('one-fork');
  });

  it('reports a fork of a session it cannot route rather than inventing one', async () => {
    const runtime = {
      listThreads: vi.fn().mockResolvedValue({ threads: [] }),
      forkThread: vi.fn(),
    };
    const pool = {
      forWorkspace: vi.fn(() => runtime as unknown as LocalRuntimeClient),
    } as unknown as LocalRuntimePool;
    const provider = new ConversationTreeProvider(pool);

    await expect(provider.forkThread('missing')).resolves.toBeNull();
    expect(runtime.forkThread).not.toHaveBeenCalled();
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

  it('shows a listing failure as its own tree item instead of an empty history', async () => {
    const failing = {
      listThreads: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'AGI_CLI_NOT_FOUND: The AGI CLI could not be started. "agi" is not on the PATH this editor was launched with.',
          ),
        ),
    };
    const healthy = {
      listThreads: vi.fn().mockResolvedValue({
        threads: [thread('kept', '2026-07-14T00:00:00Z', '/workspace/b')],
      }),
    };
    const pool = {
      forWorkspace: vi.fn(
        (cwd: string) => (cwd.endsWith('/a') ? failing : healthy) as unknown as LocalRuntimeClient,
      ),
    } as unknown as LocalRuntimePool;
    const provider = new ConversationTreeProvider(pool);

    const children = await provider.getChildren();

    const failure = children.find(
      (child): child is ConversationTreeErrorItem => child instanceof ConversationTreeErrorItem,
    );
    expect(failure).toBeDefined();
    expect(failure?.folderName).toBe('a');
    expect(failure?.reason).toContain('not on the PATH');
    expect(failure?.reason).not.toContain('AGI_CLI_NOT_FOUND');
    expect(failure?.contextValue).toBe('conversationListingFailure');
    expect(children.filter((child) => child instanceof ConversationTreeItem)).toHaveLength(1);
  });

  it('surfaces a pool that refuses to hand out a runtime rather than swallowing it', async () => {
    const pool = {
      forWorkspace: vi.fn(() => {
        throw new Error('AGI local runtime is restarting; retry after restart completes');
      }),
    } as unknown as LocalRuntimePool;
    vscode.workspace.workspaceFolders = [
      { name: 'a', index: 0, uri: vscode.Uri.file('/workspace/a') },
    ];
    const provider = new ConversationTreeProvider(pool);

    const children = await provider.getChildren();

    expect(children).toHaveLength(1);
    expect(children[0]).toBeInstanceOf(ConversationTreeErrorItem);
    expect((children[0] as ConversationTreeErrorItem).reason).toContain('restarting');
  });

  it('clears the failure item once the listing succeeds again', async () => {
    const runtime = {
      listThreads: vi
        .fn()
        .mockRejectedValueOnce(new Error('runtime handshake failed'))
        .mockResolvedValue({ threads: [thread('one', '2026-07-14T00:00:00Z', '/workspace/a')] }),
    };
    const pool = {
      forWorkspace: vi.fn(() => runtime as unknown as LocalRuntimeClient),
    } as unknown as LocalRuntimePool;
    vscode.workspace.workspaceFolders = [
      { name: 'a', index: 0, uri: vscode.Uri.file('/workspace/a') },
    ];
    const provider = new ConversationTreeProvider(pool);

    expect(await provider.getChildren()).toHaveLength(1);
    expect((await provider.getChildren())[0]).toBeInstanceOf(ConversationTreeItem);
  });

  describe('active sessions beyond the first page', () => {
    function singleFolderProvider(runtime: Record<string, unknown>): ConversationTreeProvider {
      const pool = {
        forWorkspace: vi.fn(() => runtime as unknown as LocalRuntimeClient),
      } as unknown as LocalRuntimePool;
      vscode.workspace.workspaceFolders = [
        { name: 'a', index: 0, uri: vscode.Uri.file('/workspace/a') },
      ];
      return new ConversationTreeProvider(pool);
    }

    it('follows the continuation and routes sessions from later pages', async () => {
      const first = Array.from({ length: 100 }, (_, index) =>
        thread(`recent-${index}`, '2026-07-14T00:00:00Z', '/workspace/a'),
      );
      const listThreads = vi
        .fn()
        .mockResolvedValueOnce({ threads: first, nextCursor: 'recent-99' })
        .mockResolvedValueOnce({
          threads: [thread('older', '2026-06-01T00:00:00Z', '/workspace/a')],
        });
      const readThread = vi.fn().mockResolvedValue({
        thread: thread('older', '2026-06-01T00:00:00Z', '/workspace/a'),
        messages: [],
        transcriptTruncated: false,
      });
      const provider = singleFolderProvider({ listThreads, readThread });

      const threads = await provider.getThreads();

      expect(threads).toHaveLength(101);
      expect(threads.at(-1)?.id).toBe('older');
      expect(listThreads).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 'recent-99', includeArchived: false }),
      );
      await expect(provider.readThread('older')).resolves.toBeDefined();
    });

    it('shows a continuation that never advances as a listing failure, not a truncated list', async () => {
      const listThreads = vi.fn().mockResolvedValue({
        threads: [thread('one', '2026-07-14T00:00:00Z', '/workspace/a')],
        nextCursor: 'c',
      });
      const provider = singleFolderProvider({ listThreads });

      const children = await provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0]).toBeInstanceOf(ConversationTreeErrorItem);
      expect(listThreads).toHaveBeenCalledTimes(2);
    });
  });

  describe('archived sessions', () => {
    const archived = (id: string, updatedAt: string): ThreadSummary => ({
      ...thread(id, updatedAt, '/workspace/a'),
      status: 'archived',
    });

    function singleFolderProvider(runtime: Record<string, unknown>): ConversationTreeProvider {
      const pool = {
        forWorkspace: vi.fn(() => runtime as unknown as LocalRuntimeClient),
      } as unknown as LocalRuntimePool;
      vscode.workspace.workspaceFolders = [
        { name: 'a', index: 0, uri: vscode.Uri.file('/workspace/a') },
      ];
      return new ConversationTreeProvider(pool);
    }

    it('follows the continuation past a first page of active sessions', async () => {
      const active = Array.from({ length: 100 }, (_, index) =>
        thread(`active-${index}`, '2026-07-14T00:00:00Z', '/workspace/a'),
      );
      const listThreads = vi
        .fn()
        .mockResolvedValueOnce({ threads: active, nextCursor: 'active-99' })
        .mockResolvedValueOnce({ threads: [archived('old', '2026-06-01T00:00:00Z')] });
      const provider = singleFolderProvider({ listThreads });

      const { items, failures } = await provider.getArchivedThreads();

      expect(items.map((item) => item.id)).toEqual(['old']);
      expect(failures).toEqual([]);
      expect(listThreads).toHaveBeenCalledTimes(2);
      expect(listThreads).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 'active-99', includeArchived: true }),
      );
    });

    it('collects archived sessions from every page', async () => {
      const listThreads = vi
        .fn()
        .mockResolvedValueOnce({
          threads: [archived('newer', '2026-07-01T00:00:00Z')],
          nextCursor: 'newer',
        })
        .mockResolvedValueOnce({ threads: [archived('older', '2026-06-01T00:00:00Z')] });
      const provider = singleFolderProvider({ listThreads });

      const { items } = await provider.getArchivedThreads();

      expect(items.map((item) => item.id)).toEqual(['newer', 'older']);
    });

    it('reports a continuation that never advances as a listing failure', async () => {
      const listThreads = vi
        .fn()
        .mockResolvedValue({ threads: [archived('one', '2026-07-01T00:00:00Z')], nextCursor: 'c' });
      const provider = singleFolderProvider({ listThreads });

      const { items, failures } = await provider.getArchivedThreads();

      expect(items).toEqual([]);
      expect(failures).toHaveLength(1);
      expect(failures[0]?.folderName).toBe('a');
      expect(listThreads).toHaveBeenCalledTimes(2);
    });
  });

  it('rejects relative host cwd metadata even when it resolves to the owner path', () => {
    expect(isSameWorkspacePath(process.cwd(), '.')).toBe(false);
    expect(isSameWorkspacePath('/workspace/a', 'workspace/a')).toBe(false);
    expect(isSameWorkspacePath('/workspace/a', '/workspace/a/../a')).toBe(true);
  });
});
