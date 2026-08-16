import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { getNeonDb } from '@/lib/server/neon-db';
import type { ApiKeyRow } from '@/lib/server/neon-types';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { ApiKeyService } from '@/lib/services/api-key-service';
import { recordAuditEvent } from '@/lib/security-audit';

async function handleRevoke(request: NextRequest, context: { params: Promise<{ keyId: string }> }) {
  const rateLimitResponse = await withRateLimit(request, 'api-keys-delete');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId } = await getClerkAuthUser(request);
  const { keyId } = await context.params;

  if (!keyId || typeof keyId !== 'string') {
    throw createError.validation('Invalid key ID');
  }

  const db = getNeonDb();

  const [existing] = await db.query<Pick<ApiKeyRow, 'id' | 'user_id' | 'revoked_at'>>(
    `select id, user_id, revoked_at from public.api_keys where id = $1 limit 1`,
    [keyId],
  );

  if (!existing) {
    throw createError.notFound('API key not found');
  }

  if (existing.user_id !== userId) {
    throw createError.forbidden('You do not own this API key');
  }

  if (existing.revoked_at) {
    return NextResponse.json({ message: 'API key was already revoked' });
  }

  await ApiKeyService.revokeApiKey(db, keyId, userId);

  logger.info({ userId, keyId }, 'API key revoked');

  await recordAuditEvent({
    userId,
    eventType: 'api_key_revoked',
    request,
    detail: { resourceType: 'api_key', resourceId: keyId },
  });

  return NextResponse.json({ message: 'API key revoked' });
}

export const DELETE = withErrorHandler(handleRevoke);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
