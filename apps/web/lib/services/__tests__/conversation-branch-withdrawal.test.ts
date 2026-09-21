import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { StatementScanPostgres, type Row } from './statement-scan-postgres';

vi.mock('@/app/api/chat/conversations/[id]/messages/lib/index-artifacts', () => ({
  scheduleArtifactIndexing: vi.fn(),
}));

const { forkConversation } = await import('../conversation-branch-service');

const USER = 'user_owner';
const SOURCE = '11111111-1111-4111-8111-111111111111';
const FORK_POINT = '22222222-2222-4222-8222-222222222222';
const REMOVED = '33333333-3333-4333-8333-333333333333';
const REQUEST = '44444444-4444-4444-8444-444444444444';
const REMOVED_ATTACHMENT = '55555555-5555-4555-8555-555555555555';

function message(id: string, content: string, deletedAt: string | null): Row {
  return {
    id,
    conversation_id: SOURCE,
    role: 'user',
    content,
    model: 'model',
    provider: 'provider',
    input_tokens: 1,
    output_tokens: 1,
    cost_cents: 0,
    metadata: null,
    created_at: `2026-09-0${id[0]}T00:00:00.000Z`,
    deleted_at: deletedAt,
  };
}

function seeded(conversationDeletedAt: string | null = null) {
  return new StatementScanPostgres({
    web_conversations: [
      {
        id: SOURCE,
        user_id: USER,
        title: 'Source',
        model: 'model',
        project_id: null,
        pinned: false,
        starred: false,
        archived: false,
        is_temporary: false,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
        deleted_at: conversationDeletedAt,
      },
    ],
    web_messages: [
      message(REMOVED, 'the sentence the user took back', '2026-09-02T00:00:00.000Z'),
      message(FORK_POINT, 'the turn being forked', null),
    ],
    media_assets: [
      {
        id: REMOVED_ATTACHMENT,
        user_id: USER,
        conversation_id: SOURCE,
        kind: 'image',
        prompt: 'the picture the user took back',
        deleted_at: '2026-09-02T00:00:00.000Z',
      },
    ],
    conversation_branches: [],
    conversation_branch_messages: [],
  });
}

async function fork(db: StatementScanPostgres) {
  return forkConversation(db as unknown as DatabaseAdapter, USER, {
    sourceConversationId: SOURCE,
    messageId: FORK_POINT,
    requestId: REQUEST,
  });
}

describe('forkConversation', () => {
  it('copies no message the user deleted into the new conversation', async () => {
    const db = seeded();
    const target = await fork(db);

    const copied = db.rowsIn('web_messages').filter((row) => row['conversation_id'] === target.id);
    expect(copied.length).toBeGreaterThan(0);
    expect(copied.map((row) => row['content'])).not.toContain('the sentence the user took back');
    expect(copied.map((row) => row['content'])).toContain('the turn being forked');
  });

  it('leaves every copied row live and every deleted row where it was', async () => {
    const db = seeded();
    const target = await fork(db);

    for (const row of db.rowsIn('web_messages')) {
      if (row['conversation_id'] !== target.id) continue;
      expect(row['deleted_at'] ?? null).toBeNull();
    }
    const withdrawn = db.rowsIn('web_messages').filter((row) => row['id'] === REMOVED);
    expect(withdrawn).toHaveLength(1);
    expect(withdrawn[0]?.['conversation_id']).toBe(SOURCE);
  });

  it('copies no attachment of its own, so a deleted one cannot come back with the fork', async () => {
    const db = seeded();
    const target = await fork(db);

    expect(db.rowsIn('media_assets')).toHaveLength(1);
    expect(db.rowsIn('media_assets')[0]?.['conversation_id']).toBe(SOURCE);
    expect(
      db.rowsIn('web_artifacts').filter((row) => row['conversation_id'] === target.id),
    ).toHaveLength(0);
  });

  it('refuses a fork point the user deleted', async () => {
    const db = seeded();
    await expect(
      forkConversation(db as unknown as DatabaseAdapter, USER, {
        sourceConversationId: SOURCE,
        messageId: REMOVED,
        requestId: REQUEST,
      }),
    ).rejects.toThrow(/Fork-point message not found/);
  });

  it('refuses the whole thread once the conversation itself is deleted', async () => {
    const db = seeded('2026-09-03T00:00:00.000Z');
    await expect(fork(db)).rejects.toThrow(/Conversation not found/);
    expect(db.rowsIn('web_messages')).toHaveLength(2);
  });
});
