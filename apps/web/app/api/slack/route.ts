import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { ManagedCloudSlackOverviewSchema } from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { loadSlackOverview } from '@/lib/slack/slack-settings';

async function handleOverview(request: NextRequest): Promise<NextResponse> {
  const { db, userId, organizationId } = await getUserScopedDb(request, {
    resolveOrganization: true,
  });
  const rateLimitResponse = await withRateLimit(request, 'slack-settings', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;
  return NextResponse.json(
    ManagedCloudSlackOverviewSchema.parse(await loadSlackOverview(db, userId, organizationId)),
  );
}

export const GET = withErrorHandler(handleOverview);
