import 'server-only';

export interface VoiceSessionDb {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export type VoiceSessionSurface = 'web' | 'mobile' | 'desktop';
export type VoiceSessionStatus = 'active' | 'closed';

export const VOICE_PACE_MIN = 0.25;
export const VOICE_PACE_MAX = 4;
export const VOICE_PACE_DEFAULT = 1;

export interface VoiceSessionRecord {
  id: string;
  userId: string;
  organizationId: string | null;
  conversationId: string;
  provider: string;
  providerSessionId: string;
  modelId: string;
  surface: VoiceSessionSurface;
  voice: string;
  language: string | null;
  pace: number;
  activeTools: string[];
  lastTurnId: string | null;
  status: VoiceSessionStatus;
  closeReason: string | null;
  startedAt: string;
  lastSeenAt: string;
  closedAt: string | null;
}

export interface CreateVoiceSessionInput {
  db: VoiceSessionDb;
  /** Chosen before the session's usage is reserved, so the reservation can be named by it. */
  id: string;
  userId: string;
  organizationId: string | null;
  conversationId: string;
  provider: string;
  providerSessionId: string;
  modelId: string;
  surface: VoiceSessionSurface;
  voice: string;
  language: string | null;
  pace: number;
  activeTools: readonly string[];
}

export interface UpdateVoiceSessionInput {
  db: VoiceSessionDb;
  userId: string;
  providerSessionId: string;
  voice?: string | undefined;
  language?: string | null | undefined;
  pace?: number | undefined;
  lastTurnId?: string | undefined;
}

interface VoiceSessionRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  conversation_id: string;
  provider: string;
  provider_session_id: string;
  model_id: string;
  surface: VoiceSessionSurface;
  voice: string;
  language: string | null;
  pace: string | number;
  active_tools: unknown;
  last_turn_id: string | null;
  status: VoiceSessionStatus;
  close_reason: string | null;
  started_at: string;
  last_seen_at: string;
  closed_at: string | null;
}

const COLUMNS = `id, user_id, organization_id, conversation_id, provider, provider_session_id,
                 model_id, surface, voice, language, pace, active_tools, last_turn_id, status,
                 close_reason, started_at, last_seen_at, closed_at`;

export async function isVoiceSessionStoreReady(db: VoiceSessionDb): Promise<boolean> {
  const [row] = await db.query<{ ready: boolean }>(
    `select to_regclass('public.voice_sessions') is not null as ready`,
  );
  return row?.ready === true;
}

export function clampVoicePace(pace: number | null | undefined): number {
  if (typeof pace !== 'number' || !Number.isFinite(pace)) return VOICE_PACE_DEFAULT;
  return Math.min(VOICE_PACE_MAX, Math.max(VOICE_PACE_MIN, Math.round(pace * 100) / 100));
}

function toRecord(row: VoiceSessionRow): VoiceSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    conversationId: row.conversation_id,
    provider: row.provider,
    providerSessionId: row.provider_session_id,
    modelId: row.model_id,
    surface: row.surface,
    voice: row.voice,
    language: row.language,
    pace: clampVoicePace(Number(row.pace)),
    activeTools: Array.isArray(row.active_tools) ? row.active_tools.map(String) : [],
    lastTurnId: row.last_turn_id,
    status: row.status,
    closeReason: row.close_reason,
    startedAt: row.started_at,
    lastSeenAt: row.last_seen_at,
    closedAt: row.closed_at,
  };
}

export async function createVoiceSession(
  input: CreateVoiceSessionInput,
): Promise<VoiceSessionRecord | null> {
  const [row] = await input.db.query<VoiceSessionRow>(
    `insert into public.voice_sessions
       (id, user_id, organization_id, conversation_id, provider, provider_session_id, model_id,
        surface, voice, language, pace, active_tools)
     values ($12, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     on conflict (provider, provider_session_id) do nothing
     returning ${COLUMNS}`,
    [
      input.userId,
      input.organizationId,
      input.conversationId,
      input.provider,
      input.providerSessionId,
      input.modelId,
      input.surface,
      input.voice,
      input.language,
      clampVoicePace(input.pace),
      JSON.stringify([...input.activeTools]),
      input.id,
    ],
  );
  return row ? toRecord(row) : null;
}

export async function getActiveVoiceSessionForConversation(
  db: VoiceSessionDb,
  userId: string,
  conversationId: string,
): Promise<VoiceSessionRecord | null> {
  const [row] = await db.query<VoiceSessionRow>(
    `select ${COLUMNS}
       from public.voice_sessions
      where user_id = $1 and conversation_id = $2 and status = 'active'
      limit 1`,
    [userId, conversationId],
  );
  return row ? toRecord(row) : null;
}

export async function getVoiceSessionByProviderId(
  db: VoiceSessionDb,
  userId: string,
  providerSessionId: string,
): Promise<VoiceSessionRecord | null> {
  const [row] = await db.query<VoiceSessionRow>(
    `select ${COLUMNS}
       from public.voice_sessions
      where user_id = $1 and provider_session_id = $2
      limit 1`,
    [userId, providerSessionId],
  );
  return row ? toRecord(row) : null;
}

export async function updateVoiceSessionSettings(
  input: UpdateVoiceSessionInput,
): Promise<VoiceSessionRecord | null> {
  const [row] = await input.db.query<VoiceSessionRow>(
    `update public.voice_sessions
        set voice = coalesce($3, voice),
            language = case when $4::boolean then $5 else language end,
            pace = coalesce($6, pace),
            last_turn_id = coalesce($7, last_turn_id),
            last_seen_at = now()
      where user_id = $1 and provider_session_id = $2 and status = 'active'
      returning ${COLUMNS}`,
    [
      input.userId,
      input.providerSessionId,
      input.voice ?? null,
      input.language !== undefined,
      input.language ?? null,
      input.pace === undefined ? null : clampVoicePace(input.pace),
      input.lastTurnId ?? null,
    ],
  );
  return row ? toRecord(row) : null;
}

export async function closeVoiceSession(input: {
  db: VoiceSessionDb;
  userId: string;
  providerSessionId: string;
  reason: string;
  lastTurnId?: string | undefined;
}): Promise<VoiceSessionRecord | null> {
  const [row] = await input.db.query<VoiceSessionRow>(
    `update public.voice_sessions
        set status = 'closed',
            close_reason = $3,
            last_turn_id = coalesce($4, last_turn_id),
            closed_at = now(),
            last_seen_at = now()
      where user_id = $1 and provider_session_id = $2 and status = 'active'
      returning ${COLUMNS}`,
    [input.userId, input.providerSessionId, input.reason.slice(0, 64), input.lastTurnId ?? null],
  );
  return row ? toRecord(row) : null;
}

export async function touchVoiceSession(input: {
  db: VoiceSessionDb;
  userId: string;
  providerSessionId: string;
}): Promise<VoiceSessionRecord | null> {
  const [row] = await input.db.query<VoiceSessionRow>(
    `update public.voice_sessions
        set last_seen_at = now()
      where user_id = $1 and provider_session_id = $2 and status = 'active'
      returning ${COLUMNS}`,
    [input.userId, input.providerSessionId],
  );
  return row ? toRecord(row) : null;
}

/**
 * A session that outlived the block it could be billed for is over, whatever
 * the tab that opened it managed to report. Closing it here is what stops a
 * reconnect being handed a provider session that stopped existing hours ago,
 * and it closes at the end of that block, not now, so the voice minutes it
 * spent stop where its tab last renewed it.
 */
export async function closeExpiredVoiceSessions(input: {
  db: VoiceSessionDb;
  /** One user's sessions, or null for every user's on a sweep. */
  userId: string | null;
  maxOpenSeconds: number;
  limit?: number;
  reason?: string;
}): Promise<VoiceSessionRecord[]> {
  const rows = await input.db.query<VoiceSessionRow>(
    `update public.voice_sessions
        set status = 'closed',
            close_reason = $3,
            closed_at = least(now(), last_seen_at + make_interval(secs => $2)),
            last_seen_at = now()
      where id in (
        select id
          from public.voice_sessions
         where ($1::text is null or user_id = $1)
           and status = 'active'
           and last_seen_at <= now() - make_interval(secs => $2)
         order by last_seen_at
         limit $4
         for update skip locked
      )
      returning ${COLUMNS}`,
    [
      input.userId,
      Math.max(1, Math.trunc(input.maxOpenSeconds)),
      (input.reason ?? 'expired').slice(0, 64),
      Math.max(1, Math.trunc(input.limit ?? 100)),
    ],
  );
  return rows.map(toRecord);
}

/**
 * What the session is billed for. The client's report is a hint its tab can
 * lose: a dropped connection settles with whatever usage event last arrived,
 * which is none at all when the drop came first, so the record's own span is
 * what the account is answerable for.
 */
export function meteredVoiceSessionSeconds(
  record: Pick<VoiceSessionRecord, 'startedAt' | 'closedAt'>,
  reportedSeconds: number,
  nowMs: number,
): number {
  const startedAt = Date.parse(record.startedAt);
  if (!Number.isFinite(startedAt)) return reportedSeconds;
  const closedAt = record.closedAt ? Date.parse(record.closedAt) : Number.NaN;
  const endedAt = Number.isFinite(closedAt) ? closedAt : nowMs;
  const elapsed = Math.ceil(Math.max(0, endedAt - startedAt) / 1_000);
  return Math.max(elapsed, reportedSeconds);
}

/**
 * A conversation carries at most one open session, so a second device starting
 * one closes the session it replaces rather than racing the partial index. The
 * closed records come back so the caller settles what they used.
 */
export async function closeVoiceSessionsForConversation(input: {
  db: VoiceSessionDb;
  userId: string;
  conversationId: string;
  reason: string;
}): Promise<VoiceSessionRecord[]> {
  const rows = await input.db.query<VoiceSessionRow>(
    `update public.voice_sessions
        set status = 'closed', close_reason = $3, closed_at = now(), last_seen_at = now()
      where user_id = $1 and conversation_id = $2 and status = 'active'
      returning ${COLUMNS}`,
    [input.userId, input.conversationId, input.reason.slice(0, 64)],
  );
  return rows.map(toRecord);
}

export async function listVoiceSessionHistory(
  db: VoiceSessionDb,
  userId: string,
  limit = 50,
): Promise<VoiceSessionRecord[]> {
  const rows = await db.query<VoiceSessionRow>(
    `select ${COLUMNS}
       from public.voice_sessions
      where user_id = $1
      order by started_at desc
      limit $2`,
    [userId, Math.min(Math.max(limit, 1), 200)],
  );
  return rows.map(toRecord);
}
