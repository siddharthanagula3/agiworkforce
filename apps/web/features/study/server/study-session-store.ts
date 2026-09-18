import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import type { StudyLevel, StudyMode, StudySession } from '../lib/study-session';

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
  userId: string,
  limit = 50,
): Promise<StudySession[]> {
  const rows = await db.query<StudySessionRow>(
    `select ${COLUMNS}
       from public.study_sessions
      where user_id = $1
      order by started_at desc
      limit $2`,
    [userId, limit],
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
