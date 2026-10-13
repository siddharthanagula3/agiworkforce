import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  OPERATOR_UPGRADE_ACCESS_CODES_PATH,
  OperatorUpgradeAccessCodeCreateSchema,
  OperatorUpgradeAccessCodeDisableSchema,
} from '@agiworkforce/cloud-contracts/waitlist';

import {
  createUpgradeAccessCode,
  disableUpgradeAccessCode,
  listUpgradeAccessCodes,
} from '@/features/admin/services/operator-upgrade-access';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withPrivateNoStore } from '@/lib/private-cache-policy';
import { withRateLimit } from '@/lib/rate-limit';
import { getClientIp, logSecurityEvent } from '@/lib/security-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function auditCodeChange(
  request: NextRequest,
  operatorUserId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await logSecurityEvent(
    {
      userId: operatorUserId,
      eventType: 'admin_action',
      severity: 'medium',
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
      endpoint: OPERATOR_UPGRADE_ACCESS_CODES_PATH,
      details,
    },
    { required: true },
  );
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  await requirePlatformAdmin(request);

  return NextResponse.json(await listUpgradeAccessCodes());
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await requirePlatformAdmin(request);

  const parsed = OperatorUpgradeAccessCodeCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    throw createError.badRequest('Invalid access code request', parsed.error.flatten());
  }
  const code = await createUpgradeAccessCode(userId, parsed.data);
  await auditCodeChange(request, userId, {
    action: 'upgrade_access_code_created',
    inviteId: code.id,
    maxRedemptions: code.maxRedemptions,
    expiresAt: code.expiresAt,
  });

  return NextResponse.json({ code }, { status: 201 });
}

async function handleDelete(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await requirePlatformAdmin(request);

  const parsed = OperatorUpgradeAccessCodeDisableSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    throw createError.badRequest('Name the access code to disable', parsed.error.flatten());
  }
  const code = await disableUpgradeAccessCode(parsed.data.id);
  await auditCodeChange(request, userId, {
    action: 'upgrade_access_code_disabled',
    inviteId: code.id,
    redemptions: code.redemptions,
  });

  return NextResponse.json({ code });
}

export const GET = withPrivateNoStore(withErrorHandler(handleGet));
export const POST = withPrivateNoStore(withErrorHandler(handlePost));
export const DELETE = withPrivateNoStore(withErrorHandler(handleDelete));
