import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getClientIp, logSecurityEvent } from '@/lib/security-audit';
import {
  CONTENT_REPORT_STATUSES,
  MAX_REVIEWER_NOTE_LENGTH,
  isContentReportStatus,
  readContentReportCounts,
  readContentReportQueue,
  reviewContentReport,
  type ContentReport,
  type ContentReportStatus,
} from '@/lib/server/content-report-triage';

// The reporter-facing surfaces promise a human reads these: the mobile report
// sheet says the report went "to the AGI safety team for review". POST
// /api/mobile/content-report only durably records one, so this route is the
// half that keeps the promise — the reviewer's queue and disposition write.

const ReviewSchema = z.object({
  reportId: z.string().trim().min(1).max(128),
  status: z.enum(CONTENT_REPORT_STATUSES),
  reviewerNote: z.string().trim().max(MAX_REVIEWER_NOTE_LENGTH).default(''),
});

function parseStatuses(raw: string | null): ContentReportStatus[] | undefined {
  if (!raw) return undefined;
  const requested = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (requested.length === 0) return undefined;
  const statuses = requested.filter(isContentReportStatus);
  if (statuses.length !== requested.length) {
    throw createError.badRequest(`status must be one of: ${CONTENT_REPORT_STATUSES.join(', ')}`);
  }
  return statuses;
}

function parseLimit(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) {
    throw createError.badRequest('limit must be a positive integer');
  }
  return limit;
}

async function handleReadQueue(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-security');
  if (rateLimitResponse) return rateLimitResponse as NextResponse;

  await requireAdmin(request);

  const statuses = parseStatuses(request.nextUrl.searchParams.get('status'));
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));

  try {
    const [reports, counts] = await Promise.all([
      readContentReportQueue({ statuses, limit }),
      readContentReportCounts(),
    ]);
    return NextResponse.json(
      { reports, counts },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    logger.error({ error }, 'Failed to read content report queue');
    throw createError.internal('Failed to read the content report queue');
  }
}

async function handleReview(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'admin-security');
  if (rateLimitResponse) return rateLimitResponse as NextResponse;

  const { userId: reviewerId } = await requireAdmin(request);

  const body = await request.json().catch(() => null);
  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.badRequest('Invalid content report review', parsed.error.flatten());
  }

  const { reportId, status, reviewerNote } = parsed.data;
  if ((status === 'actioned' || status === 'dismissed') && !reviewerNote) {
    throw createError.badRequest('A reviewer note is required to resolve a report');
  }

  let report: ContentReport | null;
  try {
    report = await reviewContentReport({ reportId, status, reviewerId, reviewerNote });
  } catch (error) {
    logger.error({ error, reportId, status }, 'Failed to record content report review');
    throw createError.internal('Failed to record the review');
  }

  if (!report) {
    throw createError.notFound('No content report has that id');
  }

  await logSecurityEvent({
    userId: reviewerId,
    eventType: 'admin_action',
    severity: 'medium',
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent') ?? undefined,
    endpoint: '/api/admin/content-reports',
    details: {
      action: 'content_report_review',
      reportId: report.id,
      status: report.status,
      category: report.category,
      reporterUserId: report.userId,
      reviewerNote: report.reviewerNote,
    },
  });

  return NextResponse.json({ report });
}

export const GET = withErrorHandler(handleReadQueue);
export const POST = withErrorHandler(handleReview);
