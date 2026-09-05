import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ManagedCloudReflectRangeSchema,
  ManagedCloudReflectRecapSchema,
} from '@agiworkforce/cloud-contracts';
import { isValidIanaTimeZone } from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { loadManagedReflectRecap } from '@/lib/services/reflect-service';

const ReflectQuerySchema = z.object({
  range: ManagedCloudReflectRangeSchema.default('30d'),
  timezone: z.string().max(64).refine(isValidIanaTimeZone, 'Invalid timezone').default('UTC'),
});

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-activity');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const url = new URL(request.url);
  const parsed = ReflectQuerySchema.safeParse({
    range: url.searchParams.get('range') ?? undefined,
    timezone: url.searchParams.get('timezone') ?? undefined,
  });
  if (!parsed.success) throw createError.validation('Invalid Reflect query', parsed.error);
  const result = await loadManagedReflectRecap({ db, userId, organizationId, ...parsed.data });
  if (result.kind === 'memory-disabled') {
    return NextResponse.json(
      {
        error: {
          code: 'memory_required',
          message: 'Turn on Memory and Generate from past chats to view Reflect.',
        },
      },
      { status: 409 },
    );
  }

  return NextResponse.json(ManagedCloudReflectRecapSchema.parse(result.recap), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export const GET = withErrorHandler(handleGet);
