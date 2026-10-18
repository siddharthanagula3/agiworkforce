import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { logSecurityEvent } from '@/lib/security-audit';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';

export interface RefusedRoleGrant {
  organizationId: string;
  granterUserId: string;
  subjectUserId: string | null;
  escalatedPermissions: readonly string[];
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

async function alertOnSelfEscalation(db: DatabaseAdapter, grant: RefusedRoleGrant): Promise<void> {
  const config = getHandoffConfig();
  const recipient =
    (await readAlertRecipient(db, grant.organizationId, grant.granterUserId)) ??
    config.fallbackEmail;
  const lines = [
    'A workspace member tried to grant themselves permissions they do not hold.',
    '',
    `Workspace: ${grant.organizationId}`,
    `Member: ${grant.granterUserId}`,
    `Permissions refused: ${grant.escalatedPermissions.join(', ')}`,
    '',
    'The grant was refused. Review this member in Settings › Workspace › Roles.',
  ];
  const text = lines.join('\n');
  const result = await sendSupportEmail({
    to: recipient,
    subject: 'Security alert: privilege escalation attempt refused',
    text,
    html: `<pre>${text.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)}</pre>`,
    idempotencyKey: `escalation:${grant.organizationId}:${grant.granterUserId}:${grant.escalatedPermissions.join('|')}`,
  });
  if (!result.delivered) {
    logger.error(
      { organizationId: grant.organizationId, reason: result.reason },
      '[authorization] self-escalation alert was not delivered',
    );
  }
}

// Runs after the grant is already refused, so a failure here is logged and
// never changes the answer the caller gets.
export async function reportRefusedRoleGrant(
  db: DatabaseAdapter,
  grant: RefusedRoleGrant,
): Promise<void> {
  const isSelfGrant = grant.subjectUserId === grant.granterUserId;
  try {
    await logSecurityEvent({
      userId: grant.granterUserId,
      eventType: 'suspicious_activity',
      severity: 'critical',
      details: {
        description: isSelfGrant
          ? 'privilege escalation: member attempted to grant themselves permissions they do not hold'
          : 'privilege escalation: member attempted to grant permissions they do not hold',
        organizationId: grant.organizationId,
        subjectUserId: grant.subjectUserId,
        escalatedPermissions: [...grant.escalatedPermissions],
      },
    });
    if (isSelfGrant) await alertOnSelfEscalation(db, grant);
  } catch (error) {
    logger.error(
      { error, organizationId: grant.organizationId },
      '[authorization] refused role grant could not be reported',
    );
  }
}
