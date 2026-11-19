import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  MANAGED_CLOUD_PAGE_CONTENT_TYPES,
  ManagedCloudPageReadRequestSchema,
  ManagedCloudPageReadResponseSchema,
} from '@agiworkforce/cloud-contracts';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { requireCsrfToken } from '@/lib/csrf';
import { withRateLimit } from '@/lib/rate-limit';
import { withErrorHandler } from '@/lib/error-handler';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { executeUrlFetch } from '@/lib/url-fetch/url-fetch-tool';

export const runtime = 'nodejs';

async function handleReadPage(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getUserScopedDb(request);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const limited = await withRateLimit(request, 'page-read', `user:${userId}`);
  if (limited) return limited;
  const overDailyAllowance = await withRateLimit(
    request,
    'page-read-account-day',
    `user:${userId}`,
  );
  if (overDailyAllowance) return overDailyAllowance;
  const input = await readValidatedJsonBody(
    request,
    ManagedCloudPageReadRequestSchema,
    'A valid page URL is required',
  );
  const outcome = await executeUrlFetch(input, {
    signal: request.signal,
    allowedContentTypes: MANAGED_CLOUD_PAGE_CONTENT_TYPES,
  });
  return NextResponse.json(ManagedCloudPageReadResponseSchema.parse(outcome), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export const POST = withCorsRoute(withErrorHandler(handleReadPage));
export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
