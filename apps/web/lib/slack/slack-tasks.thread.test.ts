import { beforeEach, describe, expect, it, vi } from 'vitest';

type PersistModule =
  typeof import('@/app/api/chat/conversations/[id]/messages/lib/persist-message');
type RunModule = typeof import('@/lib/services/cloud-agent-run-service');
type JournalModule = typeof import('@/lib/services/cloud-agent-event-journal');

const mocks = vi.hoisted(() => ({
  persistConversationMessage: vi.fn(async () => undefined),
  createCloudAgentRun: vi.fn(async () => ({ id: 'agent-run-2' })),
}));

vi.mock(
  '@/app/api/chat/conversations/[id]/messages/lib/persist-message',
  async (importOriginal) => ({
    ...(await importOriginal<PersistModule>()),
    persistConversationMessage: mocks.persistConversationMessage,
  }),
);
vi.mock('@/lib/services/cloud-agent-run-service', async (importOriginal) => ({
  ...(await importOriginal<RunModule>()),
  createCloudAgentRun: mocks.createCloudAgentRun,
}));
vi.mock('@/lib/services/cloud-agent-event-journal', async (importOriginal) => ({
  ...(await importOriginal<JournalModule>()),
  createCloudAgentEventJournal: () => ({ append: vi.fn(), flush: vi.fn() }),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { findSlackThreadConversation, slackTask } from './slack-tasks';
import type { SlackRun } from './slack-runs';

function run(patch: Partial<SlackRun> = {}): SlackRun {
  return {
    id: 'slack-run-2',
    userId: 'user_1',
    organizationId: null,
    installationId: 'installation-1',
    slackUserId: 'U123',
    channelId: 'C123',
    messageTs: '1700000002.000200',
    threadTs: '1700000001.000100',
    surface: 'channel',
    mode: 'task',
    agentRunId: null,
    ...patch,
  };
}

function fakeDb(threadConversation: string | null) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('from slack_assistant_runs earlier')) {
      return threadConversation ? [{ conversation_id: threadConversation }] : [];
    }
    if (sql.includes('insert into web_conversations')) return [{ id: 'new-conversation' }];
    return [];
  });
  return { db: { query, execute: vi.fn(async () => 1) } as unknown as DatabaseAdapter, query };
}

const route = { modelKey: 'served-model', provider: 'anthropic' };

beforeEach(() => vi.clearAllMocks());

describe('a Slack thread is one conversation', () => {
  it('continues the conversation an earlier message in the thread started', async () => {
    const { db, query } = fakeDb('thread-conversation');
    const task = slackTask({ db, run: run(), instruction: 'And add the Q3 numbers' });
    await task.observer.routed?.(route as never);

    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('insert into web_conversations')),
    ).toBe(false);
    expect(mocks.persistConversationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: expect.objectContaining({ conversationId: 'thread-conversation' }),
        message: { role: 'user', content: 'And add the Q3 numbers' },
      }),
    );
    expect(mocks.createCloudAgentRun).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ conversationId: 'thread-conversation' }),
    );
  });

  it('starts a new conversation for a new thread or a top-level message', async () => {
    const { db } = fakeDb(null);
    const task = slackTask({ db, run: run(), instruction: 'Draft the launch note' });
    await task.observer.routed?.(route as never);
    expect(mocks.createCloudAgentRun).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ conversationId: 'new-conversation' }),
    );

    const topLevel = fakeDb('ignored');
    expect(await findSlackThreadConversation(topLevel.db, run({ threadTs: null }))).toBeNull();
    expect(topLevel.query).not.toHaveBeenCalled();
  });

  it('looks only at the same person, workspace, installation, channel and thread', async () => {
    const { db, query } = fakeDb('thread-conversation');
    await findSlackThreadConversation(db, run());
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('earlier.user_id = $1');
    expect(sql).toContain('earlier.organization_id is not distinct from $2::uuid');
    expect(sql).toContain('conversation.deleted_at is null');
    expect(params).toEqual([
      'user_1',
      null,
      'installation-1',
      'C123',
      '1700000001.000100',
      'slack-run-2',
    ]);
  });
});
