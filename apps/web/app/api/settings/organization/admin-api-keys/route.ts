import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  GRANTABLE_ORGANIZATION_PERMISSIONS,
  type OrganizationPermission,
} from '@agiworkforce/types';
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
import { readIdempotencyKey, withIdempotentWrite } from '@/lib/server/idempotency';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  boundedPrincipalScopes,
  createServicePrincipal,
  listServicePrincipals,
  readServicePrincipal,
  type ServicePrincipal,
} from '@/lib/server/service-principal';
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
    servicePrincipalId: z.string().uuid().optional(),
  })
  .strict();

const RevokeSchema = z.object({ keyId: z.string().uuid() }).strict();

export interface AdminApiKeysResponse {
  organizationId: string;
  canManageKeys: boolean;
  grantableScopes: string[];
  keys: AdminApiKey[];
  servicePrincipals: ServicePrincipal[];
}

interface CreatedKeyPayload {
  key: string;
  record: AdminApiKey;
  servicePrincipal: ServicePrincipal;
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
  const db = getNeonDb();
  const [keys, servicePrincipals] = await Promise.all([
    listAdminApiKeys(db, membership.organizationId),
    listServicePrincipals(db, membership.organizationId),
  ]);
  const payload: AdminApiKeysResponse = {
    organizationId: membership.organizationId,
    canManageKeys: permissions.has('identity.manage'),
    grantableScopes: GRANTABLE_ORGANIZATION_PERMISSIONS.filter((scope) => permissions.has(scope)),
    keys,
    servicePrincipals,
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

  const idempotencyKey = readIdempotencyKey(request);
  const body = await readValidatedJsonBody(request, CreateSchema, 'Invalid workspace API key');
  const { scopes, refused } = grantableKeyScopes(body.scopes, permissions);
  if (refused.length > 0) {
    throw createError
      .forbidden(
        `A key cannot carry a permission you do not hold or that only the Primary Owner has: ${refused.join(', ')}.`,
      )
      .asUserSafe();
  }

  const db = getNeonDb();
  const mint = async () => {
    const servicePrincipal = await resolvePrincipalForKey(db, {
      organizationId: membership.organizationId,
      name: body.name,
      scopes,
      servicePrincipalId: body.servicePrincipalId,
      createdByUserId: userId,
    });
    const expiresAt =
      body.expiresInDays === null
        ? null
        : new Date(Date.now() + body.expiresInDays * DAY_MS).toISOString();
    const { key, record } = await createAdminApiKey(db, {
      organizationId: membership.organizationId,
      name: body.name,
      scopes,
      servicePrincipalId: servicePrincipal.id,
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
        subjectRef: `service_principal:${servicePrincipal.id}`,
      },
    });

    return { replayed: false, status: 201, body: { key, record, servicePrincipal } };
  };

  if (idempotencyKey === null) {
    const minted = await mint();
    return NextResponse.json(minted.body, { status: minted.status });
  }

  const result = await withIdempotentWrite<CreatedKeyPayload>(
    db,
    {
      organizationId: membership.organizationId,
      scope: 'admin-api-keys:create',
      actorId: userId,
      key: idempotencyKey,
      requestBody: body,
    },
    mint,
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Idempotency-Replayed': result.replayed ? 'true' : 'false' },
  });
}

/**
 * A key always belongs to a principal. A caller that names one gets it, bounded
 * by its ceiling; a caller that does not gets a principal minted for this key
 * whose ceiling is exactly the scopes asked for.
 */
async function resolvePrincipalForKey(
  db: DatabaseAdapter,
  input: {
    organizationId: string;
    name: string;
    scopes: readonly OrganizationPermission[];
    servicePrincipalId: string | undefined;
    createdByUserId: string;
  },
): Promise<ServicePrincipal> {
  if (input.servicePrincipalId === undefined) {
    return createServicePrincipal(db, {
      organizationId: input.organizationId,
      name: input.name,
      maxScopes: input.scopes,
      createdByUserId: input.createdByUserId,
    });
  }

  const principal = await readServicePrincipal(db, input.organizationId, input.servicePrincipalId);
  if (!principal) {
    throw createError.notFound('No service principal with that id in this workspace.');
  }
  if (principal.disabledAt !== null) {
    throw createError
      .forbidden('This service principal is disabled. Re-enable it before issuing a key.')
      .asUserSafe();
  }
  const bounded = boundedPrincipalScopes(input.scopes, principal.maxScopes);
  if (bounded.refused.length > 0) {
    throw createError
      .forbidden(
        `The service principal "${principal.name}" does not allow: ${bounded.refused.join(', ')}.`,
      )
      .asUserSafe();
  }
  return principal;
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
