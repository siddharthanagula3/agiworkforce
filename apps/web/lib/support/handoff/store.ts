
import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import type {
  HandoffAccountContext,
  HandoffAttemptedAction,
  HandoffCitation,
  HandoffReason,
  HandoffStatus,
  HandoffSurface,
  HandoffTranscriptTurn,
} from './types';

export interface HandoffSessionRow {
  id: string;
  reference_id: string;
  owner_user_id: string | null;
  owner_session_key: string;
  surface: HandoffSurface;
  reason: HandoffReason;
  status: HandoffStatus;
  contact_email: string;
  summary: string;
  transcript: HandoffTranscriptTurn[];
  attempted_actions: HandoffAttemptedAction[];
  citations: HandoffCitation[];
  account_context: HandoffAccountContext;
  page_path: string | null;
  locale: string | null;
  agent_user_id: string | null;
  agent_display_name?: string | null;
  wait_expires_at: string | null;
  connected_at: string | null;
  last_activity_at: string;
  closed_at: string | null;
  email_sent_at: string | null;
  email_provider_message_id: string | null;
  email_error: string | null;
  created_at: string;
}

export interface AgentPresenceRow {
  agent_user_id: string;
  display_name: string;
  status: 'online' | 'offline';
  max_concurrent_sessions: number;
  last_heartbeat_at: string | null;
}

export interface FreshAgentRow extends AgentPresenceRow {
  active_sessions: number;
}

const SESSION_COLUMNS = `id, reference_id, owner_user_id, owner_session_key, surface, reason,
  status, contact_email, summary, transcript, attempted_actions, citations, account_context,
  page_path, locale, agent_user_id, wait_expires_at, connected_at, last_activity_at, closed_at,
  email_sent_at, email_provider_message_id, email_error, created_at`;

export async function listFreshOnlineAgents(heartbeatTtlSeconds: number): Promise<FreshAgentRow[]> {
  const db = getNeonDb();
  return db.query<FreshAgentRow>(
    `select p.agent_user_id,
            p.display_name,
            p.status,
            p.max_concurrent_sessions,
            p.last_heartbeat_at,
            (select count(*)::int
               from public.support_handoff_sessions s
              where s.agent_user_id = p.agent_user_id
                and s.status = 'connected') as active_sessions
       from public.support_agent_presence p
      where p.status = 'online'
        and p.last_heartbeat_at is not null
        and p.last_heartbeat_at > now() - make_interval(secs => $1::double precision)`,
    [heartbeatTtlSeconds],
  );
}

export async function upsertAgentPresence(input: {
  agentUserId: string;
  displayName: string;
  status: 'online' | 'offline';
  maxConcurrentSessions: number;
}): Promise<AgentPresenceRow | null> {
  const db = getNeonDb();
  const rows = await db.query<AgentPresenceRow>(
    `insert into public.support_agent_presence
       (agent_user_id, display_name, status, max_concurrent_sessions, last_heartbeat_at, updated_at)
     values ($1, $2, $3, $4, now(), now())
     on conflict (agent_user_id) do update
       set display_name = excluded.display_name,
           status = excluded.status,
           max_concurrent_sessions = excluded.max_concurrent_sessions,
           last_heartbeat_at = now(),
           updated_at = now()
     returning agent_user_id, display_name, status, max_concurrent_sessions, last_heartbeat_at`,
    [input.agentUserId, input.displayName, input.status, input.maxConcurrentSessions],
  );
  return rows[0] ?? null;
}

export interface InsertSessionInput {
  referenceId: string;
  ownerUserId: string | null;
  ownerSessionKey: string;
  surface: HandoffSurface;
  reason: HandoffReason;
  status: Extract<HandoffStatus, 'waiting' | 'emailed' | 'undeliverable'>;
  contactEmail: string;
  summary: string;
  transcript: HandoffTranscriptTurn[];
  attemptedActions: HandoffAttemptedAction[];
  citations: HandoffCitation[];
  accountContext: HandoffAccountContext;
  pagePath: string | null;
  locale: string | null;
  waitExpiresAt: string | null;
}

export async function insertHandoffSession(
  input: InsertSessionInput,
): Promise<HandoffSessionRow | null> {
  const db = getNeonDb();
  const rows = await db.query<HandoffSessionRow>(
    `insert into public.support_handoff_sessions
       (reference_id, owner_user_id, owner_session_key, surface, reason, status, contact_email,
        summary, transcript, attempted_actions, citations, account_context, page_path, locale,
        wait_expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13,
             $14, $15)
     returning ${SESSION_COLUMNS}`,
    [
      input.referenceId,
      input.ownerUserId,
      input.ownerSessionKey,
      input.surface,
      input.reason,
      input.status,
      input.contactEmail,
      input.summary,
      JSON.stringify(input.transcript),
      JSON.stringify(input.attemptedActions),
      JSON.stringify(input.citations),
      JSON.stringify(input.accountContext),
      input.pagePath,
      input.locale,
      input.waitExpiresAt,
    ],
  );
  return rows[0] ?? null;
}

export async function getSessionForOwner(
  sessionId: string,
  ownerSessionKey: string,
): Promise<HandoffSessionRow | null> {
  const db = getNeonDb();
  const rows = await db.query<HandoffSessionRow>(
    `select ${SESSION_COLUMNS},
            (select display_name from public.support_agent_presence p
              where p.agent_user_id = s.agent_user_id) as agent_display_name
       from public.support_handoff_sessions s
      where s.id = $1 and s.owner_session_key = $2`,
    [sessionId, ownerSessionKey],
  );
  return rows[0] ?? null;
}

export async function getSessionById(sessionId: string): Promise<HandoffSessionRow | null> {
  const db = getNeonDb();
  const rows = await db.query<HandoffSessionRow>(
    `select ${SESSION_COLUMNS} from public.support_handoff_sessions where id = $1`,
    [sessionId],
  );
  return rows[0] ?? null;
}

export async function claimExpiredWaitingSession(
  sessionId: string,
): Promise<HandoffSessionRow | null> {
  const db = getNeonDb();
  const rows = await db.query<HandoffSessionRow>(
    `update public.support_handoff_sessions
        set status = 'timed_out_emailed', updated_at = now(), last_activity_at = now()
      where id = $1 and status = 'waiting' and wait_expires_at <= now()
      returning ${SESSION_COLUMNS}`,
    [sessionId],
  );
  return rows[0] ?? null;
}

export async function claimExpiredWaitingBatch(limit: number): Promise<HandoffSessionRow[]> {
  const db = getNeonDb();
  return db.query<HandoffSessionRow>(
    `update public.support_handoff_sessions
        set status = 'timed_out_emailed', updated_at = now(), last_activity_at = now()
      where id in (
        select id from public.support_handoff_sessions
         where status = 'waiting' and wait_expires_at <= now()
         order by wait_expires_at asc
         limit $1
         for update skip locked
      )
      returning ${SESSION_COLUMNS}`,
    [limit],
  );
}

export async function recordEmailOutcome(input: {
  sessionId: string;
  status: Extract<HandoffStatus, 'emailed' | 'timed_out_emailed' | 'undeliverable'>;
  providerMessageId: string | null;
  errorDetail: string | null;
}): Promise<void> {
  const db = getNeonDb();
  await db.execute(
    `update public.support_handoff_sessions
        set status = $2,
            email_sent_at = case when $2 = 'undeliverable' then email_sent_at else now() end,
            email_provider_message_id = $3,
            email_error = $4,
            updated_at = now()
      where id = $1`,
    [input.sessionId, input.status, input.providerMessageId, input.errorDetail],
  );
}

export async function cancelSessionForOwner(
  sessionId: string,
  ownerSessionKey: string,
): Promise<HandoffSessionRow | null> {
  const db = getNeonDb();
  const rows = await db.query<HandoffSessionRow>(
    `update public.support_handoff_sessions
        set status = 'cancelled', closed_at = now(), updated_at = now()
      where id = $1 and owner_session_key = $2 and status in ('waiting', 'connected')
      returning ${SESSION_COLUMNS}`,
    [sessionId, ownerSessionKey],
  );
  return rows[0] ?? null;
}

export async function listWaitingQueue(limit: number): Promise<HandoffSessionRow[]> {
  const db = getNeonDb();
  return db.query<HandoffSessionRow>(
    `select ${SESSION_COLUMNS}
       from public.support_handoff_sessions
      where status = 'waiting' and wait_expires_at > now()
      order by created_at asc
      limit $1`,
    [limit],
  );
}

export async function claimSessionForAgent(
  sessionId: string,
  agentUserId: string,
): Promise<HandoffSessionRow | null> {
  const db = getNeonDb();
  const rows = await db.query<HandoffSessionRow>(
    `update public.support_handoff_sessions
        set status = 'connected', agent_user_id = $2, connected_at = now(),
            last_activity_at = now(), updated_at = now()
      where id = $1 and status = 'waiting' and wait_expires_at > now()
      returning ${SESSION_COLUMNS}`,
    [sessionId, agentUserId],
  );
  return rows[0] ?? null;
}

export interface HandoffMessageRow {
  seq: string | number;
  author: 'user' | 'agent' | 'system';
  body: string;
  created_at: string;
}

export async function appendHandoffMessage(input: {
  sessionId: string;
  author: 'user' | 'agent' | 'system';
  body: string;
}): Promise<HandoffMessageRow | null> {
  const db = getNeonDb();
  const rows = await db.query<HandoffMessageRow>(
    `insert into public.support_handoff_messages (session_id, seq, author, body)
     select $1, coalesce(max(seq), 0) + 1, $2, $3
       from public.support_handoff_messages where session_id = $1
     returning seq, author, body, created_at`,
    [input.sessionId, input.author, input.body],
  );
  await db.execute(
    `update public.support_handoff_sessions set last_activity_at = now(), updated_at = now()
      where id = $1`,
    [input.sessionId],
  );
  return rows[0] ?? null;
}

export async function listHandoffMessages(
  sessionId: string,
  afterSeq: number,
  limit: number,
): Promise<HandoffMessageRow[]> {
  const db = getNeonDb();
  return db.query<HandoffMessageRow>(
    `select seq, author, body, created_at
       from public.support_handoff_messages
      where session_id = $1 and seq > $2
      order by seq asc
      limit $3`,
    [sessionId, afterSeq, limit],
  );
}

export async function closeIdleConnectedSessions(idleSeconds: number): Promise<number> {
  const db = getNeonDb();
  return db.execute(
    `update public.support_handoff_sessions
        set status = 'closed', closed_at = now(), updated_at = now()
      where status = 'connected'
        and last_activity_at < now() - make_interval(secs => $1::double precision)`,
    [idleSeconds],
  );
}

export async function purgeOldHandoffSessions(retentionDays: number): Promise<number> {
  const db = getNeonDb();
  return db.execute(
    `delete from public.support_handoff_sessions
      where created_at < now() - make_interval(days => $1::int)`,
    [retentionDays],
  );
}
