import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { flagConfigProblems } from '@/lib/feature-flags/config-schema';
import { FlagDefinitionInputSchema } from '@/lib/feature-flags/flag-definition';
import { createFlag } from '@/lib/feature-flags/flag-admin-service';
import { listFlagDefinitions } from '@/lib/feature-flags/flag-store';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const INCLUDE_ARCHIVED_PARAM = 'include_archived';

async function handleList(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  await requirePlatformAdmin(request);

  const includeArchived = request.nextUrl.searchParams.get(INCLUDE_ARCHIVED_PARAM) === 'true';
  return NextResponse.json(
    { flags: await listFlagDefinitions({ includeArchived }) },
    { headers: NO_STORE },
  );
}

async function handleCreate(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await requirePlatformAdmin(request);

  const parsed = FlagDefinitionInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid flag definition', parsed.error.flatten());
  }
  const problems = flagConfigProblems(parsed.data);
  if (problems.length > 0) {
    throw createError.badRequest('The definition contradicts its flag namespace', { problems });
  }
  const flag = await createFlag({ userId, request }, parsed.data);
  return NextResponse.json({ flag }, { status: 201, headers: NO_STORE });
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleCreate);
