import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { readJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  isOrgAdminRole,
  requireOrgMember,
  resolveOrgMembership,
} from '@/lib/services/org-sharing-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import {
  CONNECTOR_POLICY_LIST_LIMIT,
  diffConnectorPolicy,
  readConnectorPolicy,
  upsertConnectorPolicy,
  type OrganizationConnectorPolicy,
} from '@/lib/services/connector-policy-service';
import { getOperatorMappedConnectorIds } from '@/lib/user-connector-tools';

export const runtime = 'nodejs';

const PutSchema = z
  .object({
    allowedConnectors: z.array(z.string().min(1).max(200)).max(CONNECTOR_POLICY_LIST_LIMIT),
    blockedConnectors: z.array(z.string().min(1).max(200)).max(CONNECTOR_POLICY_LIST_LIMIT),
    allowCustomConnectors: z.boolean(),
  })
  .strict();

export interface ConnectorPolicyResponse {
  organizationId: string;
  configured: boolean;
  canManagePolicy: boolean;
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
  policy: {
    allowedConnectors: string[];
    blockedConnectors: string[];
    allowCustomConnectors: boolean;
    updatedAt: string | null;
  };
  catalog: string[];
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()))].filter(Boolean);
}

function present(
  organizationId: string,
  role: 'owner' | 'admin' | 'member' | 'viewer',
  policy: OrganizationConnectorPolicy | null,
): ConnectorPolicyResponse {
  return {
    organizationId,
    configured: policy !== null,
    canManagePolicy: isOrgAdminRole(role),
    currentUserRole: role,
    policy: {
      allowedConnectors: policy?.allowedConnectors ?? [],
      blockedConnectors: policy?.blockedConnectors ?? [],
      allowCustomConnectors: policy?.allowCustomConnectors ?? true,
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
  return NextResponse.json(present(membership.organizationId, membership.role, policy));
}

async function handlePut(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  if (!isOrgAdminRole(membership.role)) {
    throw createError.forbidden(
      'Only an organization owner or admin can change which connectors this workspace permits.',
    );
  }

  const parsed = PutSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid connector policy', parsed.error.issues);
  }

  const input = {
    allowedConnectors: dedupe(parsed.data.allowedConnectors),
    blockedConnectors: dedupe(parsed.data.blockedConnectors),
    allowCustomConnectors: parsed.data.allowCustomConnectors,
  };

  // A connector on both lists is an administrator contradicting themselves. The
  // evaluator resolves it — deny wins — but saving it silently would leave the
  // console showing an integration as approved that members cannot use.
  const overlap = input.allowedConnectors.filter((id) => input.blockedConnectors.includes(id));
  if (overlap.length > 0) {
    throw createError.validation(
      `A connector cannot be both approved and blocked: ${overlap.join(', ')}.`,
    );
  }

  const before = await readConnectorPolicy(db, membership.organizationId);
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

  return NextResponse.json(present(membership.organizationId, membership.role, policy));
}

export const GET = withErrorHandler(handleGet);
export const PUT = withErrorHandler(handlePut);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
