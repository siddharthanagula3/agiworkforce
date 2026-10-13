import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { OperatorUpgradeAccessChangeSchema } from '@agiworkforce/cloud-contracts/waitlist';

import { readUpgradeAccessState } from '@/features/admin/services/operator-upgrade-access';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { setBillingUpgradesOpen } from '@/lib/feature-flags/flag-admin-service';
import { withPrivateNoStore } from '@/lib/private-cache-policy';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  await requirePlatformAdmin(request);

  return NextResponse.json(await readUpgradeAccessState());
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await requirePlatformAdmin(request);

  const parsed = OperatorUpgradeAccessChangeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    throw createError.badRequest('Say whether paid upgrades are open', parsed.error.flatten());
  }
  await setBillingUpgradesOpen({ userId, request }, parsed.data.open);

  return NextResponse.json(await readUpgradeAccessState());
}

export const GET = withPrivateNoStore(withErrorHandler(handleGet));
export const POST = withPrivateNoStore(withErrorHandler(handlePost));
