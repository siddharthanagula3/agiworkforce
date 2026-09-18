import 'server-only';

import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { redactSecrets } from '@/lib/support/handoff/transcript';
import { resolveSupportPriority } from '@/lib/support/handoff/priority';
import type { SupportDiagnostics } from '@/lib/support/diagnostics/types';

import { notifyIncident } from '@/lib/server/incident/dispatch';
import { generateReferenceId } from '@/lib/support/handoff/reference-id';

import {
  getTicketForStaff,
  getTicketForUser,
  insertEscalation,
  insertReply,
  insertTicket,
  listEscalationsForTicket,
  listRepliesForTicket,
  listTicketsForUser,
  startTicketForStaff,
  updateTicketStatus,
} from './store';
import {
  MAX_ESCALATION_SUMMARY_CHARS,
  MAX_TICKETS_LISTED,
  MAX_TICKET_MESSAGE_CHARS,
  MAX_TICKET_SUBJECT_CHARS,
  OPEN_TICKET_STATUSES,
  canTransition,
  pagesOnCall,
  severityForPriority,
  type EscalationTracker,
  type SupportTicket,
  type SupportTicketReply,
  type TicketEscalation,
  type TicketStatus,
} from './types';

export {
  MAX_ESCALATION_SUMMARY_CHARS,
  MAX_TICKETS_LISTED,
  MAX_TICKET_MESSAGE_CHARS,
  MAX_TICKET_SUBJECT_CHARS,
} from './types';

export class TicketNotFoundError extends Error {
  constructor() {
    super('No such ticket');
    this.name = 'TicketNotFoundError';
  }
}

export class TicketClosedError extends Error {
  constructor() {
    super('This ticket is closed');
    this.name = 'TicketClosedError';
  }
}

export class EmptyEscalationSummaryError extends Error {
  constructor() {
    super('An escalation needs a summary engineering can act on');
    this.name = 'EmptyEscalationSummaryError';
  }
}

export class InvalidTicketTransitionError extends Error {
  constructor(from: TicketStatus, to: TicketStatus) {
    super(`A ticket cannot move from ${from} to ${to}`);
    this.name = 'InvalidTicketTransitionError';
  }
}

function clamp(value: string, limit: number): string {
  const redacted = redactSecrets(value.trim());
  return redacted.length <= limit ? redacted : `${redacted.slice(0, limit)}… [truncated]`;
}

export interface OpenTicketInput {
  userId: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  handoffSessionId?: string | null;
  diagnostics?: SupportDiagnostics | null;
}

/**
 * Priority is resolved from the contracted support tier here, exactly as it is
 * for a live escalation, so the two queues agree on who is waiting for what. A
 * ticket raised by someone with no contract is `normal`.
 */
export async function openTicket(input: OpenTicketInput): Promise<SupportTicket> {
  const { priority, supportTier } = await resolveSupportPriority(getNeonDb(), input.userId);

  const ticket = await insertTicket({
    userId: input.userId,
    name: input.name,
    email: input.email,
    subject: clamp(input.subject, MAX_TICKET_SUBJECT_CHARS),
    message: clamp(input.message, MAX_TICKET_MESSAGE_CHARS),
    priority,
    supportTier,
    handoffSessionId: input.handoffSessionId ?? null,
    diagnostics: input.diagnostics ?? null,
  });

  if (!ticket) {
    throw new Error('Failed to persist support ticket');
  }

  logger.info(
    { ticketId: ticket.id, priority, fromHandoff: ticket.handoffSessionId !== null },
    '[support-ticket] opened',
  );
  return ticket;
}

export function listTickets(userId: string, limit = MAX_TICKETS_LISTED): Promise<SupportTicket[]> {
  return listTicketsForUser(userId, Math.min(Math.max(limit, 1), MAX_TICKETS_LISTED));
}

export interface TicketThread {
  ticket: SupportTicket;
  replies: SupportTicketReply[];
}

export async function readTicket(ticketId: string, userId: string): Promise<TicketThread> {
  const ticket = await getTicketForUser(ticketId, userId);
  if (!ticket) throw new TicketNotFoundError();
  const replies = await listRepliesForTicket(ticketId, userId);
  return { ticket, replies };
}

/**
 * A reply on a resolved ticket reopens it. That is the behaviour a person
 * expects when they answer "did this fix it?" with "no", and leaving the ticket
 * resolved would hide them from the queue they need to be in.
 */
export async function replyToTicket(input: {
  ticketId: string;
  userId: string;
  message: string;
  isStaff?: boolean;
}): Promise<TicketThread> {
  const ticket = await getTicketForUser(input.ticketId, input.userId);
  if (!ticket) throw new TicketNotFoundError();
  if (!OPEN_TICKET_STATUSES.includes(ticket.status)) throw new TicketClosedError();

  const reply = await insertReply({
    ticketId: input.ticketId,
    userId: input.userId,
    message: clamp(input.message, MAX_TICKET_MESSAGE_CHARS),
    isStaff: input.isStaff ?? false,
  });
  if (!reply) throw new TicketNotFoundError();

  if (ticket.status === 'resolved') {
    await updateTicketStatus({
      ticketId: input.ticketId,
      userId: input.userId,
      from: 'resolved',
      to: 'in_progress',
    });
  }

  return readTicket(input.ticketId, input.userId);
}

export interface EscalateTicketInput {
  ticketId: string;
  escalatedByUserId: string;
  summary: string;
  tracker?: EscalationTracker;
}

/**
 * Carries a ticket out of the support queue and into engineering. A p0 or p1
 * pages the on-call rotation through the same dispatch an incident uses, so a
 * contracted customer's outage reaches a human rather than a second queue.
 */
export async function escalateTicket(input: EscalateTicketInput): Promise<TicketEscalation> {
  const ticket = await getTicketForStaff(input.ticketId);
  if (!ticket) throw new TicketNotFoundError();
  if (ticket.status === 'closed') throw new TicketClosedError();

  const summary = clamp(input.summary, MAX_ESCALATION_SUMMARY_CHARS);
  if (summary.length === 0) throw new EmptyEscalationSummaryError();

  const severity = severityForPriority(ticket.priority);
  const tracker: EscalationTracker =
    input.tracker ?? (pagesOnCall(severity) ? 'on-call' : 'support-engineering');
  const referenceId = generateReferenceId();

  let pagedAt: string | null = null;
  let pageOutcome: TicketEscalation['pageOutcome'] = null;
  let responders: readonly string[] = [];

  if (pagesOnCall(severity)) {
    const dispatch = await notifyIncident({
      key: `support-ticket:${ticket.id}`,
      severity: severity === 'p0' ? 'critical' : 'warning',
      subject: `[AGI Support] ${severity.toUpperCase()} ${referenceId} · ${ticket.subject}`,
      text: [
        `Reference: ${referenceId}`,
        `Ticket: ${ticket.id}`,
        `Priority: ${ticket.priority}${ticket.supportTier ? ` (${ticket.supportTier})` : ''}`,
        `Raised: ${ticket.createdAt}`,
        '',
        summary,
      ].join('\n'),
      source: 'support-ticket-escalation',
    });
    pagedAt = new Date().toISOString();
    pageOutcome = dispatch.paged;
    responders = dispatch.notified;
  }

  const escalation = await insertEscalation({
    ticketId: ticket.id,
    referenceId,
    severity,
    summary,
    escalatedByUserId: input.escalatedByUserId,
    tracker,
    pagedAt,
    pageOutcome,
    responders,
  });
  if (!escalation) throw new Error('Failed to persist support escalation');

  if (ticket.status === 'open') await startTicketForStaff(ticket.id);

  logger.info(
    {
      ticketId: ticket.id,
      referenceId,
      severity,
      tracker,
      paged: pageOutcome,
      responderCount: responders.length,
    },
    '[support-ticket] escalated to engineering',
  );
  return escalation;
}

export function readEscalations(ticketId: string): Promise<TicketEscalation[]> {
  return listEscalationsForTicket(ticketId);
}

export async function moveTicket(input: {
  ticketId: string;
  userId: string;
  to: TicketStatus;
}): Promise<SupportTicket> {
  const ticket = await getTicketForUser(input.ticketId, input.userId);
  if (!ticket) throw new TicketNotFoundError();
  if (!canTransition(ticket.status, input.to)) {
    throw new InvalidTicketTransitionError(ticket.status, input.to);
  }

  const moved = await updateTicketStatus({
    ticketId: input.ticketId,
    userId: input.userId,
    from: ticket.status,
    to: input.to,
  });
  // The row changed under us between the read and the write, which means
  // somebody else already moved it. Report the current state rather than
  // retrying into a race.
  if (!moved) throw new InvalidTicketTransitionError(ticket.status, input.to);

  logger.info(
    { ticketId: moved.id, from: ticket.status, to: input.to },
    '[support-ticket] status changed',
  );
  return moved;
}
