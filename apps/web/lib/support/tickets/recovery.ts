import 'server-only';

import { accountAccessDecision } from '@/lib/auth/account-status';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { sendCustomerTicketEmail } from '@/lib/support/handoff/escalation-email';

import { openTicket } from './service';
import { RECOVERY_FOLLOW_PATH, RECOVERY_TICKET_SUBJECT } from './types';

export const RECOVERY_LOSSES = ['password', 'email', 'factor'] as const;

export type RecoveryLoss = (typeof RECOVERY_LOSSES)[number];

const LOSS_COPY: Readonly<Record<RecoveryLoss, string>> = {
  password: 'The password, and the emailed reset did not work',
  email: 'Access to the email address on the account',
  factor: 'The two-factor device and its backup codes',
};

interface RecoveryProfileRow {
  id: string;
  account_status: string | null;
}

export async function submitAccountRecoveryRequest(input: {
  accountEmail: string;
  contactEmail: string;
  lost: RecoveryLoss;
  details: string;
  request: Request;
}): Promise<void> {
  const rows = await getNeonDb().query<RecoveryProfileRow>(
    `select id, account_status
       from public.profiles
      where lower(email) = lower($1)
      limit 1`,
    [input.accountEmail],
  );
  const profile = rows[0];
  if (!profile) return;
  const decision = accountAccessDecision(profile.account_status);
  if (!decision.allowed && decision.reason === 'deleted') return;

  const message = [
    `Lost: ${LOSS_COPY[input.lost]}`,
    `Account email: ${input.accountEmail}`,
    `Reply to: ${input.contactEmail}`,
    '',
    input.details,
  ].join('\n');

  const { ticket } = await openTicket({
    userId: profile.id,
    name: input.contactEmail,
    email: input.contactEmail,
    subject: RECOVERY_TICKET_SUBJECT,
    message,
  });

  const { emitIdentitySecurityEvent } = await import('@/lib/services/identity-events');
  await emitIdentitySecurityEvent(getNeonDb(), {
    userId: profile.id,
    event: 'recovery_requested',
    subjectRef: ticket.id,
    request: input.request,
  });

  const sent = await sendCustomerTicketEmail({
    to: input.contactEmail,
    ticketId: ticket.id,
    subject: RECOVERY_TICKET_SUBJECT,
    body: 'We received your account recovery request. A person checks that the account is yours before restoring access, and replies to this address.',
    followPath: RECOVERY_FOLLOW_PATH,
    idempotencyKey: `support-recovery-received-${ticket.id}`,
  });
  if (!sent.delivered) {
    logger.error(
      { ticketId: ticket.id, reason: sent.reason },
      '[support-recovery] requester was not emailed a receipt',
    );
  }
}
