import { api } from '@/services/api';
import { collectMobileDiagnostics } from '@/src/features/settings/diagnostics';

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABEL: Readonly<Record<TicketStatus, string>> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const TICKET_STATUS_MEANING: Readonly<Record<TicketStatus, string>> = {
  open: 'Raised. Nobody on the support team has replied yet.',
  in_progress: 'The support team has picked this up.',
  resolved: 'Answered. Replying here reopens it if it is not actually fixed.',
  closed: 'Finished. Raise a new ticket and reference this one to carry on.',
};

export const MAX_TICKET_SUBJECT_CHARS = 200;
export const MAX_TICKET_MESSAGE_CHARS = 8_000;

export interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketReply {
  id: string;
  message: string;
  isStaff: boolean;
  createdAt: string;
}

export interface SupportTicketThread {
  ticket: SupportTicket;
  replies: SupportTicketReply[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && (TICKET_STATUSES as readonly string[]).includes(value);
}

function parseTicket(value: unknown): SupportTicket | null {
  if (!isRecord(value)) return null;
  const { id, subject, message, status, createdAt, updatedAt } = value;
  if (
    typeof id !== 'string' ||
    typeof subject !== 'string' ||
    typeof message !== 'string' ||
    !isTicketStatus(status) ||
    typeof createdAt !== 'string' ||
    typeof updatedAt !== 'string'
  ) {
    return null;
  }
  return { id, subject, message, status, createdAt, updatedAt };
}

function parseReply(value: unknown): SupportTicketReply | null {
  if (!isRecord(value)) return null;
  const { id, message, isStaff, createdAt } = value;
  if (typeof id !== 'string' || typeof message !== 'string' || typeof createdAt !== 'string') {
    return null;
  }
  return { id, message, isStaff: isStaff === true, createdAt };
}

function parseThread(value: unknown): SupportTicketThread {
  const ticket = isRecord(value) ? parseTicket(value['ticket']) : null;
  if (!ticket) throw new Error('The support service returned an unreadable ticket.');
  const replies = isRecord(value) && Array.isArray(value['replies']) ? value['replies'] : [];
  return {
    ticket,
    replies: replies.map(parseReply).filter((reply): reply is SupportTicketReply => reply !== null),
  };
}

export function canReplyToTicket(status: TicketStatus): boolean {
  return status !== 'closed';
}

export async function listSupportTickets(signal?: AbortSignal): Promise<SupportTicket[]> {
  const response = await api.get<unknown>('/api/support/tickets', signal ? { signal } : undefined);
  const tickets =
    isRecord(response) && Array.isArray(response['tickets']) ? response['tickets'] : [];
  return tickets.map(parseTicket).filter((ticket): ticket is SupportTicket => ticket !== null);
}

export async function openSupportTicket(input: {
  subject: string;
  message: string;
  includeDiagnostics: boolean;
}): Promise<{ ticket: SupportTicket; staffNotified: boolean }> {
  const response = await api.post<unknown>('/api/support/tickets', {
    subject: input.subject,
    message: input.message,
    ...(input.includeDiagnostics
      ? { diagnostics: collectMobileDiagnostics({ screen: 'support' }) }
      : {}),
  });
  const ticket = isRecord(response) ? parseTicket(response['ticket']) : null;
  if (!ticket) throw new Error('The support service returned an unreadable ticket.');
  return { ticket, staffNotified: isRecord(response) && response['staffNotified'] === true };
}

export async function readSupportTicket(
  ticketId: string,
  signal?: AbortSignal,
): Promise<SupportTicketThread> {
  const response = await api.get<unknown>(
    `/api/support/tickets/${encodeURIComponent(ticketId)}`,
    signal ? { signal } : undefined,
  );
  return parseThread(response);
}

export async function replyToSupportTicket(
  ticketId: string,
  reply: string,
): Promise<SupportTicketThread> {
  const response = await api.patch<unknown>(
    `/api/support/tickets/${encodeURIComponent(ticketId)}`,
    { reply },
  );
  return parseThread(response);
}

export async function closeSupportTicket(ticketId: string): Promise<void> {
  await api.patch(`/api/support/tickets/${encodeURIComponent(ticketId)}`, { status: 'closed' });
}
