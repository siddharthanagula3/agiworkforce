import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { DeveloperRequestLogPageSchema } from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { listDeveloperRequestLogs } from '@/lib/services/developer-request-log-service';

const BeforeSchema = z.iso.datetime({ offset: true }).nullable();

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'developer-console');
  if (rateLimitResponse) return rateLimitResponse;

  const before = BeforeSchema.safeParse(request.nextUrl.searchParams.get('before'));
  if (!before.success) throw createError.validation('Invalid request', before.error.issues);

  const { db, userId } = await getUserScopedDb(request);
  return NextResponse.json(
    DeveloperRequestLogPageSchema.parse(await listDeveloperRequestLogs(db, userId, before.data)),
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = withErrorHandler(handleGet);
