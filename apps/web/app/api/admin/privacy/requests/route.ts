import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import {
  countOpenDataRightsRequests,
  readOpenDataRightsRequests,
} from '@/lib/server/data-rights-requests';

const QueueWindowSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  await requirePlatformAdmin(request);

  const window = QueueWindowSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!window.success) {
    throw createError.validation('Invalid queue window', window.error.flatten());
  }

  const [requests, total] = await Promise.all([
    readOpenDataRightsRequests(window.data.limit, new Date(), window.data.offset),
    countOpenDataRightsRequests(),
  ]);

  return NextResponse.json(
    {
      requests,
      count: requests.length,
      total,
      hasMore: window.data.offset + requests.length < total,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = withErrorHandler(handleGet);
