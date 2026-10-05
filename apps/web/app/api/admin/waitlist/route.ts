import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  OPERATOR_WAITLIST_LISTS,
  OPERATOR_WAITLIST_PATH,
  OperatorWaitlistListSchema,
  type OperatorWaitlistList,
  type OperatorWaitlistResponse,
} from '@agiworkforce/cloud-contracts/waitlist';

import {
  WAITLIST_EXPORT_ROW_LIMIT,
  WaitlistCursorSchema,
  readPublicWaitlist,
  readUpgradeWaitlist,
  type WaitlistPageRequest,
} from '@/features/admin/services/operator-waitlist';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { clampPageSize, decodeKeysetCursor } from '@/lib/identity/pagination';
import { logger } from '@/lib/logger';
import { withPrivateNoStore } from '@/lib/private-cache-policy';
import { withRateLimit } from '@/lib/rate-limit';
import { getClientIp, logSecurityEvent } from '@/lib/security-audit';

export const dynamic = 'force-dynamic';

async function readList(
  list: OperatorWaitlistList,
  page: WaitlistPageRequest,
): Promise<OperatorWaitlistResponse> {
  if (list === 'public') {
    const read = await readPublicWaitlist(page);
    return { list, exportRowLimit: WAITLIST_EXPORT_ROW_LIMIT, ...read };
  }
  const read = await readUpgradeWaitlist(page);
  return { list, ...read };
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId: adminUserId } = await requirePlatformAdmin(request);

  const { searchParams } = request.nextUrl;
  const list = OperatorWaitlistListSchema.safeParse(searchParams.get('list') ?? 'public');
  if (!list.success) {
    throw createError.badRequest(`list must be one of: ${OPERATOR_WAITLIST_LISTS.join(', ')}`);
  }
  const limitParam = searchParams.get('limit');
  const limit = clampPageSize(limitParam === null ? null : Number(limitParam));
  const cursorParam = searchParams.get('cursor');
  const cursor = cursorParam
    ? WaitlistCursorSchema.safeParse(decodeKeysetCursor(cursorParam))
    : null;
  if (cursor && !cursor.success) {
    throw createError.badRequest('cursor is not a waitlist page cursor');
  }

  let body: OperatorWaitlistResponse;
  try {
    body = await readList(list.data, { limit, cursor: cursor ? cursor.data : null });
  } catch (error) {
    logger.error({ error, list: list.data }, 'Failed to read the waitlist');
    throw createError.internal('Failed to read the waitlist');
  }

  await logSecurityEvent(
    {
      userId: adminUserId,
      eventType: 'admin_action',
      severity: 'medium',
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
      endpoint: OPERATOR_WAITLIST_PATH,
      details: {
        action: 'waitlist_read',
        list: body.list,
        count: body.entries.length,
        total: body.total,
      },
    },
    { required: true },
  );

  return NextResponse.json(body);
}

export const GET = withPrivateNoStore(withErrorHandler(handleGet));
