import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../services/supabase-server';
import { ClaimOfferRequestSchema } from '@/lib/validations/claim-offer';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { SubscriptionService } from '@/lib/services/subscription-service';

async function handleClaimOffer(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'claim-offer');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw createError.unauthorized();
  }

  // Parse and validate request body
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
    const { data: invite, error: inviteError } = await supabase
      .from('beta_invites')
      .select('*')
      .eq('code', trimmedCode)
      .eq('is_active', true)
      .single();

    if (inviteError || !invite) {
      logger.warn(
        {
          userId: user.id,
          code: trimmedCode,
          error: inviteError,
        },
        'Invalid invite code',
      );
      throw createError.validation('Invalid invite code');
    }

    // Atomic claim via RPC (prevents race conditions and enforces one-offer-per-user)
    const { data: claimResult, error: claimError } = await supabase.rpc('claim_beta_invite', {
      p_user_id: user.id,
      p_invite_id: invite.id,
      p_plan_tier: invite.plan_tier,
    });

    if (claimError) {
      logger.error({ userId: user.id, error: claimError }, 'Error calling claim_beta_invite RPC');
      throw createError.internal('Failed to claim invite code');
    }

    const result = claimResult as {
      success?: boolean;
      error?: string;
      subscription_id?: string;
      plan_tier?: string;
      trial_days?: number;
      discount_percent?: number;
    } | null;

    if (!result?.success) {
      const msg = result?.error || 'Failed to claim invite code';
      // Map to conflict vs validation
      if (msg.toLowerCase().includes('already')) {
        throw createError.conflict(msg);
      }
      throw createError.validation(msg);
    }

    // Fetch the updated subscription to return to client
    const { data: updatedSubscription, error: fetchError } = await supabase
      .from('subscriptions')
      .select('id, plan_tier, status, current_period_start, current_period_end')
      .eq('user_id', user.id)
      .single();

    if (fetchError) {
      logger.warn(
        {
          userId: user.id,
          error: fetchError,
        },
        'Error fetching updated subscription',
      );
    }

    // Allocate credits for the trial period
    if (
      updatedSubscription &&
      updatedSubscription.current_period_start &&
      updatedSubscription.current_period_end
    ) {
      try {
        await SubscriptionService.allocateCreditsForPeriod(
          user.id,
          updatedSubscription.id,
          updatedSubscription.plan_tier,
          new Date(updatedSubscription.current_period_start),
          new Date(updatedSubscription.current_period_end),
        );
        logger.info(
          {
            userId: user.id,
            subscriptionId: updatedSubscription.id,
            planTier: updatedSubscription.plan_tier,
            trialDays: invite.trial_days,
          },
          'Credits allocated for trial subscription',
        );
      } catch (creditError) {
        // Log but don't fail the request if credit allocation fails
        logger.error(
          {
            error: creditError,
            userId: user.id,
            subscriptionId: updatedSubscription.id,
            planTier: invite.plan_tier,
          },
          'Failed to allocate credits for trial subscription',
        );
      }
    }

    logger.info(
      {
        userId: user.id,
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
        userId: user.id,
      },
      'Error in claim-offer',
    );
    throw error;
  }
}

export const POST = withErrorHandler(handleClaimOffer);
