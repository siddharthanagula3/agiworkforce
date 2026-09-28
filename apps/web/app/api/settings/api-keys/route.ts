import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import type { ApiKeyRow } from '@/lib/server/neon-types';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { ApiKeyService } from '@/lib/services/api-key-service';
import { API_KEY_SCOPE_VALUES, resolveApiKeyScopes } from '@/lib/api-key-scopes';
import { recordAuditEvent } from '@/lib/security-audit';
import { requireStepUp } from '@/lib/server/step-up-auth';
import { readLiveDeveloperProject } from '@/lib/services/developer-project-service';
import { queueDeveloperWebhookEvent } from '@/lib/services/developer-webhook-service';

const CreateKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  scopes: z
    .array(z.enum(API_KEY_SCOPE_VALUES))
    .min(1, 'Select at least one scope')
    .max(API_KEY_SCOPE_VALUES.length)
    .refine((scopes) => new Set(scopes).size === scopes.length, 'Scopes must be unique'),
  expiresAt: z.string().datetime().nullish(),
  projectId: z.string().uuid().nullish(),
});

function maskRow(row: ApiKeyRow) {
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    scopes: resolveApiKeyScopes(row.scopes),
    project_id: row.project_id ?? null,
    created_at: row.created_at,
    last_used_at: row.last_used_at ?? null,
    expires_at: row.expires_at ?? null,
  };
}

async function handleList(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'api-keys-list');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);

  const rows = await db.query<ApiKeyRow>(
    `select id, user_id, name, key_hash, key_prefix, scopes, project_id, last_used_at, expires_at, revoked_at, created_at
     from public.api_keys
     where user_id = $1
       and revoked_at is null
     order by created_at desc
     limit 100`,
    [userId],
  );

  return NextResponse.json({ api_keys: rows.map(maskRow) });
}

async function handleCreate(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const body = await request.json().catch(() => ({}));
  const parsed = CreateKeySchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }
  const { name, scopes } = parsed.data;

  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  const projectId = parsed.data.projectId ?? null;
  if (projectId && !(await readLiveDeveloperProject(db, userId, projectId))) {
    throw createError.validation('That project does not exist or is archived.');
  }

  const [countRow] = await db.query<{ count: string }>(
    `select count(*) as count from public.api_keys where user_id = $1 and revoked_at is null`,
    [userId],
  );
  const activeCount = parseInt(countRow?.count ?? '0', 10);
  if (activeCount >= 20) {
    throw createError.validation('You may not have more than 20 active API keys at once');
  }

  await requireStepUp({
    userId,
    action: 'api_credential.reveal',
    organizationId,
    request,
    endpoint: '/api/settings/api-keys',
  });

  const rateLimitResponse = await withRateLimit(request, 'api-keys-create');
  if (rateLimitResponse) return rateLimitResponse;

  const { apiKey: row, rawKey } = await ApiKeyService.createApiKey(
    db,
    userId,
    name,
    scopes,
    expiresAt,
    projectId,
  );

  logger.info({ userId, keyId: row.id }, 'API key created');

  await recordAuditEvent({
    userId,
    eventType: 'api_key_created',
    request,
    detail: {
      resourceType: 'api_key',
      resourceId: row.id,
      resourceName: name,
      scopes: resolveApiKeyScopes(row.scopes),
      ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
      ...(projectId ? { subjectRef: projectId } : {}),
    },
  });

  await queueDeveloperWebhookEvent(db, userId, 'api_key.created', {
    id: row.id,
    name,
    key_prefix: row.key_prefix,
    scopes: resolveApiKeyScopes(row.scopes),
    project_id: projectId,
    expires_at: expiresAt ? expiresAt.toISOString() : null,
  });

  return NextResponse.json(
    {
      api_key: maskRow(row),
      full_key: rawKey,
    },
    { status: 201 },
  );
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleCreate);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
