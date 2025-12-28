import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../services/supabase-server';
import { ClaimOfferRequestSchema } from '@/lib/validations/claim-offer';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { validateCsrfFromRequest } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { SubscriptionService } from '@/lib/services/subscription-service';

async function handleClaimOffer(request: NextRequest) {
  // CSRF protection
  const csrfValid = await validateCsrfFromRequest(request);
  if (!csrfValid) {
    logger.warn({}, 'CSRF validation failed for claim-offer');
    throw createError.forbidden('CSRF token validation failed');
  }

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

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      throw createError.validation('This invite code has expired');
    }

    if ((invite.current_uses ?? 0) >= (invite.max_uses ?? 1)) {
      throw createError.validation('This invite code has reached its usage limit');
    }

    // Check if user has already redeemed THIS specific invite code
    const { data: existingRedemption } = await supabase
      .from('beta_redemptions')
      .select('id')
      .eq('invite_id', invite.id)
      .eq('user_id', user.id)
      .single();

    if (existingRedemption) {
      throw createError.conflict('You have already used this invite code');
    }

    // Check if user has already claimed ANY offer (prevent multiple claims)
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('plan_tier, status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (
      existingSubscription &&
      existingSubscription.plan_tier !== 'free' &&
      ['active', 'trialing', 'past_due'].includes(existingSubscription.status)
    ) {
      throw createError.conflict(
        `You already have an active ${existingSubscription.plan_tier} plan. Please manage your existing subscription instead.`,
      );
    }

    // Also check if user has redeemed ANY other invite code
    const { data: anyRedemption } = await supabase
      .from('beta_redemptions')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (anyRedemption) {
      throw createError.conflict(
        'You have already claimed an offer. Each user can only claim one offer.',
      );
    }

    const { error: redemptionError } = await supabase.from('beta_redemptions').insert({
      invite_id: invite.id,
      user_id: user.id,
    });

    if (redemptionError) {
      logger.error(
        {
          userId: user.id,
          inviteId: invite.id,
          error: redemptionError,
        },
        'Error recording redemption',
      );
      throw createError.internal('Failed to redeem invite code');
    }

    // Update invite code usage count
    const { error: updateInviteError } = await supabase
      .from('beta_invites')
      .update({ current_uses: (invite.current_uses ?? 0) + 1 })
      .eq('id', invite.id);

    if (updateInviteError) {
      logger.warn(
        {
          userId: user.id,
          inviteId: invite.id,
          error: updateInviteError,
        },
        'Error updating invite usage count',
      );
      // Don't fail the request, but log the error
    }

    const trialEndDate = new Date(
      Date.now() + (invite.trial_days ?? 0) * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error: subscriptionError } = await supabase.from('subscriptions').upsert(
      {
        user_id: user.id,
        plan_tier: invite.plan_tier,
        status: 'trialing',
        current_period_start: new Date().toISOString(),
        current_period_end: trialEndDate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (subscriptionError) {
      logger.error(
        {
          userId: user.id,
          error: subscriptionError,
        },
        'Error updating subscription',
      );
      throw createError.internal('Failed to update subscription');
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
          invite.plan_tier,
          new Date(updatedSubscription.current_period_start),
          new Date(updatedSubscription.current_period_end),
        );
        logger.info(
          {
            userId: user.id,
            subscriptionId: updatedSubscription.id,
            planTier: invite.plan_tier,
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
        planTier: invite.plan_tier,
      },
      'Invite code redeemed successfully',
    );

    return NextResponse.json(
      {
        success: true,
        planTier: invite.plan_tier,
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
