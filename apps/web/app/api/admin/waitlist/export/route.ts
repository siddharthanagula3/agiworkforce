import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { OPERATOR_WAITLIST_EXPORT_PATH } from '@agiworkforce/cloud-contracts/waitlist';

import {
  publicWaitlistCsv,
  readPublicWaitlistExport,
} from '@/features/admin/services/operator-waitlist';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withPrivateNoStore } from '@/lib/private-cache-policy';
import { withRateLimit } from '@/lib/rate-limit';
import { getClientIp, logSecurityEvent } from '@/lib/security-audit';

export const dynamic = 'force-dynamic';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId: adminUserId } = await requirePlatformAdmin(request);

  let exported: Awaited<ReturnType<typeof readPublicWaitlistExport>>;
  try {
    exported = await readPublicWaitlistExport();
  } catch (error) {
    logger.error({ error }, 'Failed to export the waitlist');
    throw createError.internal('Failed to export the waitlist');
  }

  await logSecurityEvent(
    {
      userId: adminUserId,
      eventType: 'admin_action',
      severity: 'high',
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
      endpoint: OPERATOR_WAITLIST_EXPORT_PATH,
      details: {
        action: 'waitlist_export',
        list: 'public',
        count: exported.entries.length,
        total: exported.total,
        truncated: exported.truncated,
      },
    },
    { required: true },
  );

  const exportedOn = new Date().toISOString().slice(0, 10);
  return new NextResponse(publicWaitlistCsv(exported.entries), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="waitlist-${exportedOn}.csv"`,
    },
  });
}

export const GET = withPrivateNoStore(withErrorHandler(handleGet));
