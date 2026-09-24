import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { assertAccountActive } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import { readSearchAllowance } from '@/lib/web-search/search-budget';

export const runtime = 'nodejs';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'model-catalog');
  if (rateLimitResponse) return rateLimitResponse;
  const scoped = await getUserScopedDb(request, { resolveOrganization: false });
  await assertAccountActive(scoped.userId);
  const planTier = await resolveEntitledPlanTier(scoped.db, scoped.userId);
  const allowance = await readSearchAllowance({
    userId: scoped.userId,
    planTier,
    db: scoped.db,
  });
  return NextResponse.json(allowance, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withErrorHandler(handleGet);
