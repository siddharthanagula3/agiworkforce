import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { assertWorkspaceScope, type WorkspaceScope } from '@/lib/server/workspace-scope';

import {
  composeStudyInstruction,
  isStudyLevel,
  isStudyMode,
  normalizeStudyTopic,
  type StudyLevel,
  type StudyMode,
  type StudySession,
} from '../lib/study-session';

interface StudySessionRow {
  id: string;
  conversation_id: string;
  topic: string;
  mode: string;
  level: string;
  started_at: string | Date;
  ended_at: string | Date | null;
}

const COLUMNS = 'id, conversation_id, topic, mode, level, started_at, ended_at';

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function present(row: StudySessionRow): StudySession {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    topic: row.topic,
    mode: row.mode as StudyMode,
    level: row.level as StudyLevel,
    startedAt: toIso(row.started_at) ?? '',
    endedAt: toIso(row.ended_at),
  };
}

export async function listStudySessions(
  db: DatabaseAdapter,
  scope: WorkspaceScope,
  limit = 50,
): Promise<StudySession[]> {
  const { userId, organizationId } = assertWorkspaceScope(scope);
  const rows = await db.query<StudySessionRow>(
    `select s.id, s.conversation_id, s.topic, s.mode, s.level, s.started_at, s.ended_at
       from public.study_sessions s
       join public.web_conversations c on c.id = s.conversation_id and c.user_id = s.user_id
      where s.user_id = $1
        and c.organization_id is not distinct from $2::uuid
        and c.deleted_at is null
      order by s.started_at desc
      limit $3`,
    [userId, organizationId, limit],
  );
  return rows.map(present);
}

export async function readStudySessionForConversation(
  db: DatabaseAdapter,
  userId: string,
  conversationId: string,
): Promise<StudySession | null> {
  const [row] = await db.query<StudySessionRow>(
    `select ${COLUMNS}
       from public.study_sessions
      where user_id = $1 and conversation_id = $2`,
    [userId, conversationId],
  );
  return row ? present(row) : null;
}

/** What a turn in this conversation is told while its study session is open. */
export async function readActiveStudyInstruction(
  db: DatabaseAdapter,
  userId: string,
  conversationId: string,
): Promise<string | null> {
  const [row] = await db.query<Pick<StudySessionRow, 'topic' | 'mode' | 'level'>>(
    `select topic, mode, level
       from public.study_sessions
      where user_id = $1 and conversation_id = $2 and ended_at is null
      limit 1`,
    [userId, conversationId],
  );
  const topic = normalizeStudyTopic(row?.topic);
  if (!row || !topic || !isStudyMode(row.mode) || !isStudyLevel(row.level)) return null;
  return composeStudyInstruction({ topic, mode: row.mode, level: row.level });
}

/**
 * Starting a study session on a conversation that already has one re-opens it
 * with the new topic rather than refusing. The conversation is the session, so
 * a second start is the user changing their mind about what they are studying,
 * not a duplicate.
 */
export async function startStudySession(
  db: DatabaseAdapter,
  input: {
    userId: string;
    conversationId: string;
    topic: string;
    mode: StudyMode;
    level: StudyLevel;
  },
): Promise<StudySession> {
  const [row] = await db.query<StudySessionRow>(
    `insert into public.study_sessions (user_id, conversation_id, topic, mode, level)
     values ($1, $2, $3, $4, $5)
     on conflict (conversation_id) do update
       set topic = excluded.topic,
           mode = excluded.mode,
           level = excluded.level,
           ended_at = null
     returning ${COLUMNS}`,
    [input.userId, input.conversationId, input.topic, input.mode, input.level],
  );
  if (!row) throw new Error('The study session was not stored.');
  return present(row);
}

/** Leaving study mode. The conversation stays, readable in normal chat. */
export async function endStudySession(
  db: DatabaseAdapter,
  userId: string,
  conversationId: string,
): Promise<StudySession | null> {
  const [row] = await db.query<StudySessionRow>(
    `update public.study_sessions
        set ended_at = now()
      where user_id = $1 and conversation_id = $2 and ended_at is null
      returning ${COLUMNS}`,
    [userId, conversationId],
  );
  return row ? present(row) : null;
}
