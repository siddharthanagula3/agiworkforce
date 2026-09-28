import 'server-only';

import { accountAccessDecision } from '@/lib/auth/account-status';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { sendCustomerTicketEmail } from '@/lib/support/handoff/escalation-email';

import { listTickets, openTicket, readTicket, replyToTicket } from './service';
import {
  APPEAL_FOLLOW_PATH,
  APPEAL_TICKET_SUBJECT,
  OPEN_TICKET_STATUSES,
  type SupportTicketThread,
} from '@agiworkforce/cloud-contracts/support';

export async function readLatestAppeal(userId: string): Promise<SupportTicketThread | null> {
  const appeal = (await listTickets(userId)).find(
    (ticket) => ticket.subject === APPEAL_TICKET_SUBJECT,
  );
  return appeal ? readTicket(appeal.id, userId) : null;
}

interface AppealProfileRow {
  id: string;
  email: string | null;
  account_status: string | null;
}

export class AppealContactMissingError extends Error {
  constructor() {
    super('The suspended account has no email address to reply to');
    this.name = 'AppealContactMissingError';
  }
}

async function readSuspendedProfile(
  clause: 'id' | 'email',
  value: string,
): Promise<AppealProfileRow | null> {
  const rows = (await getNeonDb().query(
    `select id, lower(email) as email, account_status
       from public.profiles
      where ${clause === 'id' ? 'id = $1' : 'lower(email) = lower($1)'}
      limit 1`,
    [value],
  )) as AppealProfileRow[];
  const profile = rows[0];
  if (!profile) return null;
  const decision = accountAccessDecision(profile.account_status);
  return decision.allowed || decision.reason !== 'suspended' ? null : profile;
}

async function appendToAppeal(
  profile: AppealProfileRow & { email: string },
  message: string,
): Promise<SupportTicketThread> {
  const latest = await readLatestAppeal(profile.id);
  if (latest && OPEN_TICKET_STATUSES.includes(latest.ticket.status)) {
    return replyToTicket({ ticketId: latest.ticket.id, userId: profile.id, message });
  }
  const { ticket } = await openTicket({
    userId: profile.id,
    name: profile.email,
    email: profile.email,
    subject: APPEAL_TICKET_SUBJECT,
    message,
  });
  return readTicket(ticket.id, profile.id);
}

export async function submitAccountAppeal(
  userId: string,
  message: string,
): Promise<SupportTicketThread> {
  const profile = await readSuspendedProfile('id', userId);
  if (!profile?.email) throw new AppealContactMissingError();
  return appendToAppeal({ ...profile, email: profile.email }, message);
}

export async function submitSignedOutAppeal(input: {
  email: string;
  message: string;
}): Promise<{ userId: string; ticketId: string } | null> {
  const profile = await readSuspendedProfile('email', input.email);
  if (!profile?.email) return null;
  const { ticket } = await appendToAppeal({ ...profile, email: profile.email }, input.message);

  const sent = await sendCustomerTicketEmail({
    to: profile.email,
    ticketId: ticket.id,
    subject: APPEAL_TICKET_SUBJECT,
    body: 'We received your appeal. A person reviews it and replies to this address.',
    followPath: APPEAL_FOLLOW_PATH,
    idempotencyKey: `support-appeal-received-${ticket.id}-${ticket.updatedAt}`,
  });
  if (!sent.delivered) {
    logger.error(
      { ticketId: ticket.id, reason: sent.reason },
      '[support-appeal] appellant was not emailed a receipt',
    );
  }
  return { userId: profile.id, ticketId: ticket.id };
}
