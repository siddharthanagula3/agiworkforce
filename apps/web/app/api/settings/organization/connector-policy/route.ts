import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  UpdateConnectorPolicyRequestSchema,
  normalizeWebDomain,
  type ConnectorPolicyResponse,
  type WorkspaceConnectorToolRule,
} from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { requireOrgMember, resolveOrgMembership } from '@/lib/services/org-sharing-service';
import {
  requireMemberPermission,
  resolveOrganizationPermissions,
} from '@/lib/services/organization-permission-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import {
  diffConnectorPolicy,
  readConnectorPolicy,
  upsertConnectorPolicy,
  type OrganizationConnectorPolicy,
} from '@/lib/services/connector-policy-service';
import { getOperatorMappedConnectorIds } from '@/lib/user-connector-tools';

export const runtime = 'nodejs';

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()))].filter(Boolean);
}

function webDomains(values: readonly string[]): string[] {
  return [...new Set(values.flatMap((value) => normalizeWebDomain(value) ?? []))];
}

function toolRules(rules: readonly WorkspaceConnectorToolRule[]): WorkspaceConnectorToolRule[] {
  const byTool = new Map<string, WorkspaceConnectorToolRule>();
  for (const rule of rules) {
    const connectorId = rule.connectorId.trim().toLowerCase();
    const toolName = rule.toolName.trim();
    byTool.set(`${connectorId} ${toolName}`, { connectorId, toolName, level: rule.level });
  }
  return [...byTool.values()];
}

function present(
  organizationId: string,
  role: 'owner' | 'admin' | 'member' | 'viewer',
  canManagePolicy: boolean,
  policy: OrganizationConnectorPolicy | null,
): ConnectorPolicyResponse {
  return {
    organizationId,
    configured: policy !== null,
    canManagePolicy,
    currentUserRole: role,
    policy: {
      allowedConnectors: policy?.allowedConnectors ?? [],
      blockedConnectors: policy?.blockedConnectors ?? [],
      allowCustomConnectors: policy?.allowCustomConnectors ?? true,
      allowedPlugins: policy?.allowedPlugins ?? [],
      blockedPlugins: policy?.blockedPlugins ?? [],
      allowedMcpHosts: policy?.allowedMcpHosts ?? [],
      allowedWebDomains: policy?.allowedWebDomains ?? [],
      blockedWebDomains: policy?.blockedWebDomains ?? [],
      toolRules: policy?.toolRules ?? [],
      updatedAt: policy?.updatedAt ?? null,
    },
    // Derived from the operator connector map rather than a list written here,
    // so a connector added to the product appears without editing this route.
    catalog: [...getOperatorMappedConnectorIds()].sort(),
  };
}

/** Readable by any member: their client needs it to explain an absent integration. */
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  const policy = await readConnectorPolicy(db, membership.organizationId);
  const permissions = await resolveOrganizationPermissions(membership.organizationId, userId);
  return NextResponse.json(
    present(membership.organizationId, membership.role, permissions.has('policy.manage'), policy),
  );
}

async function handlePut(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  const permissions = await requireMemberPermission(
    membership.organizationId,
    userId,
    'policy.manage',
    'Your workspace role does not allow changing which connectors this workspace permits.',
  );

  const body = await readValidatedJsonBody(
    request,
    UpdateConnectorPolicyRequestSchema,
    'Invalid connector policy',
  );

  const before = await readConnectorPolicy(db, membership.organizationId);
  const input = {
    allowedConnectors: dedupe(body.allowedConnectors),
    blockedConnectors: dedupe(body.blockedConnectors),
    allowCustomConnectors: body.allowCustomConnectors,
    allowedPlugins: dedupe(body.allowedPlugins),
    blockedPlugins: dedupe(body.blockedPlugins),
    allowedMcpHosts: dedupe(body.allowedMcpHosts),
    allowedWebDomains: webDomains(body.allowedWebDomains),
    blockedWebDomains: webDomains(body.blockedWebDomains),
    toolRules: body.toolRules ? toolRules(body.toolRules) : (before?.toolRules ?? []),
  };

  const overlap = input.allowedConnectors.filter((id) => input.blockedConnectors.includes(id));
  if (overlap.length > 0) {
    throw createError.validation(
      `A connector cannot be both approved and blocked: ${overlap.join(', ')}.`,
    );
  }
  const pluginOverlap = input.allowedPlugins.filter((id) => input.blockedPlugins.includes(id));
  if (pluginOverlap.length > 0) {
    throw createError.validation(
      `A plugin cannot be both approved and blocked: ${pluginOverlap.join(', ')}.`,
    );
  }
  const domainOverlap = input.allowedWebDomains.filter((domain) =>
    input.blockedWebDomains.includes(domain),
  );
  if (domainOverlap.length > 0) {
    throw createError.validation(
      `A site cannot be both allowed and blocked: ${domainOverlap.join(', ')}.`,
    );
  }

  const policy = await upsertConnectorPolicy(getNeonDb(), membership.organizationId, input, userId);

  await recordAuditEvent({
    userId,
    eventType: 'admin_policy_changed',
    organizationId: membership.organizationId,
    request,
    outcome: 'success',
    severity: 'warning',
    detail: {
      resourceType: 'organization_connector_policy',
      resourceId: membership.organizationId,
      role: membership.role,
      status: before ? 'updated' : 'created',
      changedKeys: diffConnectorPolicy(before, policy),
    },
  });

  return NextResponse.json(
    present(membership.organizationId, membership.role, permissions.has('policy.manage'), policy),
  );
}

export const GET = withErrorHandler(handleGet);
export const PUT = withErrorHandler(handlePut);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
