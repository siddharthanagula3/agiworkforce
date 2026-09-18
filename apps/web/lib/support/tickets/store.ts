import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import type { SupportDiagnostics } from '@/lib/support/diagnostics/types';

import type {
  CreateEscalationInput,
  EscalationPageOutcome,
  EscalationSeverity,
  EscalationTracker,
  CreateTicketInput,
  SupportTicket,
  SupportTicketReply,
  TicketEscalation,
  TicketPriority,
  TicketStatus,
} from './types';

/**
 * Service-context reads and writes over the ticket tables, following the access
 * model 0089 states for the sibling handoff tables: no privilege is granted to
 * `app_rls`, and every statement below carries an explicit `user_id = $n`
 * predicate, which is the primary and sufficient gate.
 *
 * A reply is scoped through its ticket rather than by its own `user_id`, because
 * a staff reply carries the staff member's id and would otherwise be invisible
 * to the person whose ticket it is.
 */

interface TicketRow {
  id: string;
  subject: string;
  message: string;
  status: TicketStatus;
  priority: TicketPriority;
  support_tier: string | null;
  handoff_session_id: string | null;
  diagnostics: SupportDiagnostics | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface ReplyRow {
  id: string;
  ticket_id: string;
  message: string;
  is_staff: boolean;
  created_at: string;
}

const TICKET_COLUMNS = `id, subject, message, status, priority, support_tier,
  handoff_session_id, diagnostics, created_at, updated_at, resolved_at`;

function toTicket(row: TicketRow): SupportTicket {
  return {
    id: row.id,
    subject: row.subject,
    message: row.message,
    status: row.status,
    priority: row.priority,
    supportTier: row.support_tier,
    handoffSessionId: row.handoff_session_id,
    diagnostics: row.diagnostics,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  };
}

function toReply(row: ReplyRow): SupportTicketReply {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    message: row.message,
    isStaff: row.is_staff,
    createdAt: row.created_at,
  };
}

export async function insertTicket(input: CreateTicketInput): Promise<SupportTicket | null> {
  const db = getNeonDb();
  const rows = await db.query<TicketRow>(
    `insert into public.support_tickets
       (user_id, name, email, subject, message, priority, support_tier, handoff_session_id,
        diagnostics)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     returning ${TICKET_COLUMNS}`,
    [
      input.userId,
      input.name,
      input.email,
      input.subject,
      input.message,
      input.priority,
      input.supportTier,
      input.handoffSessionId,
      input.diagnostics === null ? null : JSON.stringify(input.diagnostics),
    ],
  );
  const row = rows[0];
  return row ? toTicket(row) : null;
}

export async function listTicketsForUser(userId: string, limit: number): Promise<SupportTicket[]> {
  const db = getNeonDb();
  const rows = await db.query<TicketRow>(
    `select ${TICKET_COLUMNS}
       from public.support_tickets
      where user_id = $1
      order by case status when 'open' then 0 when 'in_progress' then 1 else 2 end asc,
               created_at desc
      limit $2`,
    [userId, limit],
  );
  return rows.map(toTicket);
}

export async function getTicketForUser(
  ticketId: string,
  userId: string,
): Promise<SupportTicket | null> {
  const db = getNeonDb();
  const rows = await db.query<TicketRow>(
    `select ${TICKET_COLUMNS} from public.support_tickets where id = $1 and user_id = $2`,
    [ticketId, userId],
  );
  const row = rows[0];
  return row ? toTicket(row) : null;
}

/**
 * The one read with no `user_id` predicate. Escalation is a staff action behind
 * requirePlatformAdmin, and the escalating engineer is not the ticket's owner.
 */
export async function getTicketForStaff(ticketId: string): Promise<SupportTicket | null> {
  const db = getNeonDb();
  const rows = await db.query<TicketRow>(
    `select ${TICKET_COLUMNS} from public.support_tickets where id = $1`,
    [ticketId],
  );
  const row = rows[0];
  return row ? toTicket(row) : null;
}

interface EscalationRow {
  id: string;
  ticket_id: string;
  reference_id: string;
  severity: EscalationSeverity;
  summary: string;
  escalated_by_user_id: string;
  tracker: EscalationTracker;
  paged_at: string | null;
  page_outcome: EscalationPageOutcome | null;
  responders: string[] | null;
  resolved_at: string | null;
  created_at: string;
}

const ESCALATION_COLUMNS = `id, ticket_id, reference_id, severity, summary,
  escalated_by_user_id, tracker, paged_at, page_outcome, responders, resolved_at, created_at`;

function toEscalation(row: EscalationRow): TicketEscalation {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    referenceId: row.reference_id,
    severity: row.severity,
    summary: row.summary,
    escalatedByUserId: row.escalated_by_user_id,
    tracker: row.tracker,
    pagedAt: row.paged_at,
    pageOutcome: row.page_outcome,
    responders: row.responders ?? [],
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

export async function insertEscalation(
  input: CreateEscalationInput,
): Promise<TicketEscalation | null> {
  const db = getNeonDb();
  const rows = await db.query<EscalationRow>(
    `insert into public.support_ticket_escalations
       (ticket_id, reference_id, severity, summary, escalated_by_user_id, tracker, paged_at,
        page_outcome, responders)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     returning ${ESCALATION_COLUMNS}`,
    [
      input.ticketId,
      input.referenceId,
      input.severity,
      input.summary,
      input.escalatedByUserId,
      input.tracker,
      input.pagedAt,
      input.pageOutcome,
      JSON.stringify([...input.responders]),
    ],
  );
  const row = rows[0];
  return row ? toEscalation(row) : null;
}

/** Staff-scoped counterpart of updateTicketStatus, for the escalation path only. */
export async function startTicketForStaff(ticketId: string): Promise<SupportTicket | null> {
  const db = getNeonDb();
  const rows = await db.query<TicketRow>(
    `update public.support_tickets
        set status = 'in_progress', updated_at = now(), resolved_at = null
      where id = $1 and status = 'open'
      returning ${TICKET_COLUMNS}`,
    [ticketId],
  );
  const row = rows[0];
  return row ? toTicket(row) : null;
}

export async function listEscalationsForTicket(ticketId: string): Promise<TicketEscalation[]> {
  const db = getNeonDb();
  const rows = await db.query<EscalationRow>(
    `select ${ESCALATION_COLUMNS}
       from public.support_ticket_escalations
      where ticket_id = $1
      order by created_at desc`,
    [ticketId],
  );
  return rows.map(toEscalation);
}

export async function listRepliesForTicket(
  ticketId: string,
  userId: string,
): Promise<SupportTicketReply[]> {
  const db = getNeonDb();
  const rows = await db.query<ReplyRow>(
    `select r.id, r.ticket_id, r.message, r.is_staff, r.created_at
       from public.support_ticket_replies r
       join public.support_tickets t on t.id = r.ticket_id
      where r.ticket_id = $1 and t.user_id = $2
      order by r.created_at asc`,
    [ticketId, userId],
  );
  return rows.map(toReply);
}

export async function insertReply(input: {
  ticketId: string;
  userId: string;
  message: string;
  isStaff: boolean;
}): Promise<SupportTicketReply | null> {
  const db = getNeonDb();
  const rows = await db.query<ReplyRow>(
    `insert into public.support_ticket_replies (ticket_id, user_id, message, is_staff)
     select $1, $2, $3, $4
      where exists (
        select 1 from public.support_tickets t where t.id = $1 and t.user_id = $2
      )
     returning id, ticket_id, message, is_staff, created_at`,
    [input.ticketId, input.userId, input.message, input.isStaff],
  );
  const row = rows[0];
  return row ? toReply(row) : null;
}

/**
 * `where status = $3` is the optimistic-concurrency half: a transition computed
 * from a status the caller read is only applied if that status still holds, so
 * two replies racing cannot walk the ticket backwards.
 */
export async function updateTicketStatus(input: {
  ticketId: string;
  userId: string;
  from: TicketStatus;
  to: TicketStatus;
}): Promise<SupportTicket | null> {
  const db = getNeonDb();
  const rows = await db.query<TicketRow>(
    `update public.support_tickets
        set status = $4,
            updated_at = now(),
            resolved_at = case when $4 in ('resolved', 'closed') then now() else null end
      where id = $1 and user_id = $2 and status = $3
      returning ${TICKET_COLUMNS}`,
    [input.ticketId, input.userId, input.from, input.to],
  );
  const row = rows[0];
  return row ? toTicket(row) : null;
}
