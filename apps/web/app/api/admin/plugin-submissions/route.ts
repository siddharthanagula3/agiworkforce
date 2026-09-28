import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  PLUGIN_SUBMISSION_REVIEW_STATUS_PARAM,
  PLUGIN_SUBMISSION_STATUSES,
  type PluginSubmissionReviewListResponse,
} from '@agiworkforce/cloud-contracts';
import { z } from 'zod';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { listSubmissionsForReview } from '@/lib/services/plugin-submission-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const StatusSchema = z.enum(PLUGIN_SUBMISSION_STATUSES).nullable();

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'admin-operator');
  if (limited) return limited;
  await requirePlatformAdmin(request);

  const status = StatusSchema.safeParse(
    request.nextUrl.searchParams.get(PLUGIN_SUBMISSION_REVIEW_STATUS_PARAM),
  );
  if (!status.success) throw createError.validation('That is not a submission status.');
  const body: PluginSubmissionReviewListResponse = {
    submissions: await listSubmissionsForReview(getNeonDb(), status.data),
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
