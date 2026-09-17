import type { SupportDiagnostics } from '@/lib/support/diagnostics/types';

/**
 * The durable record a support contact becomes.
 *
 * A live handoff is a session: it expires, and the retention sweep deletes it.
 * A ticket outlives it, which is what lets someone come back a week later with a
 * reference and be recognised. The two are linked rather than merged, so losing
 * the transcript to retention does not lose the ticket.
 */

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
