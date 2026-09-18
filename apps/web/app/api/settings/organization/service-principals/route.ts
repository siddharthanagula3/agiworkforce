import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  listServicePrincipals,
  setServicePrincipalDisabled,
  type ServicePrincipal,
} from '@/lib/server/service-principal';
import {
  assertInteractiveCaller,
  resolveWorkspaceApiCaller,
} from '@/lib/server/service-principals/caller';
import { servicePrincipalRoutes } from '@/lib/server/service-principals/route-access';

export const runtime = 'nodejs';

const ROUTE = '/api/settings/organization/service-principals';

const UpdateSchema = z.object({ principalId: z.string().uuid(), disabled: z.boolean() }).strict();

export interface ServicePrincipalsResponse {
  organizationId: string;
  canManage: boolean;
  reachableRoutes: string[];
  principals: ServicePrincipal[];
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'settings-org');
  if (limited) return limited;

  const caller = await resolveWorkspaceApiCaller(request, ROUTE, 'GET');
  const payload: ServicePrincipalsResponse = {
    organizationId: caller.organizationId,
    canManage: caller.permissions?.has('identity.manage') ?? false,
    reachableRoutes: servicePrincipalRoutes(),
    principals: await listServicePrincipals(getNeonDb(), caller.organizationId),
  };
  return NextResponse.json(payload, { headers: { 'cache-control': 'no-store' } });
}

async function handlePatch(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;
  const limited = await withRateLimit(request, 'settings-org-patch');
  if (limited) return limited;

  const caller = await resolveWorkspaceApiCaller(request, ROUTE, 'PATCH');
  assertInteractiveCaller(caller, 'Changing a workspace service principal');

  const body = await readValidatedJsonBody(request, UpdateSchema, 'Invalid service principal');
  const principal = await setServicePrincipalDisabled(getNeonDb(), {
    organizationId: caller.organizationId,
    principalId: body.principalId,
    disabled: body.disabled,
    actorUserId: caller.actorUserId,
  });
  if (!principal) {
    throw createError.notFound('That service principal is not in this workspace.');
  }

  await recordAuditEvent({
    userId: caller.actorUserId,
    organizationId: caller.organizationId,
    eventType: 'admin_policy_changed',
    request,
    severity: body.disabled ? 'warning' : 'info',
    detail: {
      resourceType: 'service_principal',
      resourceId: principal.id,
      resourceName: principal.name,
      changedKeys: [body.disabled ? 'disabled' : 'enabled'],
    },
  });

  return NextResponse.json({ principal }, { headers: { 'cache-control': 'no-store' } });
}

export const GET = withErrorHandler(handleGet);
export const PATCH = withErrorHandler(handlePatch);
