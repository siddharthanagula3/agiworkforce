import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

const { scheduleArtifactIndexing } = vi.hoisted(() => ({ scheduleArtifactIndexing: vi.fn() }));
vi.mock('@/app/api/chat/conversations/[id]/messages/lib/index-artifacts', () => ({
  scheduleArtifactIndexing,
}));

const { forkConversation } = await import('./conversation-branch-service');

const USER_ID = 'user-1';
const SOURCE_CONVERSATION_ID = '0190a000-0000-7000-8000-0000000000aa';
const FORK_MESSAGE_ID = '0190a000-0000-7000-8000-0000000000bb';
const REQUEST_ID = '0190a000-0000-7000-8000-0000000000dd';

const sourceConversation = {
  id: SOURCE_CONVERSATION_ID,
  title: 'Source chat',
  model: 'auto',
  project_id: null,
  pinned: false,
  starred: false,
  archived: false,
  is_temporary: false,
  created_at: '2026-07-30T00:00:00.000Z',
  updated_at: '2026-07-30T00:00:00.000Z',
};

const targetConversation = {
  ...sourceConversation,
  id: REQUEST_ID,
  title: 'Source chat (branch)',
};

function adapter() {
  const query = vi.fn();
  const execute = vi.fn();
  const db = {
    query,
    execute,
    transaction: vi.fn(async (run: (tx: DatabaseAdapter) => Promise<unknown>) => run(db)),
  } as unknown as DatabaseAdapter;
  return { db, query, execute };
}

function mockThroughFork(query: ReturnType<typeof vi.fn>, copiedRows: unknown[]) {
  query
    .mockResolvedValueOnce([]) // findIdempotentBranch: no existing branch for this requestId
    .mockResolvedValueOnce([sourceConversation]) // source select ... for update
    .mockResolvedValueOnce([{ id: FORK_MESSAGE_ID }]) // fork-point ownership check
    .mockResolvedValueOnce([{ sibling_count: 0, group_count: 0 }]) // capacity check
    .mockResolvedValueOnce([targetConversation]) // insert into web_conversations returning
    .mockResolvedValueOnce(copiedRows); // the copy step's assistant-row select
}

async function fork(db: DatabaseAdapter) {
  return forkConversation(db, USER_ID, {
    sourceConversationId: SOURCE_CONVERSATION_ID,
    messageId: FORK_MESSAGE_ID,
    requestId: REQUEST_ID,
  });
}

describe('forkConversation -> artifact indexing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('indexes every copied assistant message under the new conversation and message ids', async () => {
    const { db, query, execute } = adapter();
    execute.mockResolvedValue(1);
    mockThroughFork(query, [
      { id: 'copied-assistant-1', content: 'first assistant reply' },
      { id: 'copied-assistant-2', content: 'second assistant reply' },
    ]);

    await expect(fork(db)).resolves.toEqual(targetConversation);

    expect(scheduleArtifactIndexing).toHaveBeenCalledTimes(2);
    expect(scheduleArtifactIndexing).toHaveBeenNthCalledWith(1, {
      db,
      userId: USER_ID,
      conversationId: targetConversation.id,
      messageId: 'copied-assistant-1',
      content: 'first assistant reply',
    });
    expect(scheduleArtifactIndexing).toHaveBeenNthCalledWith(2, {
      db,
      userId: USER_ID,
      conversationId: targetConversation.id,
      messageId: 'copied-assistant-2',
      content: 'second assistant reply',
    });
  });

  it('does not index anything when the fork point predates any assistant reply', async () => {
    const { db, query, execute } = adapter();
    execute.mockResolvedValue(1);
    mockThroughFork(query, []);

    await expect(fork(db)).resolves.toEqual(targetConversation);

    expect(scheduleArtifactIndexing).not.toHaveBeenCalled();
  });

  it('does not re-index on an idempotent retry that returns the prior branch', async () => {
    const { db, query, execute } = adapter();
    query.mockResolvedValueOnce([targetConversation]);

    await expect(fork(db)).resolves.toEqual(targetConversation);

    expect(execute).not.toHaveBeenCalled();
    expect(scheduleArtifactIndexing).not.toHaveBeenCalled();
  });

  it('never indexes when the fork transaction rejects before the copy step', async () => {
    const { db, query, execute } = adapter();
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([sourceConversation])
      .mockResolvedValueOnce([]); // fork-point not found

    await expect(fork(db)).rejects.toThrow('Fork-point message not found');

    expect(execute).not.toHaveBeenCalled();
    expect(scheduleArtifactIndexing).not.toHaveBeenCalled();
  });
});
