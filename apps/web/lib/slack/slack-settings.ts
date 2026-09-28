import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  billingPlanCapabilityPlanLabels,
  canUseBillingPlanCapability,
  productLinkPath,
} from '@agiworkforce/types';

import { listWorkspaceMemberships } from '@/lib/services/active-workspace-service';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';

import { isSlackAppConfigured } from './slack-config';
import type { SlackLinkWorkspace, SlackOverview } from './slack-contract';
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

export const PERSONAL_WORKSPACE_NAME = 'Personal';

export async function listSlackLinkWorkspaces(
  db: DatabaseAdapter,
  userId: string,
): Promise<SlackLinkWorkspace[]> {
  const memberships = await listWorkspaceMemberships(db, userId);
  const workspaces = [
    { id: null, name: PERSONAL_WORKSPACE_NAME },
    ...memberships.map((membership) => ({ id: membership.id, name: membership.name })),
  ];
  return Promise.all(
    workspaces.map(async (workspace) => ({
      ...workspace,
      planAllowed: await slackPlanAllowed(db, userId, workspace.id),
    })),
  );
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
      taskPath: approval.agentRunId ? productLinkPath('work', approval.agentRunId) : null,
      requestedAt: approval.requestedAt,
      expiresAt: approval.expiresAt,
      toolCalls: approval.toolCalls,
    })),
  };
}
