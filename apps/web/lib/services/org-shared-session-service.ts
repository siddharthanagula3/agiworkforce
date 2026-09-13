import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import { resolveOrgMembership } from '@/lib/services/org-sharing-service';

/**
 * Who a conversation share is for (migration 0186). `public` is the 0051 rule,
 * knowledge of the token is the read grant. `organization` closes the anonymous
 * page and leaves the transcript readable only to members holding the grant row
 * in `organization_shared_sessions`. Expiry applies to both.
 */
export const SHARED_SESSION_VISIBILITIES = ['public', 'organization'] as const;

export type SharedSessionVisibility = (typeof SHARED_SESSION_VISIBILITIES)[number];

export const SHARE_TOKEN_REGEX = /^[A-Za-z0-9_-]{24}$/;

export function isSharedSessionVisibility(value: unknown): value is SharedSessionVisibility {
  return (
    typeof value === 'string' && (SHARED_SESSION_VISIBILITIES as readonly string[]).includes(value)
  );
}

export function toSharedSessionVisibility(value: unknown): SharedSessionVisibility {
  return value === 'organization' ? 'organization' : 'public';
}

export interface SharedSessionSummary {
  organizationId: string;
  sharedSessionId: string;
  token: string;
  title: string;
  messageCount: number;
  visibility: SharedSessionVisibility;
  ownerUserId: string;
  sharedByUserId: string;
  expiresAt: string;
  createdAt: string;
}

interface SharedSessionSummaryRow {
  organization_id: string;
  shared_session_id: string;
  token: string;
  title: string | null;
  total_messages: number | string | null;
  visibility: string;
  owner_user_id: string;
  shared_by_user_id: string;
  expires_at: string | Date;
  created_at: string | Date;
}

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

export function isConversationSharingSchemaUnavailable(error: unknown): boolean {
  let candidate: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!candidate || typeof candidate !== 'object') return false;
    const row = candidate as Record<string, unknown>;
    const code = row['code'];
    if (code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN) return true;
    candidate = row['cause'];
  }
  return false;
}

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function toCount(value: number | string | null): number {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function rowToSummary(row: SharedSessionSummaryRow): SharedSessionSummary {
  return {
    organizationId: row.organization_id,
    sharedSessionId: row.shared_session_id,
    token: row.token,
    title: row.title ?? 'Shared conversation',
    messageCount: toCount(row.total_messages),
    visibility: toSharedSessionVisibility(row.visibility),
    ownerUserId: row.owner_user_id,
    sharedByUserId: row.shared_by_user_id,
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at),
  };
}

const SUMMARY_COLUMNS = `share.organization_id,
            share.shared_session_id,
            share.shared_by_user_id,
            share.created_at,
            session.token,
            session.title,
            session.total_messages,
            session.visibility,
            session.expires_at,
            session.owner_id as owner_user_id`;

export async function listSharedSessions(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<SharedSessionSummary[]> {
  try {
    const rows = await db.query<SharedSessionSummaryRow>(
      `select ${SUMMARY_COLUMNS}
         from public.organization_shared_sessions share
         join public.shared_sessions session
           on session.id = share.shared_session_id
        where share.organization_id = $1
        order by share.created_at desc`,
      [organizationId],
    );
    return rows.map(rowToSummary);
  } catch (error) {
    if (isConversationSharingSchemaUnavailable(error)) return [];
    throw error;
  }
}

export interface ShareSessionInput {
  organizationId: string;
  sharedSessionId: string;
  actorUserId: string;
}

export async function shareSessionWithOrganization(
  db: DatabaseAdapter,
  input: ShareSessionInput,
): Promise<SharedSessionSummary> {
  const [row] = await db.query<SharedSessionSummaryRow>(
    `with grant_row as materialized (
       insert into public.organization_shared_sessions
         (organization_id, shared_session_id, shared_by_user_id)
       select $1, session.id, $3
         from public.shared_sessions session
        where session.id = $2
       on conflict (organization_id, shared_session_id) do update
          set shared_by_user_id = excluded.shared_by_user_id,
              updated_at = now()
       returning organization_id, shared_session_id, shared_by_user_id, created_at
     )
     select ${SUMMARY_COLUMNS}
       from grant_row share
       join public.shared_sessions session
         on session.id = share.shared_session_id`,
    [input.organizationId, input.sharedSessionId, input.actorUserId],
  );

  if (!row) {
    throw createError.notFound('Shared conversation not found');
  }
  return rowToSummary(row);
}

export async function unshareSessionFromOrganization(
  db: DatabaseAdapter,
  organizationId: string,
  sharedSessionId: string,
): Promise<boolean> {
  const rows = await db.query<{ shared_session_id: string }>(
    `delete from public.organization_shared_sessions
      where organization_id = $1
        and shared_session_id = $2
      returning shared_session_id`,
    [organizationId, sharedSessionId],
  );
  return rows.length > 0;
}

export interface OrgReadableSession {
  id: string;
  token: string;
  ownerUserId: string;
  title: string;
  modelId: string | null;
  provider: string | null;
  messages: unknown;
  messageCount: number;
  visibility: SharedSessionVisibility;
  expiresAt: string;
  createdAt: string;
}

function rowToSession(row: OrgReadableSessionRow): OrgReadableSession {
  return {
    id: row.id,
    token: row.token,
    ownerUserId: row.owner_id,
    title: row.title ?? 'Shared conversation',
    modelId: row.model_id,
    provider: row.provider,
    messages: row.messages,
    messageCount: toCount(row.total_messages),
    visibility: toSharedSessionVisibility(row.visibility),
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at),
  };
}

interface OrgReadableSessionRow {
  id: string;
  token: string;
  owner_id: string;
  title: string | null;
  model_id: string | null;
  provider: string | null;
  messages: unknown;
  total_messages: number | string | null;
  visibility?: string;
  expires_at: string | Date;
  created_at: string | Date;
}

const SESSION_COLUMNS = `id, token, owner_id, title, model_id, provider, messages,
              total_messages, visibility, expires_at, created_at`;

/**
 * The anonymous read: knowledge of the token is the read grant, and only for a
 * row whose audience is still `public`. A share aimed at a workspace never
 * serves here, even to somebody holding its link.
 *
 * The fallback covers an environment where 0186 has not been applied: the
 * column does not exist, every row is public by definition, and refusing every
 * link would be a worse answer than serving the 0051 behaviour.
 */
export async function getPublicSharedSessionByToken(
  db: DatabaseAdapter,
  token: string,
): Promise<OrgReadableSession | null> {
  if (!token || !SHARE_TOKEN_REGEX.test(token)) return null;
  let rows: OrgReadableSessionRow[];
  try {
    rows = await db.query<OrgReadableSessionRow>(
      `select ${SESSION_COLUMNS}
         from public.shared_sessions
        where token = $1
          and visibility = 'public'
        limit 1`,
      [token],
    );
  } catch (error) {
    if (!isConversationSharingSchemaUnavailable(error)) throw error;
    rows = await db.query<OrgReadableSessionRow>(
      `select id, token, owner_id, title, model_id, provider, messages,
              total_messages, expires_at, created_at
         from public.shared_sessions
        where token = $1
        limit 1`,
      [token],
    );
  }
  return rows[0] ? rowToSession(rows[0]) : null;
}

/**
 * The workspace-only read. The adapter is RLS-scoped, so the row comes back
 * only when the caller owns it or holds a grant through
 * `shared_sessions_org_shared_read` (0186). The statement adds no ownership
 * predicate of its own on purpose: repeating one here would hide whether the
 * database is actually enforcing the share.
 */
export async function getOrgReadableSessionByToken(
  db: DatabaseAdapter,
  token: string,
): Promise<OrgReadableSession | null> {
  if (!token || !SHARE_TOKEN_REGEX.test(token)) return null;
  let rows: OrgReadableSessionRow[];
  try {
    rows = await db.query<OrgReadableSessionRow>(
      `select ${SESSION_COLUMNS}
         from public.shared_sessions
        where token = $1
        limit 1`,
      [token],
    );
  } catch (error) {
    if (isConversationSharingSchemaUnavailable(error)) return null;
    throw error;
  }
  return rows[0] ? rowToSession(rows[0]) : null;
}

export interface SessionShareTarget {
  organizationId: string;
  sharedSessionId: string;
}

/**
 * Resolve the organization a conversation would be shared into: the caller's
 * active organization, and the share row they own under that token.
 */
export async function resolveSessionShareTarget(
  db: DatabaseAdapter,
  input: { userId: string; token: string },
): Promise<SessionShareTarget> {
  const membership = await resolveOrgMembership(db, input.userId);
  if (!membership) {
    throw createError.forbidden(
      'You are not a member of a workspace yet, so there is nobody to share this with.',
    );
  }
  const [row] = await db.query<{ id: string }>(
    `select id from public.shared_sessions
      where token = $1 and owner_id = $2
      limit 1`,
    [input.token, input.userId],
  );
  if (!row) {
    throw createError.notFound('Shared conversation not found');
  }
  return { organizationId: membership.organizationId, sharedSessionId: row.id };
}

/**
 * Move one of the caller's own conversation shares between audiences.
 *
 * Only the audience changes: the token, the transcript and the expiry are
 * untouched, so switching back restores the same URL on the same clock.
 */
export async function setSharedSessionVisibility(
  db: DatabaseAdapter,
  input: { userId: string; token: string; visibility: SharedSessionVisibility },
): Promise<{ token: string; visibility: SharedSessionVisibility; expiresAt: string } | null> {
  const userId = input.userId?.trim();
  const token = input.token?.trim();
  if (!userId || !token || !SHARE_TOKEN_REGEX.test(token)) return null;

  const rows = await db.query<{ token: string; visibility: string; expires_at: string | Date }>(
    `update public.shared_sessions
        set visibility = $3
      where token = $1 and owner_id = $2
      returning token, visibility, expires_at`,
    [token, userId, input.visibility],
  );
  const row = rows[0];
  return row
    ? {
        token: row.token,
        visibility: toSharedSessionVisibility(row.visibility),
        expiresAt: toIso(row.expires_at),
      }
    : null;
}
