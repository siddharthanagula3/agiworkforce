import {
  SUPPORT_TICKETS_PATH,
  isTicketStatus,
  supportTicketPath,
  type SupportTicket,
  type SupportTicketReply,
  type TicketStatus,
} from '@agiworkforce/cloud-contracts/support';
import { api } from '@/services/api';
import { collectMobileDiagnostics } from '@/src/features/settings/diagnostics';

export type SupportTicketView = Pick<
  SupportTicket,
  'id' | 'subject' | 'message' | 'status' | 'createdAt' | 'updatedAt'
>;

export type SupportTicketReplyView = Pick<
  SupportTicketReply,
  'id' | 'message' | 'isStaff' | 'createdAt'
>;

export interface SupportTicketThreadView {
  ticket: SupportTicketView;
  replies: SupportTicketReplyView[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTicket(value: unknown): SupportTicketView | null {
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

function parseReply(value: unknown): SupportTicketReplyView | null {
  if (!isRecord(value)) return null;
  const { id, message, isStaff, createdAt } = value;
  if (typeof id !== 'string' || typeof message !== 'string' || typeof createdAt !== 'string') {
    return null;
  }
  return { id, message, isStaff: isStaff === true, createdAt };
}

function parseThread(value: unknown): SupportTicketThreadView {
  const ticket = isRecord(value) ? parseTicket(value['ticket']) : null;
  if (!ticket) throw new Error('The support service returned an unreadable ticket.');
  const replies = isRecord(value) && Array.isArray(value['replies']) ? value['replies'] : [];
  return {
    ticket,
    replies: replies
      .map(parseReply)
      .filter((reply): reply is SupportTicketReplyView => reply !== null),
  };
}

export function canReplyToTicket(status: TicketStatus): boolean {
  return status !== 'closed';
}

export async function listSupportTickets(signal?: AbortSignal): Promise<SupportTicketView[]> {
  const response = await api.get<unknown>(SUPPORT_TICKETS_PATH, signal ? { signal } : undefined);
  const tickets =
    isRecord(response) && Array.isArray(response['tickets']) ? response['tickets'] : [];
  return tickets.map(parseTicket).filter((ticket): ticket is SupportTicketView => ticket !== null);
}

export async function openSupportTicket(input: {
  subject: string;
  message: string;
  includeDiagnostics: boolean;
}): Promise<{ ticket: SupportTicketView; staffNotified: boolean }> {
  const response = await api.post<unknown>(SUPPORT_TICKETS_PATH, {
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
): Promise<SupportTicketThreadView> {
  const response = await api.get<unknown>(
    supportTicketPath(ticketId),
    signal ? { signal } : undefined,
  );
  return parseThread(response);
}

export async function replyToSupportTicket(
  ticketId: string,
  reply: string,
): Promise<SupportTicketThreadView> {
  const response = await api.patch<unknown>(supportTicketPath(ticketId), { reply });
  return parseThread(response);
}

export async function closeSupportTicket(ticketId: string): Promise<void> {
  await api.patch(supportTicketPath(ticketId), { status: 'closed' });
}
