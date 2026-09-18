import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  detectPermissionEscalation,
  ENTERPRISE_DENIAL_STAGE,
  type OrganizationPermission,
  type SelfEscalationAttempt,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { logSecurityEvent, logAuthorizationFailure } from '@/lib/security-audit';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { EnterpriseDenialError } from '@/lib/authorization/denial';

export interface EscalationCheck {
  db: DatabaseAdapter;
  organizationId: string;
  granterUserId: string;
  subjectUserId: string;
  granterPermissions: Iterable<OrganizationPermission>;
  requestedPermissions: Iterable<OrganizationPermission>;
  request?: Request;
}

async function readAlertRecipient(
  db: DatabaseAdapter,
  organizationId: string,
  excludeUserId: string,
): Promise<string | null> {
  const [row] = await db.query<{ email: string | null }>(
    `select p.email
       from public.organization_members m
       join public.profiles p on p.id = m.user_id
      where m.organization_id = $1
        and m.role = 'owner'
        and m.user_id <> $2
        and p.email is not null
      limit 1`,
    [organizationId, excludeUserId],
  );
  return row?.email ?? null;
}

// Delivery is best-effort and never decides the request: the grant is already
// refused by the time this runs, so an unreachable mailbox must not 500.
async function alertOnSelfEscalation(
  db: DatabaseAdapter,
  organizationId: string,
  attempt: SelfEscalationAttempt,
): Promise<void> {
  try {
    const config = getHandoffConfig();
    const recipient =
      (await readAlertRecipient(db, organizationId, attempt.granterUserId)) ?? config.fallbackEmail;
    const lines = [
      'A workspace member tried to grant themselves permissions they do not hold.',
      '',
      `Workspace: ${organizationId}`,
      `Member: ${attempt.granterUserId}`,
      `Permissions refused: ${attempt.escalatedPermissions.join(', ')}`,
      '',
      'The grant was refused. Review this member in Settings › Workspace › Roles.',
    ];
    const text = lines.join('\n');
    const result = await sendSupportEmail({
      to: recipient,
      subject: 'Security alert: privilege escalation attempt refused',
      text,
      html: `<pre>${text.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)}</pre>`,
      idempotencyKey: `escalation:${organizationId}:${attempt.granterUserId}:${attempt.escalatedPermissions.join('|')}`,
    });
    if (!result.delivered) {
      logger.error(
        { organizationId, reason: result.reason },
        '[authorization] self-escalation alert was not delivered',
      );
    }
  } catch (error) {
    logger.error({ error, organizationId }, '[authorization] self-escalation alert failed');
  }
}

// The WITH CHECK of both grant tables enforces the same rule. This runs first
// so the refusal carries a message, an audit record and an alert.
export async function assertNoPermissionEscalation(
  check: EscalationCheck,
): Promise<SelfEscalationAttempt | null> {
  const attempt = detectPermissionEscalation({
    granterUserId: check.granterUserId,
    subjectUserId: check.subjectUserId,
    granterPermissions: check.granterPermissions,
    requestedPermissions: check.requestedPermissions,
  });
  if (!attempt) return null;

  await logSecurityEvent({
    userId: attempt.granterUserId,
    eventType: 'suspicious_activity',
    severity: 'critical',
    ...(check.request ? { endpoint: new URL(check.request.url).pathname } : {}),
    details: {
      description: attempt.isSelfGrant
        ? 'privilege escalation: member attempted to grant themselves permissions they do not hold'
        : 'privilege escalation: member attempted to grant permissions they do not hold',
      organizationId: check.organizationId,
      subjectUserId: attempt.subjectUserId,
      escalatedPermissions: [...attempt.escalatedPermissions],
    },
  });

  if (check.request) {
    await logAuthorizationFailure(
      check.request,
      'organization_role_grant',
      'grant',
      attempt.granterUserId,
    );
  }

  if (attempt.isSelfGrant) {
    await alertOnSelfEscalation(check.db, check.organizationId, attempt);
  }

  throw new EnterpriseDenialError({
    code: 'self_escalation_denied',
    stage: ENTERPRISE_DENIAL_STAGE.self_escalation_denied,
    message: 'You cannot grant permissions you do not hold yourself.',
    organizationId: check.organizationId,
    policyRevision: 0,
    blockingRule: attempt.escalatedPermissions.join(','),
  });
}
