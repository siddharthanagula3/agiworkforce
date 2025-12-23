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

    const { error: redemptionError } = await supabase.from('beta_redemptions').insert({
      invite_id: invite.id,
      user_id: user.id,
    });

    if (redemptionError) {
      console.error('[claim-offer] Error recording redemption:', redemptionError);
      return NextResponse.json({ error: 'Failed to redeem invite code' }, { status: 500 });
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
    }

    return NextResponse.json(
      {
        success: true,
        planTier: invite.plan_tier,
        trialDays: invite.trial_days ?? 0,
        discountPercent: invite.discount_percent ?? 0,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[claim-offer] Error:', error);
    return NextResponse.json({ error: 'Failed to process invite code' }, { status: 500 });
  }
}
