import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import type { SubscriptionRow } from '@/lib/server/neon-types';
import { ClaimOfferRequestSchema } from '@/lib/validations/claim-offer';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { requireCsrfToken } from '@/lib/csrf';

async function handleClaimOffer(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  const rateLimitResponse = await withRateLimit(request, 'claim-offer');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const validationResult = ClaimOfferRequestSchema.safeParse(body);
  if (!validationResult.success) {
    throw createError.validation('Invalid request body', validationResult.error);
  }

  const { code: trimmedCode } = validationResult.data;

  try {
    type InviteRow = {
      id: string;
      plan_tier: string;
      trial_days: number | null;
      discount_percent: number | null;
    };
    // An invite belongs to nobody until it is redeemed, and claim_beta_invite
    // locks it, spends a use and writes the redemption row, none of which the
    // claimant owns yet. Both statements stay on the schema owner for that
    // reason; the subscription read-back below is the caller's own row.
    const [invite] = await getNeonDb().query<InviteRow>(
      'select id, plan_tier, trial_days, discount_percent from beta_invites where code = $1 and is_active = true limit 1',
      [trimmedCode],
    );

    if (!invite) {
      logger.warn(
        {
          userId: userId,
          code: trimmedCode,
        },
        'Invalid invite code',
      );
      throw createError.validation('Invalid invite code');
    }

    // claim_beta_invite is `returns json`, so `select *` yields ONE column named
    // after the function holding the whole object. Reading the row as the result
    // made every field undefined, so a valid redemption reported failure after
    // the function had already consumed the invite and written the subscription.
    type ClaimResult = {
      success: boolean;
      error: string | null;
      subscription_id: string | null;
      plan_tier: string | null;
      trial_days: number | null;
      discount_percent: number | null;
    };
    let claimRpcRows: { result: ClaimResult | null }[];
    try {
      claimRpcRows = await getNeonDb().query<{ result: ClaimResult | null }>(
        'select claim_beta_invite($1, $2, $3) as result',
        [userId, invite.id, invite.plan_tier],
      );
    } catch (claimError) {
      logger.error({ userId: userId, error: claimError }, 'Error calling claim_beta_invite RPC');
      throw createError.internal('Failed to claim invite code');
    }

    const result = claimRpcRows[0]?.result ?? null;

    if (!result?.success) {
      const msg = result?.error || 'Failed to claim invite code';
      if (msg.toLowerCase().includes('already')) {
        throw createError.conflict(msg);
      }
      throw createError.validation(msg);
    }

    type SubRow = Pick<
      SubscriptionRow,
      'id' | 'plan_tier' | 'status' | 'current_period_start' | 'current_period_end'
    >;
    let updatedSubscription: SubRow | undefined;
    try {
      const rows = await db.query<SubRow>(
        'select id, plan_tier, status, current_period_start, current_period_end from subscriptions where user_id = $1 limit 1',
        [userId],
      );
      updatedSubscription = rows[0];
    } catch (fetchError) {
      logger.warn(
        {
          userId: userId,
          error: fetchError,
        },
        'Error fetching updated subscription',
      );
    }

    if (
      updatedSubscription &&
      updatedSubscription.current_period_start &&
      updatedSubscription.current_period_end
    ) {
      try {
        await SubscriptionService.allocateCreditsForPeriod(
          userId,
          updatedSubscription.id,
          updatedSubscription.plan_tier,
          new Date(updatedSubscription.current_period_start),
          new Date(updatedSubscription.current_period_end),
        );
        logger.info(
          {
            userId: userId,
            subscriptionId: updatedSubscription.id,
            planTier: updatedSubscription.plan_tier,
            trialDays: invite.trial_days,
          },
          'Credits allocated for trial subscription',
        );
      } catch (creditError) {
        logger.error(
          {
            error: creditError,
            userId: userId,
            subscriptionId: updatedSubscription.id,
            planTier: invite.plan_tier,
          },
          'Failed to allocate credits for trial subscription',
        );
      }
    }

    logger.info(
      {
        userId: userId,
        inviteId: invite.id,
        planTier: updatedSubscription?.plan_tier || invite.plan_tier,
      },
      'Invite code redeemed successfully',
    );

    return NextResponse.json(
      {
        success: true,
        planTier: updatedSubscription?.plan_tier || invite.plan_tier,
        trialDays: invite.trial_days ?? 0,
        discountPercent: invite.discount_percent ?? 0,
        subscription: updatedSubscription
          ? {
              id: updatedSubscription.id,
              plan_tier: updatedSubscription.plan_tier,
              status: updatedSubscription.status,
              current_period_start: updatedSubscription.current_period_start,
              current_period_end: updatedSubscription.current_period_end,
            }
          : null,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        userId: userId,
      },
      'Error in claim-offer',
    );
    throw error;
  }
}

export const POST = withErrorHandler(handleClaimOffer);
