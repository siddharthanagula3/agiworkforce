import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { ThreadSummary } from '@agiworkforce/types';
import {
  ChatStateManager,
  type ExtToWebviewMessage,
} from '../features/sidebar-webview/ChatStateManager';
import type { ConversationTreeProvider } from '../features/trees/conversationTreeProvider';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');

function thread(id: string, title: string, updatedAt: string): ThreadSummary {
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
  };
}

const THREADS = [
  thread('thread-a', 'Wire the usage meter', '2026-09-13T11:56:00.000Z'),
  thread('thread-b', 'Rename the runtime pool', '2026-09-13T10:00:00.000Z'),
  thread('thread-c', 'Fix the diff decorations', '2026-09-10T12:00:00.000Z'),
  thread('thread-d', 'Older still', '2026-09-01T12:00:00.000Z'),
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

  it('posts the three most recent conversations and the full total', async () => {
    const { manager, posted } = makeManager(async () => THREADS);

    await manager.pushRecentConversations();

    expect(recentsPayload(posted)).toEqual({
      total: 4,
      conversations: [
        { id: 'thread-a', title: 'Wire the usage meter', age: '4m ago' },
        { id: 'thread-b', title: 'Rename the runtime pool', age: '2h ago' },
        { id: 'thread-c', title: 'Fix the diff decorations', age: '3d ago' },
      ],
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

  it('reveals the native history tree for View all', async () => {
    const { manager } = makeManager(async () => THREADS);

    await manager.handleMessage({ type: 'revealConversationHistory' });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'agi-workforce.conversations.focus',
    );
  });
});
