import 'server-only';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../services/supabase-server';

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const code: string | undefined = body?.code;

  if (!code || !code.trim()) {
    return NextResponse.json({ error: 'Invite code is required' }, { status: 400 });
  }

  const trimmedCode = code.trim().toUpperCase();

  if (trimmedCode.length > 50 || !/^[A-Z0-9]+$/.test(trimmedCode)) {
    return NextResponse.json(
      { error: 'Invalid invite code format. Codes must be alphanumeric and up to 50 characters.' },
      { status: 400 },
    );
  }

  try {
    const { data: invite, error: inviteError } = await supabase
      .from('beta_invites')
      .select('*')
      .eq('code', trimmedCode)
      .eq('is_active', true)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 400 });
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invite code has expired' }, { status: 400 });
    }

    if ((invite.current_uses ?? 0) >= (invite.max_uses ?? 1)) {
      return NextResponse.json(
        { error: 'This invite code has reached its usage limit' },
        { status: 400 },
      );
    }

    // Check if user has already redeemed THIS specific invite code
    const { data: existingRedemption } = await supabase
      .from('beta_redemptions')
      .select('id')
      .eq('invite_id', invite.id)
      .eq('user_id', user.id)
      .single();

    if (existingRedemption) {
      return NextResponse.json(
        { error: 'You have already used this invite code' },
        { status: 400 },
      );
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
      return NextResponse.json(
        {
          error: `You already have an active ${existingSubscription.plan_tier} plan. Please manage your existing subscription instead.`,
        },
        { status: 400 },
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
      return NextResponse.json(
        {
          error: 'You have already claimed an offer. Each user can only claim one offer.',
        },
        { status: 400 },
      );
    }

    const { error: redemptionError } = await supabase.from('beta_redemptions').insert({
      invite_id: invite.id,
      user_id: user.id,
    });

    if (redemptionError) {
      console.error('[claim-offer] Error recording redemption:', redemptionError);
      return NextResponse.json({ error: 'Failed to redeem invite code' }, { status: 500 });
    }

    // Update invite code usage count
    const { error: updateInviteError } = await supabase
      .from('beta_invites')
      .update({ current_uses: (invite.current_uses ?? 0) + 1 })
      .eq('id', invite.id);

    if (updateInviteError) {
      console.error('[claim-offer] Error updating invite usage count:', updateInviteError);
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
      console.error('[claim-offer] Error updating subscription:', subscriptionError);
      return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
    }

    // Fetch the updated subscription to return to client
    const { data: updatedSubscription, error: fetchError } = await supabase
      .from('subscriptions')
      .select('id, plan_tier, status, current_period_start, current_period_end')
      .eq('user_id', user.id)
      .single();

    if (fetchError) {
      console.error('[claim-offer] Error fetching updated subscription:', fetchError);
    }

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
    console.error('[claim-offer] Error:', error);
    return NextResponse.json({ error: 'Failed to process invite code' }, { status: 500 });
  }
}
