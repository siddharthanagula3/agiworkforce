import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { WORKSPACE_POLICY_OVERRIDE_SUBJECTS } from '@agiworkforce/types';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { parseWorkspaceControlsLayer } from '@/lib/services/organization-policy-service';
import {
  listPolicyOverrides,
  upsertPolicyOverride,
} from '@/lib/services/organization-policy-override-service';
import { policyScopeSubjectExists } from '../policy-subject';
import { requireWorkspaceConsolePermission } from '../../workspace-access';
import { ControlsPatchSchema } from '../controls-schema';

export const runtime = 'nodejs';

const OverrideSchema = z
  .object({
    subjectType: z.enum(WORKSPACE_POLICY_OVERRIDE_SUBJECTS),
    subjectId: z.string().trim().min(1).max(255),
    layer: ControlsPatchSchema,
  })
  .strict();

const DENIED = 'Your workspace role does not allow changing workspace policy.';

async function handleList(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { organizationId } = await requireWorkspaceConsolePermission(
    request,
    'policy.manage',
    DENIED,
  );
  const overrides = await listPolicyOverrides(getNeonDb(), organizationId);
  return NextResponse.json({ organizationId, overrides });
}

async function handleUpsert(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, organizationId, access } = await requireWorkspaceConsolePermission(
    request,
    'policy.manage',
    DENIED,
  );
  const input = await readValidatedJsonBody(request, OverrideSchema, 'Invalid policy exception');
  const layer = parseWorkspaceControlsLayer(input.layer);
  if (Object.keys(layer).length === 0) {
    throw createError.validation('A policy exception must set at least one control.');
  }

  const db = getNeonDb();
  if (!(await policyScopeSubjectExists(db, organizationId, input.subjectType, input.subjectId))) {
    throw createError
      .notFound(`That ${input.subjectType} does not exist in this workspace.`)
      .asUserSafe();
  }

  const override = await upsertPolicyOverride(db, {
    organizationId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    layer,
    actorUserId: userId,
  });

  await recordAuditEvent({
    userId,
    eventType: 'admin_policy_changed',
    organizationId,
    request,
    severity: 'warning',
    detail: {
      resourceType: 'organization_policy_override',
      resourceId: override.id,
      scope: `${override.subjectType}:${override.subjectId}`,
      changedKeys: Object.keys(layer),
      role: access.role,
    },
  });

  return NextResponse.json({ override });
}

export const GET = withErrorHandler(handleList);
export const PUT = withErrorHandler(handleUpsert);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
