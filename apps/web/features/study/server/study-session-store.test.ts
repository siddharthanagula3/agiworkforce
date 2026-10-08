import { describe, expect, it } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { StatementScanPostgres } from '@/lib/services/__tests__/statement-scan-postgres';
import { listStudySessions } from './study-session-store';

const USER = 'user-1';
const CONVERSATION = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_CONVERSATION = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_CONVERSATION = '33333333-3333-4333-8333-333333333333';
const WORKSPACE = '44444444-4444-4444-8444-444444444444';

function session(id: string, userId: string, conversationId: string) {
  return {
    id,
    user_id: userId,
    conversation_id: conversationId,
    topic: 'photosynthesis',
    mode: 'learn',
    level: 'beginner',
    started_at: '2026-10-01T09:00:00.000Z',
    ended_at: null,
  };
}

function seeded() {
  return new StatementScanPostgres({
    web_conversations: [
      { id: CONVERSATION, user_id: USER, organization_id: null, deleted_at: null },
      { id: OTHER_USER_CONVERSATION, user_id: 'user-2', organization_id: null, deleted_at: null },
      { id: WORKSPACE_CONVERSATION, user_id: USER, organization_id: WORKSPACE, deleted_at: null },
    ],
    study_sessions: [
      session('study-1', USER, CONVERSATION),
      session('study-2', 'user-2', OTHER_USER_CONVERSATION),
      session('study-3', USER, WORKSPACE_CONVERSATION),
    ],
  });
}

function listedConversations(db: StatementScanPostgres, organizationId: string | null = null) {
  return listStudySessions(db as unknown as DatabaseAdapter, {
    userId: USER,
    organizationId,
  }).then((sessions) => sessions.map((listed) => listed.conversationId));
}

describe('listStudySessions', () => {
  it('lists only the account’s own sessions in the active workspace', async () => {
    const db = seeded();

    expect(await listedConversations(db)).toEqual([CONVERSATION]);
    expect(await listedConversations(db, WORKSPACE)).toEqual([WORKSPACE_CONVERSATION]);
  });

  it('hides a session while its chat is deleted and lists it again once the chat is restored', async () => {
    const db = seeded();
    const chat = db.rowsIn('web_conversations')[0]!;

    chat['deleted_at'] = '2026-10-02T09:00:00.000Z';
    expect(await listedConversations(db)).toEqual([]);

    chat['deleted_at'] = null;
    expect(await listedConversations(db)).toEqual([CONVERSATION]);
  });
});
