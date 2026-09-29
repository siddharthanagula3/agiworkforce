import { NextRequest, NextResponse } from 'next/server';
import {
  MobileIntentTokenIssueRequestSchema,
  MobileIntentTokenRevokeRequestSchema,
} from '@agiworkforce/cloud-contracts';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  issueMobileIntentToken,
  revokeMobileIntentTokenById,
  revokeMobileIntentTokens,
} from '@/lib/server/mobile-intent-tokens';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveSessionsPrincipal } from '@/app/api/settings/sessions/session-principal';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

async function handleIssue(request: NextRequest) {
  const limited = await withRateLimit(request, 'mobile-intent-token');
  if (limited) return limited;
  const { db, userId, organizationId, currentSessionId } = await resolveSessionsPrincipal(request);
  const csrfResponse = await requireCsrfToken(request, userId);
  if (csrfResponse) return csrfResponse;

  const parsed = MobileIntentTokenIssueRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) throw createError.badRequest('Invalid Ask from Siri request');
  const { installId, defaultModelId } = parsed.data;

  const registered = await db.query<{ id: string }>(
    `select id from public.device_registrations
      where user_id = $1 and surface = 'mobile' and install_id = $2
        and identity_session_id = $3
      limit 1`,
    [userId, installId, currentSessionId],
  );
  if (!registered[0]) {
    throw createError
      .forbidden('This phone is not registered to your account yet. Open the app and try again.')
      .asUserSafe();
  }

  const { token, tokenId } = await issueMobileIntentToken(db, {
    userId,
    organizationId: organizationId ?? null,
    installId,
    defaultModelId: defaultModelId ?? null,
  });
  await recordAuditEvent({
    userId,
    organizationId,
    eventType: 'device_authorization_approved',
    request,
    detail: { resourceType: 'device', resourceId: registered[0].id, source: 'ask_intent' },
  });
  return NextResponse.json({ token, tokenId }, { status: 201, headers: NO_STORE });
}

async function handleRevoke(request: NextRequest) {
  const limited = await withRateLimit(request, 'mobile-intent-token');
  if (limited) return limited;
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const csrfResponse = await requireCsrfToken(request, userId);
  if (csrfResponse) return csrfResponse;

  const params = new URL(request.url).searchParams;
  const parsed = MobileIntentTokenRevokeRequestSchema.safeParse(
    Object.fromEntries(
      ['installId', 'tokenId'].flatMap((key) => {
        const value = params.get(key);
        return value ? [[key, value]] : [];
      }),
    ),
  );
  if (!parsed.success) throw createError.badRequest('Invalid Ask from Siri request');
  const { installId, tokenId } = parsed.data;
  if (tokenId) await revokeMobileIntentTokenById(db, userId, tokenId);
  else await revokeMobileIntentTokens(db, userId, installId ?? null);
  await recordAuditEvent({
    userId,
    organizationId,
    eventType: 'session_revoked',
    request,
    detail: { resourceType: 'device', source: 'ask_intent' },
  });
  return NextResponse.json({ revoked: true }, { headers: NO_STORE });
}

export const POST = withErrorHandler(handleIssue);
export const DELETE = withErrorHandler(handleRevoke);
