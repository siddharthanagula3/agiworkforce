import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { billingPlanCapabilityPlanLabels, canUseBillingPlanCapability } from '@agiworkforce/types';

import { MEMBERSHIP_STATUSES_THAT_MAY_ACT } from '@/lib/server/workspace-scope';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';

import { isSlackAppConfigured } from './slack-config';
import type { SlackOverview } from './slack-contract';
import { listSlackWorkspacesInstalledBy } from './slack-installations';
import { listSlackAccountLinks } from './slack-links';
import { listPendingSlackApprovals } from './slack-runs';

export function slackRequiredPlans(): string {
  return billingPlanCapabilityPlanLabels('slack_app');
}

export async function slackPlanAllowed(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string | null,
): Promise<boolean> {
  const entitlement = await resolveEntitlementBundle(db, userId, {
    workspaceOrganizationId: organizationId,
  });
  return canUseBillingPlanCapability(entitlement.plan, 'slack_app');
}

export async function readWorkspaceName(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string | null,
): Promise<string | null> {
  if (!organizationId) return null;
  const [row] = await db.query<{ name: string }>(
    `select organization.name
       from organizations as organization
       join organization_members as member on member.organization_id = organization.id
      where organization.id = $1
        and member.user_id = $2
        and member.status = any($3::text[])
      limit 1`,
    [organizationId, userId, MEMBERSHIP_STATUSES_THAT_MAY_ACT],
  );
  return row?.name ?? null;
}

export async function loadSlackOverview(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string | null,
): Promise<SlackOverview> {
  const [planAllowed, installations, links, approvals] = await Promise.all([
    slackPlanAllowed(db, userId, organizationId),
    listSlackWorkspacesInstalledBy(db, userId),
    listSlackAccountLinks(db, userId),
    listPendingSlackApprovals(db, userId),
  ]);
  return {
    available: isSlackAppConfigured(),
    planAllowed,
    requiredPlans: slackRequiredPlans(),
    installations,
    links: links.map((link) => ({
      id: link.id,
      teamName: link.teamName,
      slackUserName: link.slackUserName,
      workspaceName: link.organizationName,
      linkedAt: link.linkedAt,
    })),
    approvals: approvals.map((approval) => ({
      runId: approval.runId,
      teamName: approval.teamName,
      surface: approval.surface,
      requestedAt: approval.requestedAt,
      expiresAt: approval.expiresAt,
      toolCalls: approval.toolCalls,
    })),
  };
}
