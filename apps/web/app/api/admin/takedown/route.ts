import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getClientIp, logSecurityEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { shareRef } from '@/lib/share-ref';

import { findPublicTarget, normalizeToken } from './lib/public-target';

const TakedownSchema = z.object({
  token: z.string().trim().min(1).max(2048),
  reason: z.string().trim().min(1).max(1000),
});

async function handleLookup(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-security');
  if (rateLimitResponse) return rateLimitResponse;

  await requirePlatformAdmin(request);

  const raw = request.nextUrl.searchParams.get('token');
  if (!raw) {
    throw createError.badRequest('token query parameter is required');
  }

  const token = normalizeToken(raw);
  if (!token) {
    throw createError.badRequest('token is not a valid public share token or URL');
  }

  const target = await findPublicTarget(getNeonDb(), token);
  if (!target) {
    throw createError.notFound('No public content is served from that token');
  }

  return NextResponse.json({ target }, { headers: { 'Cache-Control': 'private, no-store' } });
}

async function handleTakedown(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'admin-security');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId: adminUserId } = await requirePlatformAdmin(request);

  const body = await request.json().catch(() => null);
  const parsed = TakedownSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.badRequest('Invalid takedown payload', parsed.error.flatten());
  }

  const token = normalizeToken(parsed.data.token);
  if (!token) {
    throw createError.badRequest('token is not a valid public share token or URL');
  }

  const db = getNeonDb();

  const target = await findPublicTarget(db, token);
  if (!target) {
    throw createError.notFound('No public content is served from that token');
  }

  let removed: number;
  try {
    removed =
      target.kind === 'conversation-share'
        ? (
            await db.query(`delete from public.shared_sessions where token = $1 returning token`, [
              token,
            ])
          ).length
        : (
            await db.query(
              `delete from public.published_artifacts where token = $1 returning token`,
              [token],
            )
          ).length;
  } catch (err) {
    logger.error({ err, share: shareRef(token), kind: target.kind }, 'Admin takedown failed');
    throw createError.internal('Failed to unpublish content');
  }

  if (removed === 0) {
    throw createError.notFound('No public content is served from that token');
  }

  await logSecurityEvent({
    userId: adminUserId,
    eventType: 'admin_action',
    severity: 'high',
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent') ?? undefined,
    endpoint: '/api/admin/takedown',
    details: {
      action: 'public_content_takedown',
      kind: target.kind,
      token,
      ownerId: target.ownerId,
      reason: parsed.data.reason,
    },
  });

  return NextResponse.json({
    success: true,
    kind: target.kind,
    token,
    ownerId: target.ownerId,
    title: target.title,
  });
}

export const GET = withErrorHandler(handleLookup);
export const POST = withErrorHandler(handleTakedown);
