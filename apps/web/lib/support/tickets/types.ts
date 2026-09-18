import type { SupportDiagnostics } from '@/lib/support/diagnostics/types';

/**
 * The durable record a support contact becomes.
 *
 * A live handoff is a session: it expires, and the retention sweep deletes it.
 * A ticket outlives it, which is what lets someone come back a week later with a
 * reference and be recognised. The two are linked rather than merged, so losing
 * the transcript to retention does not lose the ticket.
 */

export const MAX_TICKET_SUBJECT_CHARS = 200;
export const MAX_TICKET_MESSAGE_CHARS = 8_000;
export const MAX_TICKETS_LISTED = 50;

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/** Statuses a ticket can still be replied to in. */
export const OPEN_TICKET_STATUSES: readonly TicketStatus[] = ['open', 'in_progress', 'resolved'];

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && (TICKET_STATUSES as readonly string[]).includes(value);
}

export function isTicketPriority(value: unknown): value is TicketPriority {
  return typeof value === 'string' && (TICKET_PRIORITIES as readonly string[]).includes(value);
}

export interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  status: TicketStatus;
  priority: TicketPriority;
  supportTier: string | null;
  handoffSessionId: string | null;
  diagnostics: SupportDiagnostics | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export const MAX_ESCALATION_SUMMARY_CHARS = 4_000;

export const ESCALATION_SEVERITIES = ['p0', 'p1', 'p2', 'p3'] as const;
export const ESCALATION_TRACKERS = ['on-call', 'support-engineering'] as const;

export type EscalationSeverity = (typeof ESCALATION_SEVERITIES)[number];
export type EscalationTracker = (typeof ESCALATION_TRACKERS)[number];
export type EscalationPageOutcome = 'paged' | 'unconfigured' | 'failed';

const PRIORITY_SEVERITY: Readonly<Record<TicketPriority, EscalationSeverity>> = Object.freeze({
  urgent: 'p0',
  high: 'p1',
  normal: 'p2',
  low: 'p3',
});

/**
 * Severity is read off the contracted priority the ticket already carries, so a
 * page cannot be won by retyping a severity in the escalation form.
 */
export function severityForPriority(priority: TicketPriority): EscalationSeverity {
  return PRIORITY_SEVERITY[priority];
}

export function pagesOnCall(severity: EscalationSeverity): boolean {
  return severity === 'p0' || severity === 'p1';
}

export function isEscalationTracker(value: unknown): value is EscalationTracker {
  return typeof value === 'string' && (ESCALATION_TRACKERS as readonly string[]).includes(value);
}

export interface TicketEscalation {
  id: string;
  ticketId: string;
  referenceId: string;
  severity: EscalationSeverity;
  summary: string;
  escalatedByUserId: string;
  tracker: EscalationTracker;
  pagedAt: string | null;
  pageOutcome: EscalationPageOutcome | null;
  responders: readonly string[];
  resolvedAt: string | null;
  createdAt: string;
}

export interface CreateEscalationInput {
  ticketId: string;
  referenceId: string;
  severity: EscalationSeverity;
  summary: string;
  escalatedByUserId: string;
  tracker: EscalationTracker;
  pagedAt: string | null;
  pageOutcome: EscalationPageOutcome | null;
  responders: readonly string[];
}

export interface SupportTicketReply {
  id: string;
  ticketId: string;
  message: string;
  isStaff: boolean;
  createdAt: string;
}

export interface CreateTicketInput {
  userId: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  priority: TicketPriority;
  supportTier: string | null;
  handoffSessionId: string | null;
  diagnostics: SupportDiagnostics | null;
}

/**
 * A closed ticket is closed. Reopening is a new ticket with a reference to the
 * old one, not a status flipped back, because a ticket whose status walks
 * backwards makes every "time to resolution" number meaningless.
 */
export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false;
  if (from === 'closed') return false;
  if (from === 'resolved') return to === 'closed' || to === 'in_progress';
  return true;
}
