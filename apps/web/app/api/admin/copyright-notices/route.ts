import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getClientIp, logSecurityEvent } from '@/lib/security-audit';
import {
  listCopyrightNotices,
  parseCopyrightNoticeCursor,
  setCopyrightNoticeDisposition,
  type CopyrightNoticeCursor,
  type CopyrightNoticeFilter,
} from '@/lib/server/copyright-notices';
import { getNeonDb } from '@/lib/server/neon-db';

const NOTICE_STATUSES = [
  'received',
  'actioned',
  'rejected',
  'counter_notified',
  'decided',
] as const satisfies readonly CopyrightNoticeFilter[];

const DispositionSchema = z.object({
  reference: z.string().trim().min(1).max(64),
  status: z.enum(['actioned', 'rejected', 'counter_notified']),
  note: z.string().trim().min(1).max(1000),
});

function readStatus(raw: string | null): CopyrightNoticeFilter | undefined {
  if (!raw) return undefined;
  const status = NOTICE_STATUSES.find((value) => value === raw);
  if (!status) throw createError.badRequest(`status must be one of: ${NOTICE_STATUSES.join(', ')}`);
  return status;
}

function readCursor(raw: string | null): CopyrightNoticeCursor | undefined {
  if (!raw) return undefined;
  const cursor = parseCopyrightNoticeCursor(raw);
  if (!cursor) throw createError.badRequest('before must be a cursor returned by this list');
  return cursor;
}

async function handleList(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-security');
  if (rateLimitResponse) return rateLimitResponse;

  await requirePlatformAdmin(request);

  const status = readStatus(request.nextUrl.searchParams.get('status'));
  const before = readCursor(request.nextUrl.searchParams.get('before'));
  const page = await listCopyrightNotices(getNeonDb(), {
    ...(status ? { filter: status } : {}),
    ...(before ? { before } : {}),
  });
  return NextResponse.json(page, { headers: { 'Cache-Control': 'private, no-store' } });
}

async function handleDisposition(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'admin-security');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId: adminUserId } = await requirePlatformAdmin(request);

  const parsed = DispositionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest(
      'A notice reference, a decision and a note are required',
      parsed.error.flatten(),
    );
  }

  const notice = await setCopyrightNoticeDisposition(
    getNeonDb(),
    parsed.data.reference,
    parsed.data.status,
    parsed.data.note,
  );
  if (!notice) throw createError.notFound('No notice has that reference');

  await logSecurityEvent({
    userId: adminUserId,
    eventType: 'admin_action',
    severity: 'medium',
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent') ?? undefined,
    endpoint: '/api/admin/copyright-notices',
    details: {
      action: 'content_notice_disposition',
      reference: notice.reference,
      status: notice.status,
      noticeType: notice.noticeType,
      targetKind: notice.targetKind,
    },
  });

  return NextResponse.json({ notice });
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleDisposition);
