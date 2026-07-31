import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

const { forkConversation, listConversationBranchGroups } =
  await import('./conversation-branch-service');

const sourceConversation = {
  id: '0190a000-0000-7000-8000-0000000000aa',
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

describe('conversation branch service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps an owned source fork into one message-level sibling group', async () => {
    const { db, query } = adapter();
    query.mockResolvedValueOnce([{ id: sourceConversation.id }]).mockResolvedValueOnce([
      {
        local_message_id: '0190a000-0000-7000-8000-0000000000bb',
        source_conversation_id: sourceConversation.id,
        branch_point_message_id: '0190a000-0000-7000-8000-0000000000bb',
        source_title: 'Source chat',
        target_conversation_id: '0190a000-0000-7000-8000-0000000000cc',
        target_title: 'Source chat (branch)',
        branch_created_at: '2026-07-30T00:01:00.000Z',
      },
    ]);

    await expect(
      listConversationBranchGroups(db, 'user-1', sourceConversation.id),
    ).resolves.toEqual([
      {
        messageId: '0190a000-0000-7000-8000-0000000000bb',
        activeConversationId: sourceConversation.id,
        branches: [
          { conversationId: sourceConversation.id, title: 'Source chat' },
          {
            conversationId: '0190a000-0000-7000-8000-0000000000cc',
            title: 'Source chat (branch)',
          },
        ],
      },
    ]);

    const [groupSql, groupParams] = query.mock.calls[1]!;
    expect(groupSql).toContain('active_map.target_message_id');
    expect(groupSql).toContain('branch.user_id = $2');
    expect(groupSql).toContain('source.user_id = $2');
    expect(groupSql).toContain('target.user_id = $2');
    expect(groupParams).toEqual([sourceConversation.id, 'user-1']);
  });

  it('rejects a conversation outside the authenticated owner scope', async () => {
    const { db, query } = adapter();
    query.mockResolvedValueOnce([]);

    await expect(listConversationBranchGroups(db, 'user-1', sourceConversation.id)).rejects.toThrow(
      'Conversation not found',
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('creates the target, relation, copied messages, and id map in one transaction', async () => {
    const { db, query, execute } = adapter();
    const targetConversation = {
      ...sourceConversation,
      id: '0190a000-0000-7000-8000-0000000000dd',
      title: 'Source chat (branch)',
    };
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([sourceConversation])
      .mockResolvedValueOnce([{ id: '0190a000-0000-7000-8000-0000000000bb' }])
      .mockResolvedValueOnce([{ sibling_count: 0, group_count: 0 }])
      .mockResolvedValueOnce([targetConversation]);
    execute.mockResolvedValue(1);

    await expect(
      forkConversation(db, 'user-1', {
        sourceConversationId: sourceConversation.id,
        messageId: '0190a000-0000-7000-8000-0000000000bb',
        requestId: targetConversation.id,
      }),
    ).resolves.toEqual(targetConversation);

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(query.mock.calls[1]![0]).toContain('for update');
    expect(execute).toHaveBeenCalledTimes(2);
    const [relationSql, relationParams] = execute.mock.calls[0]!;
    expect(relationSql).toContain('insert into public.conversation_branches');
    expect(relationParams).toEqual([
      targetConversation.id,
      sourceConversation.id,
      '0190a000-0000-7000-8000-0000000000bb',
      'user-1',
    ]);

    const [copySql, copyParams] = execute.mock.calls[1]!;
    expect(copySql).toContain('row_number() over');
    expect(copySql).toContain('insert into public.web_messages');
    expect(copySql).toContain('cost_cents');
    expect(copySql).toContain('insert into public.conversation_branch_messages');
    expect(copyParams).toEqual([
      sourceConversation.id,
      '0190a000-0000-7000-8000-0000000000bb',
      targetConversation.id,
      targetConversation.id,
    ]);
  });

  it('returns the first target for an idempotent retry without writing again', async () => {
    const { db, query, execute } = adapter();
    const targetConversation = {
      ...sourceConversation,
      id: '0190a000-0000-7000-8000-0000000000dd',
      title: 'Source chat (branch)',
    };
    query.mockResolvedValueOnce([targetConversation]);

    await expect(
      forkConversation(db, 'user-1', {
        sourceConversationId: sourceConversation.id,
        messageId: '0190a000-0000-7000-8000-0000000000bb',
        requestId: targetConversation.id,
      }),
    ).resolves.toEqual(targetConversation);
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails before mutation when the fork point is not owned by the source conversation', async () => {
    const { db, query, execute } = adapter();
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([sourceConversation])
      .mockResolvedValueOnce([]);

    await expect(
      forkConversation(db, 'user-1', {
        sourceConversationId: sourceConversation.id,
        messageId: '0190a000-0000-7000-8000-0000000000ee',
        requestId: '0190a000-0000-7000-8000-0000000000dd',
      }),
    ).rejects.toThrow('Fork-point message not found');
    expect(execute).not.toHaveBeenCalled();
  });
});
