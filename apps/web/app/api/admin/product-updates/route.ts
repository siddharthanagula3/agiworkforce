import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getClientIp, logSecurityEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  findAnnounceableRelease,
  startProductUpdateAnnouncement,
} from '@/lib/services/product-update-notification-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const PRODUCT_UPDATES_PATH = '/api/admin/product-updates';

const AnnounceSchema = z.object({ release: z.string().min(1).max(64) }).strict();

async function handleAnnounce(request: NextRequest): Promise<Response> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await requirePlatformAdmin(request);

  const parsed = AnnounceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid product update', parsed.error.flatten());
  }
  if (!findAnnounceableRelease(parsed.data.release)) {
    throw createError.notFound('No release note has that name.');
  }

  await logSecurityEvent(
    {
      userId,
      eventType: 'admin_action',
      severity: 'high',
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
      endpoint: PRODUCT_UPDATES_PATH,
      details: { action: 'product_update_announce', release: parsed.data.release },
    },
    { required: true },
  );

  const started = await startProductUpdateAnnouncement(getNeonDb(), parsed.data.release);
  if (started.status === 'unknown_release') {
    throw createError.notFound('No release note has that name.');
  }
  if (started.status === 'already_announced') {
    throw createError.conflict('This release was already announced.');
  }
  return NextResponse.json(
    { release: started.release, jobId: started.jobId },
    { status: 202, headers: NO_STORE },
  );
}

export const POST = withErrorHandler(handleAnnounce);
