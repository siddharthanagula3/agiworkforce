import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getClientIp, logSecurityEvent } from '@/lib/security-audit';
import { eraseAnonymousSubjectByEmail } from '@/lib/server/anonymous-erasure';

const AnonymousErasureSchema = z.object({
  email: z.string().trim().email().max(254),
  reason: z.string().trim().min(1).max(1000),
});

async function handleAnonymousErasure(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'admin-security');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId: adminUserId } = await requirePlatformAdmin(request);

  const parsed = AnonymousErasureSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid anonymous erasure payload', parsed.error.flatten());
  }

  const report = await eraseAnonymousSubjectByEmail(parsed.data.email);

  await logSecurityEvent({
    userId: adminUserId,
    eventType: 'admin_action',
    severity: 'high',
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent') ?? undefined,
    endpoint: '/api/admin/privacy/erasures',
    details: {
      action: 'anonymous_subject_erasure',
      subjectEmailSha256: report.emailSha256,
      deleted: report.deleted,
      accountBound: report.accountBound,
      complete: report.complete,
      reason: parsed.data.reason,
      tables: report.tables,
    },
  });

  return NextResponse.json(
    {
      complete: report.complete,
      deleted: report.deleted,
      accountBound: report.accountBound,
      tables: report.tables,
    },
    { status: report.complete ? 200 : 500, headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const POST = withErrorHandler(handleAnonymousErasure);
