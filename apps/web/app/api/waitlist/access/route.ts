import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { ClaimOfferRequestSchema } from '@/lib/validations/claim-offer';

type RedemptionResult = {
  valid: boolean;
  invite_id: string | null;
  error: string | null;
};

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'claim-offer');
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }
  const parsed = ClaimOfferRequestSchema.safeParse(body);
  if (!parsed.success) throw createError.validation('Enter a valid access code.');

  const [existing] = await db.query<{ redeemed: boolean }>(
    `select exists(
       select 1
       from beta_redemptions redemption
       join beta_invites invite on invite.id = redemption.invite_id
       where redemption.user_id = $1 and lower(invite.code) = lower($2)
     ) as redeemed`,
    [userId, parsed.data.code],
  );
  if (existing?.redeemed) return NextResponse.json({ ok: true, accessGranted: true });

  const [result] = await db.query<RedemptionResult>(
    'select valid, invite_id, error from validate_and_redeem_invite_code($1, $2, $3, $4)',
    [userId, parsed.data.code, 'web', 'billing-upgrade'],
  );
  if (result?.error === 'already_redeemed_by_user') {
    return NextResponse.json({ ok: true, accessGranted: true });
  }
  if (!result?.valid) {
    const message =
      result?.error === 'expired'
        ? 'This access code has expired.'
        : result?.error === 'fully_redeemed'
          ? 'This access code has already reached its redemption limit.'
          : 'This access code is not valid.';
    throw createError.validation(message);
  }

  await recordAuditEvent({
    userId,
    eventType: 'waitlist_access_redeemed',
    request,
    detail: {
      resourceType: 'billing_waitlist_access',
      ...(result.invite_id ? { resourceId: result.invite_id } : {}),
      source: 'billing-upgrade',
      surface: 'web',
    },
  });

  return NextResponse.json({ ok: true, accessGranted: true });
}

export const POST = withErrorHandler(handlePost);
