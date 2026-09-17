import { addCsrfHeaders } from '@/lib/client/csrf';
import { collectDiagnostics } from '@/lib/support/diagnostics/collect';
import type { SupportTicket, SupportTicketReply, TicketStatus } from '@/lib/support/tickets/types';

const TICKETS_PATH = '/api/support/tickets';

export interface SupportTicketThread {
  ticket: SupportTicket;
  replies: SupportTicketReply[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * The route's own wording wins when it has one: a closed ticket, a transition
 * the lifecycle forbids and a validation failure each say something specific
 * that a generic sentence here would throw away.
 */
function failureMessage(payload: unknown, fallback: string): string {
  if (isRecord(payload) && isRecord(payload['error'])) {
    const message = (payload['error'] as Record<string, unknown>)['message'];
    if (typeof message === 'string' && message.trim().length > 0) return message;
  }
  return fallback;
}

async function request(
  path: string,
  init: RequestInit,
  fallback: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(path, { ...init, cache: 'no-store' });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(failureMessage(payload, fallback));
  if (!isRecord(payload)) throw new Error(fallback);
  return payload;
}

async function mutate(
  path: string,
  method: 'POST' | 'PATCH',
  body: Record<string, unknown>,
  fallback: string,
): Promise<Record<string, unknown>> {
  const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
  return request(path, { method, headers, body: JSON.stringify(body) }, fallback);
}

function ticketPath(ticketId: string): string {
  return `${TICKETS_PATH}/${encodeURIComponent(ticketId)}`;
}

function asThread(payload: Record<string, unknown>): SupportTicketThread {
  return {
    ticket: payload['ticket'] as SupportTicket,
    replies: Array.isArray(payload['replies']) ? (payload['replies'] as SupportTicketReply[]) : [],
  };
}

export async function listSupportTickets(): Promise<SupportTicket[]> {
  const payload = await request(
    TICKETS_PATH,
    { method: 'GET', headers: { Accept: 'application/json' } },
    'Your tickets could not be loaded.',
  );
  return Array.isArray(payload['tickets']) ? (payload['tickets'] as SupportTicket[]) : [];
}

export async function readSupportTicket(ticketId: string): Promise<SupportTicketThread> {
  const payload = await request(
    ticketPath(ticketId),
    { method: 'GET', headers: { Accept: 'application/json' } },
    'That ticket could not be opened.',
  );
  return asThread(payload);
}

export async function openSupportTicket(input: {
  subject: string;
  message: string;
}): Promise<SupportTicket> {
  // Build, environment, platform and the last few failures, collected rather
  // than asked for. The route re-validates and re-redacts whatever this sends.
  const payload = await mutate(
    TICKETS_PATH,
    'POST',
    { ...input, diagnostics: collectDiagnostics({ surface: 'web' }) },
    'That ticket was not raised.',
  );
  return payload['ticket'] as SupportTicket;
}

export async function replyToSupportTicket(
  ticketId: string,
  reply: string,
): Promise<SupportTicketThread> {
  const payload = await mutate(
    ticketPath(ticketId),
    'PATCH',
    { reply },
    'That reply was not added.',
  );
  return asThread(payload);
}

export async function moveSupportTicket(
  ticketId: string,
  status: TicketStatus,
): Promise<SupportTicket> {
  const payload = await mutate(
    ticketPath(ticketId),
    'PATCH',
    { status },
    'That ticket did not change.',
  );
  return payload['ticket'] as SupportTicket;
}
