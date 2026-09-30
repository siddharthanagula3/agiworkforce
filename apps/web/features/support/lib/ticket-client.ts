import { addCsrfHeaders } from '@/lib/client/csrf';
import { collectDiagnostics } from '@/lib/support/diagnostics/collect';
import { DIAGNOSTICS_EXPORT_PATH, type DiagnosticsExport } from '@/lib/support/diagnostics/export';
import {
  type SupportDiagnostics,
  type OpenedSupportTicket,
  type SupportTicket,
  type SupportTicketReply,
  type SupportTicketThread,
  type TicketStatus,
  SUPPORT_APPEAL_PATH,
  SUPPORT_TICKETS_PATH,
  supportTicketPath,
} from '@agiworkforce/cloud-contracts/support';

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

function asThread(payload: Record<string, unknown>): SupportTicketThread {
  return {
    ticket: payload['ticket'] as SupportTicket,
    replies: Array.isArray(payload['replies']) ? (payload['replies'] as SupportTicketReply[]) : [],
  };
}

export async function listSupportTickets(): Promise<SupportTicket[]> {
  const payload = await request(
    SUPPORT_TICKETS_PATH,
    { method: 'GET', headers: { Accept: 'application/json' } },
    'Your tickets could not be loaded.',
  );
  return Array.isArray(payload['tickets']) ? (payload['tickets'] as SupportTicket[]) : [];
}

export async function readSupportTicket(ticketId: string): Promise<SupportTicketThread> {
  const payload = await request(
    supportTicketPath(ticketId),
    { method: 'GET', headers: { Accept: 'application/json' } },
    'That ticket could not be opened.',
  );
  return asThread(payload);
}

export async function reviewSupportDiagnostics(): Promise<DiagnosticsExport> {
  const payload = await mutate(
    DIAGNOSTICS_EXPORT_PATH,
    'POST',
    { diagnostics: collectDiagnostics({ surface: 'web' }) },
    'The diagnostics could not be prepared.',
  );
  const summary = payload['summary'];
  const filename = payload['filename'];
  const diagnostics = payload['diagnostics'];
  if (typeof summary !== 'string' || typeof filename !== 'string' || !isRecord(diagnostics)) {
    throw new Error('The diagnostics could not be prepared.');
  }
  return { summary, filename, diagnostics: diagnostics as unknown as SupportDiagnostics };
}

export async function openSupportTicket(input: {
  subject: string;
  message: string;
  includeDiagnostics: boolean;
  reviewedDiagnostics?: SupportDiagnostics | null;
}): Promise<OpenedSupportTicket> {
  // Build, environment, platform and the last few failures, collected rather
  // than asked for. The route re-validates and re-redacts whatever this sends.
  const diagnostics = input.includeDiagnostics
    ? (input.reviewedDiagnostics ?? collectDiagnostics({ surface: 'web' }))
    : null;
  const payload = await mutate(
    SUPPORT_TICKETS_PATH,
    'POST',
    { subject: input.subject, message: input.message, ...(diagnostics ? { diagnostics } : {}) },
    'That ticket was not raised.',
  );
  return {
    ticket: payload['ticket'] as SupportTicket,
    staffNotified: payload['staffNotified'] === true,
  };
}

export async function replyToSupportTicket(
  ticketId: string,
  reply: string,
): Promise<SupportTicketThread> {
  const payload = await mutate(
    supportTicketPath(ticketId),
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
    supportTicketPath(ticketId),
    'PATCH',
    { status },
    'That ticket did not change.',
  );
  return payload['ticket'] as SupportTicket;
}

function asAppeal(payload: Record<string, unknown>): SupportTicketThread | null {
  const appeal = payload['appeal'];
  return isRecord(appeal) && isRecord(appeal['ticket']) ? asThread(appeal) : null;
}

export async function readSuspensionAppeal(): Promise<SupportTicketThread | null> {
  const payload = await request(
    SUPPORT_APPEAL_PATH,
    { method: 'GET', headers: { Accept: 'application/json' } },
    'Your appeal could not be loaded.',
  );
  return asAppeal(payload);
}

export async function submitSuspensionAppeal(input: {
  message: string;
  email?: string;
}): Promise<SupportTicketThread | null> {
  const payload = await mutate(SUPPORT_APPEAL_PATH, 'POST', input, 'Your appeal was not sent.');
  return asAppeal(payload);
}
