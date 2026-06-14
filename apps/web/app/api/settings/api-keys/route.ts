import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash, randomBytes } from 'crypto';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { getNeonDb } from '@/lib/server/neon-db';
import type { ApiKeyRow } from '@/lib/server/neon-types';
import { handleCorsPreflightRequest } from '@/lib/cors';

const CreateKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
});

function maskRow(row: ApiKeyRow) {
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    created_at: row.created_at,
    last_used_at: row.last_used_at ?? null,
  };
}

/**
 * GET /api/settings/api-keys
 * List the current user's active API keys (masked · no hashes returned).
 */
async function handleList(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'api-keys-list');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const rows = await db.query<ApiKeyRow>(
    `select id, user_id, name, key_hash, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at
     from public.api_keys
     where user_id = $1
       and revoked_at is null
     order by created_at desc
     limit 100`,
    [userId],
  );

  return NextResponse.json({ api_keys: rows.map(maskRow) });
}

/**
 * POST /api/settings/api-keys
 * Create a new API key. Returns the full key once · it is never stored in plaintext.
 */
async function handleCreate(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'api-keys-create');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId } = await getClerkAuthUser(request);

  const body = await request.json().catch(() => ({}));
  const parsed = CreateKeySchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }
  const { name } = parsed.data;

  const db = getNeonDb();

  // Enforce a per-user key limit to prevent runaway creation.
  const [countRow] = await db.query<{ count: string }>(
    `select count(*) as count from public.api_keys where user_id = $1 and revoked_at is null`,
    [userId],
  );
  const activeCount = parseInt(countRow?.count ?? '0', 10);
  if (activeCount >= 20) {
    throw createError.validation('You may not have more than 20 active API keys at once');
  }

  // Generate a high-entropy random key: prefix "agi_" + 40 hex chars.
  const rawKey = `agi_${randomBytes(20).toString('hex')}`;
  const keyPrefix = rawKey.slice(0, 8);
  const keyHash = createHash('sha256').update(rawKey).digest('hex');

  const [row] = await db.query<ApiKeyRow>(
    `insert into public.api_keys (user_id, name, key_hash, key_prefix, scopes)
     values ($1, $2, $3, $4, $5)
     returning id, user_id, name, key_hash, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at`,
    [userId, name, keyHash, keyPrefix, []],
  );

  if (!row) {
    throw createError.internal('Failed to create API key');
  }

  logger.info({ userId, keyId: row.id }, 'API key created');

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
