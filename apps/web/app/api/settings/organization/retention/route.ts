import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  RETENTION_DAYS_MAX,
  RETENTION_DAYS_MIN,
  RETENTION_DOMAINS,
  type DomainRetentionPolicy,
} from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { logAdminDataAccess } from '@/lib/server/admin-data-access';
import { requireOrgMember, resolveOrgMembership } from '@/lib/services/org-sharing-service';
import { requireMemberPermission } from '@/lib/services/organization-permission-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import {
  listDomainRetentionSweeps,
  readDomainRetentionPolicies,
  upsertDomainRetentionPolicies,
  type DomainRetentionSweepRecord,
} from '@/lib/services/domain-retention-service';

export const runtime = 'nodejs';

const PutSchema = z
  .object({
    policies: z
      .array(
        z
          .object({
            domain: z.enum(RETENTION_DOMAINS),
            retentionDays: z.number().int().min(RETENTION_DAYS_MIN).max(RETENTION_DAYS_MAX),
            enforced: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(RETENTION_DOMAINS.length),
  })
  .strict();

export interface DomainRetentionResponse {
  organizationId: string;
  canManageRetention: boolean;
  policies: DomainRetentionPolicy[];
  sweeps: DomainRetentionSweepRecord[];
}

async function requireReader(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);
  const permissions = await requireMemberPermission(
    membership.organizationId,
    userId,
    'audit.read',
    'Your workspace role does not allow viewing data retention for this workspace.',
  );
  return { userId, membership, permissions };
}

async function present(
  organizationId: string,
  canManageRetention: boolean,
): Promise<DomainRetentionResponse> {
  const privileged = getNeonDb();
  const [policies, sweeps] = await Promise.all([
    readDomainRetentionPolicies(privileged, organizationId),
    listDomainRetentionSweeps(privileged, organizationId),
  ]);
  return { organizationId, canManageRetention, policies, sweeps };
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, membership, permissions } = await requireReader(request);
  const payload = await present(membership.organizationId, permissions.has('policy.manage'));
  await logAdminDataAccess(request, {
    userId,
    organizationId: membership.organizationId,
    role: membership.role,
    resourceType: 'organization_retention',
    count: payload.sweeps.length,
  });
  return NextResponse.json(payload);
}

async function handlePut(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);
  await requireMemberPermission(
    membership.organizationId,
    userId,
    'policy.manage',
    'Your workspace role does not allow changing data retention for this workspace.',
  );

  const body = await readValidatedJsonBody(request, PutSchema, 'Invalid retention policy');
  const privileged = getNeonDb();
  const before = await readDomainRetentionPolicies(privileged, membership.organizationId);
  await upsertDomainRetentionPolicies(privileged, membership.organizationId, body.policies, userId);

  const changed = body.policies.filter((next) => {
    const previous = before.find((policy) => policy.domain === next.domain);
    return (
      !previous ||
      previous.enforced !== next.enforced ||
      previous.retentionDays !== next.retentionDays
    );
  });

  if (changed.length > 0) {
    await recordAuditEvent({
      userId,
      eventType: 'retention_policy_changed',
      organizationId: membership.organizationId,
      request,
      outcome: 'success',
      severity: changed.some((policy) => policy.enforced) ? 'critical' : 'warning',
      detail: {
        resourceType: 'organization_retention',
        resourceId: membership.organizationId,
        role: membership.role,
        changedKeys: changed.map(
          (policy) =>
            `${policy.domain}:${policy.enforced ? 'enforced' : 'off'}:${policy.retentionDays}d`,
        ),
      },
    });
  }

  return NextResponse.json(await present(membership.organizationId, true));
}

export const GET = withErrorHandler(handleGet);
export const PUT = withErrorHandler(handlePut);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
