import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { isOrganizationAdminRole, type OrganizationRole } from '@agiworkforce/types';
import { formatCurrency } from '@agiworkforce/utils';

import { logger } from '@/lib/logger';
import { recordNotification } from '@/lib/services/notification-service';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordAuditEvent } from '@/lib/security-audit';
import { sendSpendAlertEmail } from '@/lib/services/notification-email-service';
import type { SpendState } from '@/lib/services/spend-limit-service';

export type SpendAlertKind = 'threshold' | 'cap';

export type SpendAlertOutcome =
  | { dispatched: false; reason: 'not_due' | 'already_sent' }
  | { dispatched: true; kind: SpendAlertKind; recipientsNotified: number };

export function dueSpendAlertKind(state: SpendState): SpendAlertKind | null {
  if (!state.configured || state.enforcement === 'off' || state.monthlyCapCents === null) {
    return null;
  }
  if (state.overCap) return 'cap';
  if (state.overThreshold) return 'threshold';
  return null;
}

interface AdminRecipientRow {
  user_id: string;
  role: OrganizationRole;
  email: string | null;
  workspace_name: string | null;
}

function centsToDisplay(cents: number): string {
  return formatCurrency(cents / 100, 'USD', 'en-US');
}

export async function dispatchSpendAlertIfDue(
  organizationId: string,
  state: SpendState,
  db: DatabaseAdapter = getNeonDb(),
): Promise<SpendAlertOutcome> {
  const kind = dueSpendAlertKind(state);
  if (!kind || state.monthlyCapCents === null || state.enforcement === 'off') {
    return { dispatched: false, reason: 'not_due' };
  }
  const enforcement = state.enforcement;
  const cap = state.monthlyCapCents;

  const claimed = await db.query<{ period_start: string }>(
    `insert into public.organization_spend_alerts
       (organization_id, period_start, kind, enforcement, spent_cents, monthly_cap_cents, alert_threshold_pct)
     values ($1::uuid, date_trunc('month', now())::date, $2, $3, $4, $5, $6)
     on conflict (organization_id, period_start, kind) do nothing
     returning to_char(period_start, 'YYYY-MM-DD') as period_start`,
    [
      organizationId,
      kind,
      enforcement,
      Math.max(0, Math.round(state.spentCents)),
      cap,
      state.alertThresholdPct,
    ],
  );
  const periodKey = claimed[0]?.period_start;
  if (periodKey === undefined) return { dispatched: false, reason: 'already_sent' };

  await recordAuditEvent({
    organizationId,
    eventType: 'spend_cap_exceeded',
    outcome: 'success',
    severity: kind === 'cap' ? 'critical' : 'warning',
    surface: 'spend_limit',
    detail: {
      resourceType: 'organization_spend_limit',
      resourceId: organizationId,
      status: kind === 'cap' ? 'cap_reached' : 'threshold_reached',
      scope: enforcement,
      count: Math.round(state.spentCents),
    },
  }).catch((error) => {
    logger.error(
      { error, organizationId, kind },
      '[spend-alert] audit event could not be recorded',
    );
  });

  const members = await db.query<AdminRecipientRow>(
    `select m.user_id, m.role, p.email, o.name as workspace_name
       from public.organization_members m
       join public.organizations o on o.id = m.organization_id
       left join public.profiles p on p.id = m.user_id
      where m.organization_id = $1::uuid`,
    [organizationId],
  );
  await Promise.all(
    members
      .filter((member) => isOrganizationAdminRole(member.role))
      .map((member) =>
        recordNotification(db, {
          userId: member.user_id,
          category: 'billing',
          severity: kind === 'cap' ? 'error' : 'warning',
          title:
            kind === 'cap'
              ? `${member.workspace_name ?? 'Your workspace'} reached its monthly spend limit`
              : `${member.workspace_name ?? 'Your workspace'} passed ${state.alertThresholdPct}% of its monthly spend limit`,
          message:
            kind === 'cap' && enforcement === 'block'
              ? 'Managed Cloud requests from members are refused until the limit is raised or the month resets.'
              : 'Review or change the limit in the workspace console under Spend limit.',
          dedupeKey: `spend-alert:${organizationId}:${periodKey}:${kind}`,
        }),
      ),
  );

  const recipients = members.filter(
    (member): member is AdminRecipientRow & { email: string } =>
      isOrganizationAdminRole(member.role) && typeof member.email === 'string',
  );

  const spent = centsToDisplay(state.spentCents);
  const capDisplay = centsToDisplay(cap);
  const results = await Promise.all(
    recipients.map((recipient) =>
      sendSpendAlertEmail({
        to: recipient.email,
        workspaceName: recipient.workspace_name ?? 'Your workspace',
        kind,
        enforcement,
        spent,
        cap: capDisplay,
        thresholdPct: state.alertThresholdPct,
        idempotencyKey: `spend-alert:${organizationId}:${periodKey}:${kind}:${recipient.user_id}`,
      }).catch((error) => {
        logger.warn({ error, organizationId, kind }, '[spend-alert] email send threw');
        return null;
      }),
    ),
  );
  const recipientsNotified = results.filter((result) => result?.delivered === true).length;

  await db.execute(
    `update public.organization_spend_alerts
        set recipients_notified = $4
      where organization_id = $1::uuid and period_start = $2::date and kind = $3`,
    [organizationId, periodKey, kind, recipientsNotified],
  );

  logger.info(
    { organizationId, kind, enforcement, recipients: recipients.length, recipientsNotified },
    '[spend-alert] workspace spend limit crossing announced',
  );
  return { dispatched: true, kind, recipientsNotified };
}
