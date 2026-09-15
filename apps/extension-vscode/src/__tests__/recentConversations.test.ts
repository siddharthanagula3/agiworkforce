import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { ThreadSummary } from '@agiworkforce/types';
import {
  ChatStateManager,
  type ExtToWebviewMessage,
} from '../features/sidebar-webview/ChatStateManager';
import type { ConversationTreeProvider } from '../features/trees/conversationTreeProvider';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');

function thread(
  id: string,
  title: string,
  updatedAt: string,
  overrides: Partial<ThreadSummary> = {},
): ThreadSummary {
  return {
    id,
    title,
    model: 'auto',
    cwd: '/workspace',
    provider: 'anthropic',
    trustMode: 'byok',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt,
    createdBy: 'vscode',
    status: 'idle',
    ...overrides,
  };
}

const THREADS = [
  thread('thread-a', 'Wire the usage meter', '2026-09-13T11:56:00.000Z'),
  thread('thread-b', 'Rename the runtime pool', '2026-09-13T10:00:00.000Z'),
  thread('thread-c', 'Fix the diff decorations', '2026-09-10T12:00:00.000Z'),
  thread('thread-d', 'Older still', '2026-09-01T12:00:00.000Z'),
  thread('thread-e', 'Older yet', '2026-08-20T12:00:00.000Z'),
  thread('thread-f', 'Oldest of all', '2026-08-01T12:00:00.000Z'),
];

function makeManager(getThreads: () => Promise<ThreadSummary[]>) {
  const context = new vscode.ExtensionContext();
  const posted: ExtToWebviewMessage[] = [];
  const treeProvider = { getThreads: vi.fn(getThreads) } as unknown as ConversationTreeProvider;
  const manager = new ChatStateManager(
    context.secrets,
    context,
    (message) => posted.push(message),
    treeProvider,
    context.workspaceState,
  );
  return { manager, posted, treeProvider };
}

function recentsPayload(posted: ExtToWebviewMessage[]) {
  const message = posted.find((entry) => entry.type === 'recentConversations');
  return message?.type === 'recentConversations' ? message.payload : undefined;
}

describe('sidebar recent conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts the five most recent conversations and the full total', async () => {
    const { manager, posted } = makeManager(async () => THREADS);

    await manager.pushRecentConversations();

    const payload = recentsPayload(posted);

    expect(payload?.total).toBe(6);
    expect(payload?.conversations.map((entry) => entry.id)).toEqual([
      'thread-a',
      'thread-b',
      'thread-c',
      'thread-d',
      'thread-e',
    ]);
    expect(payload?.conversations[0]).toEqual({
      id: 'thread-a',
      title: 'Wire the usage meter',
      age: '4m ago',
    });
  });

  it('posts an empty list when the workspace has no conversations', async () => {
    const { manager, posted } = makeManager(async () => []);

    await manager.pushRecentConversations();

    expect(recentsPayload(posted)).toEqual({ total: 0, conversations: [] });
  });

  it('posts an empty list when the runtime cannot list conversations', async () => {
    const { manager, posted } = makeManager(async () => {
      throw new Error('AGI CLI not found');
    });

    await manager.pushRecentConversations();

    expect(recentsPayload(posted)).toEqual({ total: 0, conversations: [] });
  });

  it('opens a clicked conversation through the shared open-conversation command', async () => {
    const { manager } = makeManager(async () => THREADS);

    await manager.handleMessage({
      type: 'openRecentConversation',
      payload: { threadId: 'thread-b' },
    });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'agi-workforce.openConversation',
      'thread-b',
    );
  });

  it('answers the sessions sheet with the local rows, newest first', async () => {
    const { manager, posted } = makeManager(async () => THREADS);

    await manager.handleMessage({ type: 'requestSessions', payload: { source: 'local' } });

    const message = posted.find((entry) => entry.type === 'sessionsList');
    expect(message?.type === 'sessionsList' && message.payload.source).toBe('local');
    expect(message?.type === 'sessionsList' && message.payload.rows.map((row) => row.id)).toEqual([
      'thread-a',
      'thread-b',
      'thread-c',
      'thread-d',
      'thread-e',
      'thread-f',
    ]);
    expect(message?.type === 'sessionsList' && message.payload.rows[0]?.sourceLabel).toBe(
      'VS Code',
    );
  });

  it('names the surface that opened each session and shows its branch', async () => {
    const { manager, posted } = makeManager(async () => [
      thread('from-desktop', 'Started in the app', '2026-09-13T11:59:00.000Z', {
        createdBy: 'desktop',
        gitBranch: 'chore/repo-restructure',
      }),
      thread('from-cli', 'Started in the terminal', '2026-09-13T11:58:00.000Z', {
        createdBy: 'cli',
      }),
    ]);

    await manager.handleMessage({ type: 'requestSessions', payload: { source: 'local' } });

    const message = posted.find((entry) => entry.type === 'sessionsList');
    const rows = message?.type === 'sessionsList' ? message.payload.rows : [];
    expect(rows.map((row) => row.sourceLabel)).toEqual(['Desktop', 'CLI']);
    expect(rows[0]?.branch).toBe('chore/repo-restructure');
    expect(rows[1]?.branch).toBeUndefined();
  });
});
