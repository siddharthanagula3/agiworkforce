import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { expandOrganizationPermissions } from '@agiworkforce/types';

import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { requireOrgMember, resolveOrgMembership } from '@/lib/services/org-sharing-service';
import { resolveOrganizationPermissions } from '@/lib/services/organization-permission-service';
import {
  DELEGATABLE_PERMISSIONS,
  DELEGATION_MAX_DURATION_MS,
  grantAdminDelegation,
  listAdminDelegations,
  resolveDelegatedScopes,
  revokeAdminDelegation,
  type AdminDelegation,
} from '@/lib/services/organization-delegation';

export const runtime = 'nodejs';

const GrantSchema = z
  .object({
    delegateUserId: z.string().min(1).max(255),
    scopes: z.array(z.string().min(1).max(64)).min(1).max(32),
    expiresAt: z.string().min(1).max(64),
    reason: z.string().max(500).optional(),
  })
  .strict();

const RevokeSchema = z.object({ delegationId: z.string().uuid() }).strict();

export interface DelegationListResponse {
  organizationId: string;
  canManage: boolean;
  delegatablePermissions: string[];
  maxDurationMs: number;
  yourScopes: string[];
  delegations: AdminDelegation[];
}

// Asked through the closure rather than an exact key, so a role stored in the
// legacy vocabulary answers the canonical question 0248 introduced.
async function resolveCaller(request: NextRequest, need: 'view' | 'manage') {
  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  const granted = await resolveOrganizationPermissions(membership.organizationId, userId);
  const held = expandOrganizationPermissions(granted);
  const canManage = held.has('admin.roles.manage');

  if (need === 'manage' && !canManage) {
    throw createError
      .forbidden('Your workspace role does not allow delegating admin permissions.')
      .asUserSafe();
  }
  if (!canManage && !held.has('admin.roles.view')) {
    throw createError
      .forbidden('Your workspace role does not allow reading admin delegations.')
      .asUserSafe();
  }

  return { db, userId, organizationId: membership.organizationId, granted, canManage };
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'settings-org');
  if (limited) return limited;

  const caller = await resolveCaller(request, 'view');
  const payload: DelegationListResponse = {
    organizationId: caller.organizationId,
    canManage: caller.canManage,
    delegatablePermissions: [...DELEGATABLE_PERMISSIONS],
    maxDurationMs: DELEGATION_MAX_DURATION_MS,
    yourScopes: [
      ...(await resolveDelegatedScopes(caller.db, caller.organizationId, caller.userId)),
    ],
    delegations: await listAdminDelegations(caller.db, caller.organizationId),
  };
  return NextResponse.json(payload, { headers: { 'cache-control': 'no-store' } });
}

async function handlePost(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;
  const limited = await withRateLimit(request, 'settings-org-patch');
  if (limited) return limited;

  const caller = await resolveCaller(request, 'manage');
  const body = await readValidatedJsonBody(request, GrantSchema, 'Invalid delegation');

  const delegation = await grantAdminDelegation(getNeonDb(), {
    organizationId: caller.organizationId,
    delegateUserId: body.delegateUserId,
    grantedByUserId: caller.userId,
    granterPermissions: caller.granted,
    scopes: body.scopes,
    expiresAt: body.expiresAt,
    reason: body.reason ?? null,
    request,
  });

  return NextResponse.json({ delegation }, { headers: { 'cache-control': 'no-store' } });
}

async function handleDelete(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;
  const limited = await withRateLimit(request, 'settings-org-patch');
  if (limited) return limited;

  const caller = await resolveCaller(request, 'manage');
  const body = await readValidatedJsonBody(request, RevokeSchema, 'Invalid delegation');

  const delegation = await revokeAdminDelegation(getNeonDb(), {
    organizationId: caller.organizationId,
    delegationId: body.delegationId,
    revokedByUserId: caller.userId,
    request,
  });

  return NextResponse.json({ delegation }, { headers: { 'cache-control': 'no-store' } });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
export const DELETE = withErrorHandler(handleDelete);

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) || new NextResponse(null, { status: 204 });
}
