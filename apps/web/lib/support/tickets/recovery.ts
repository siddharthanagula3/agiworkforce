import 'server-only';

import { accountAccessDecision } from '@/lib/auth/account-status';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import { readEnrolledAt } from '@/lib/server/account-security/store';
import { getIdentityProvider } from '@/lib/server/identity';
import { getNeonDb } from '@/lib/server/neon-db';
import { finishIntentRevocation, revokeEveryOtherSession } from '@/lib/server/session-revocation';
import { sendCustomerTicketEmail } from '@/lib/support/handoff/escalation-email';

import { openTicket, readTicketForStaff } from './service';
import {
  OPEN_TICKET_STATUSES,
  RECOVERY_FOLLOW_PATH,
  RECOVERY_TICKET_SUBJECT,
  type RecoveryAction,
  type RecoveryLoss,
} from '@agiworkforce/cloud-contracts/support';

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

  if ((await readEnrolledAt(getNeonDb(), profile.id)) !== null) {
    const { emitIdentitySecurityEvent } = await import('@/lib/services/identity-events');
    await emitIdentitySecurityEvent(getNeonDb(), {
      userId: profile.id,
      event: 'recovery_requested',
      request: input.request,
    });
    return;
  }

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

export class RecoveryTicketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryTicketError';
  }
}

export async function completeAccountRecovery(input: {
  ticketId: string;
  staffUserId: string;
  action: RecoveryAction;
  email?: string;
  request: Request;
}): Promise<{ sessionsEnded: number }> {
  const { ticket } = await readTicketForStaff(input.ticketId, input.staffUserId);
  if (ticket.subject !== RECOVERY_TICKET_SUBJECT) {
    throw new RecoveryTicketError('Only an account recovery request can restore access.');
  }
  if (!OPEN_TICKET_STATUSES.includes(ticket.status)) {
    throw new RecoveryTicketError('This recovery request is closed.');
  }
  if ((await readEnrolledAt(getNeonDb(), ticket.userId)) !== null) {
    throw new RecoveryTicketError(
      'This account has Advanced Account Security on. Support cannot restore access to it; the owner recovers with a recovery key.',
    );
  }

  const identity = getIdentityProvider();
  if (input.action === 'remove_second_factor') {
    await identity.removeSecondFactor(ticket.userId);
  } else {
    const email = input.email?.trim().toLowerCase();
    if (!email) throw new RecoveryTicketError('Enter the new sign-in email address.');
    const added = await identity.addEmailAddress(ticket.userId, email);
    const { emitIdentitySecurityEvent } = await import('@/lib/services/identity-events');
    await emitIdentitySecurityEvent(getNeonDb(), {
      userId: ticket.userId,
      event: 'email_changed',
      subjectRef: ticket.id,
      context: 'Support changed it while restoring access to the account.',
      detail: { source: 'support_recovery' },
    });
    await identity.setPrimaryEmailAddress(ticket.userId, added.id);
    await getNeonDb().query(`update public.profiles set email = $2 where id = $1`, [
      ticket.userId,
      email,
    ]);
  }

  const sweep = await revokeEveryOtherSession(identity, ticket.userId, null);

  await recordAuditEvent({
    userId: input.staffUserId,
    eventType: 'account_recovery_completed',
    request: input.request,
    severity: 'critical',
    detail: {
      resourceType: 'account',
      resourceId: ticket.userId,
      status: input.action,
      reason: `recovery ticket ${ticket.id}; ${sweep.ended.length} sessions ended`,
    },
  });

  if (!(await finishIntentRevocation(sweep, ticket.userId))) {
    throw new RecoveryTicketError(
      'Access was restored, but a signed-in device could not be signed out. Complete the recovery again to finish.',
    );
  }
  return { sessionsEnded: sweep.ended.length };
}
