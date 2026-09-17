import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { GRANTABLE_ORGANIZATION_PERMISSIONS } from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  createAdminApiKey,
  grantableKeyScopes,
  listAdminApiKeys,
  revokeAdminApiKey,
  type AdminApiKey,
} from '@/lib/server/admin-api-keys';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { requireOrgMember, resolveOrgMembership } from '@/lib/services/org-sharing-service';
import { requireMemberPermission } from '@/lib/services/organization-permission-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';

export const runtime = 'nodejs';

const MAX_KEY_LIFETIME_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

const CreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    scopes: z.array(z.string().min(1).max(64)).min(1).max(16),
    expiresInDays: z.number().int().min(1).max(MAX_KEY_LIFETIME_DAYS).nullable(),
  })
  .strict();

const RevokeSchema = z.object({ keyId: z.string().uuid() }).strict();

export interface AdminApiKeysResponse {
  organizationId: string;
  canManageKeys: boolean;
  grantableScopes: string[];
  keys: AdminApiKey[];
}

async function resolveCaller(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);
  return { userId, membership };
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, membership } = await resolveCaller(request);
  const permissions = await requireMemberPermission(
    membership.organizationId,
    userId,
    'identity.read',
    'Your workspace role does not allow viewing workspace API keys.',
  );
  const payload: AdminApiKeysResponse = {
    organizationId: membership.organizationId,
    canManageKeys: permissions.has('identity.manage'),
    grantableScopes: GRANTABLE_ORGANIZATION_PERMISSIONS.filter((scope) => permissions.has(scope)),
    keys: await listAdminApiKeys(getNeonDb(), membership.organizationId),
  };
  return NextResponse.json(payload);
}

async function handlePost(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;
  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, membership } = await resolveCaller(request);
  const permissions = await requireMemberPermission(
    membership.organizationId,
    userId,
    'identity.manage',
    'Your workspace role does not allow creating workspace API keys.',
  );

  const body = await readValidatedJsonBody(request, CreateSchema, 'Invalid workspace API key');
  const { scopes, refused } = grantableKeyScopes(body.scopes, permissions);
  if (refused.length > 0) {
    throw createError
      .forbidden(
        `A key cannot carry a permission you do not hold or that only the Primary Owner has: ${refused.join(', ')}.`,
      )
      .asUserSafe();
  }

  const expiresAt =
    body.expiresInDays === null
      ? null
      : new Date(Date.now() + body.expiresInDays * DAY_MS).toISOString();
  const { key, record } = await createAdminApiKey(getNeonDb(), {
    organizationId: membership.organizationId,
    name: body.name,
    scopes,
    createdBy: userId,
    expiresAt,
  });

  await recordAuditEvent({
    userId,
    eventType: 'admin_api_key_created',
    organizationId: membership.organizationId,
    request,
    outcome: 'success',
    severity: 'critical',
    detail: {
      resourceType: 'admin_api_key',
      resourceId: record.id,
      resourceName: record.name,
      scopes,
      role: membership.role,
      status: expiresAt ? 'expiring' : 'no_expiry',
    },
  });

  return NextResponse.json({ key, record }, { status: 201 });
}

async function handleDelete(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;
  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, membership } = await resolveCaller(request);
  await requireMemberPermission(
    membership.organizationId,
    userId,
    'identity.manage',
    'Your workspace role does not allow revoking workspace API keys.',
  );

  const body = await readValidatedJsonBody(request, RevokeSchema, 'Invalid key revocation');
  const revoked = await revokeAdminApiKey(
    getNeonDb(),
    membership.organizationId,
    body.keyId,
    userId,
  );
  if (!revoked) {
    throw createError.notFound('No active workspace API key with that id in this workspace.');
  }

  await recordAuditEvent({
    userId,
    eventType: 'admin_api_key_revoked',
    organizationId: membership.organizationId,
    request,
    outcome: 'success',
    severity: 'warning',
    detail: {
      resourceType: 'admin_api_key',
      resourceId: revoked.id,
      resourceName: revoked.name,
      role: membership.role,
    },
  });

  return NextResponse.json({ record: revoked });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
export const DELETE = withErrorHandler(handleDelete);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
