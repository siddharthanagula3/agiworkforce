import { describe, expect, it } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { StatementScanPostgres } from '@/lib/services/__tests__/statement-scan-postgres';
import {
  listStudySessions,
  readStudySessionForConversation,
  startStudySession,
} from './study-session-store';

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

function readFor(
  db: StatementScanPostgres,
  conversationId: string,
  organizationId: string | null = null,
) {
  return readStudySessionForConversation(
    db as unknown as DatabaseAdapter,
    { userId: USER, organizationId },
    conversationId,
  ).then((found) => found?.conversationId ?? null);
}

describe('readStudySessionForConversation', () => {
  it('answers for the account’s own chat in the active workspace only', async () => {
    const db = seeded();

    expect(await readFor(db, CONVERSATION)).toBe(CONVERSATION);
    expect(await readFor(db, OTHER_USER_CONVERSATION)).toBeNull();
    expect(await readFor(db, WORKSPACE_CONVERSATION)).toBeNull();
    expect(await readFor(db, WORKSPACE_CONVERSATION, WORKSPACE)).toBe(WORKSPACE_CONVERSATION);
    expect(await readFor(db, CONVERSATION, WORKSPACE)).toBeNull();
  });

  it('answers nothing while the chat is deleted and answers again once it is restored', async () => {
    const db = seeded();
    const chat = db.rowsIn('web_conversations')[0]!;

    chat['deleted_at'] = '2026-10-02T09:00:00.000Z';
    expect(await readFor(db, CONVERSATION)).toBeNull();

    chat['deleted_at'] = null;
    expect(await readFor(db, CONVERSATION)).toBe(CONVERSATION);
  });
});

const DELETED_CONVERSATION = '55555555-5555-4555-8555-555555555555';
const TEMPORARY_CONVERSATION = '66666666-6666-4666-8666-666666666666';

function startable() {
  return new StatementScanPostgres({
    web_conversations: [
      {
        id: CONVERSATION,
        user_id: USER,
        organization_id: null,
        deleted_at: null,
        is_temporary: false,
      },
      {
        id: OTHER_USER_CONVERSATION,
        user_id: 'user-2',
        organization_id: null,
        deleted_at: null,
        is_temporary: false,
      },
      {
        id: WORKSPACE_CONVERSATION,
        user_id: USER,
        organization_id: WORKSPACE,
        deleted_at: null,
        is_temporary: false,
      },
      {
        id: DELETED_CONVERSATION,
        user_id: USER,
        organization_id: null,
        deleted_at: '2026-10-02T09:00:00.000Z',
        is_temporary: false,
      },
      {
        id: TEMPORARY_CONVERSATION,
        user_id: USER,
        organization_id: null,
        deleted_at: null,
        is_temporary: true,
      },
    ],
    study_sessions: [],
  });
}

function start(
  db: StatementScanPostgres,
  conversationId: string,
  organizationId: string | null = null,
) {
  return startStudySession(
    db as unknown as DatabaseAdapter,
    { userId: USER, organizationId },
    { conversationId, topic: 'photosynthesis', mode: 'learn', level: 'beginner' },
  );
}

describe('startStudySession', () => {
  it('starts a session on the account’s own live chat', async () => {
    const db = startable();

    const started = await start(db, CONVERSATION);

    expect(started?.conversationId).toBe(CONVERSATION);
    expect(db.rowsIn('study_sessions')).toEqual([
      expect.objectContaining({ user_id: USER, conversation_id: CONVERSATION }),
    ]);
  });

  it('writes nothing on another account’s conversation', async () => {
    const db = startable();

    expect(await start(db, OTHER_USER_CONVERSATION)).toBeNull();
    expect(db.rowsIn('study_sessions')).toEqual([]);
  });

  it('writes nothing on a chat outside the active workspace', async () => {
    const db = startable();

    expect(await start(db, WORKSPACE_CONVERSATION)).toBeNull();
    expect(await start(db, CONVERSATION, WORKSPACE)).toBeNull();
    expect(db.rowsIn('study_sessions')).toEqual([]);

    expect((await start(db, WORKSPACE_CONVERSATION, WORKSPACE))?.conversationId).toBe(
      WORKSPACE_CONVERSATION,
    );
  });

  it('writes nothing on a deleted or temporary chat', async () => {
    const db = startable();

    expect(await start(db, DELETED_CONVERSATION)).toBeNull();
    expect(await start(db, TEMPORARY_CONVERSATION)).toBeNull();
    expect(db.rowsIn('study_sessions')).toEqual([]);
  });
});
