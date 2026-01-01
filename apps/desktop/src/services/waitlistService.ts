import { getSupabase } from '../lib/supabase';

export interface WaitlistEntry {
  email: string;
  name?: string;
  company?: string;
  role?: string;
  useCase?: string;
  referralSource?: string;
  referralCode?: string;
  marketingConsent?: boolean;
}

export interface BetaInvite {
  id: string;
  code: string;
  planTier: 'free' | 'pro' | 'enterprise';
  trialDays: number;
  discountPercent: number;
  stripeCouponId: string | null;
  maxUses: number;
  currentUses: number;
  expiresAt: string | null;
  isActive: boolean;
}

export interface WaitlistStats {
  total: number;
  pending: number;
  invited: number;
  converted: number;
}

export const STRIPE_PAYMENT_LINKS = {
  pro: 'https://buy.stripe.com/test_pro',
  enterprise: 'https://buy.stripe.com/test_enterprise',
};

class WaitlistService {
  private static instance: WaitlistService;

  private constructor() {}

  static getInstance(): WaitlistService {
    if (!WaitlistService.instance) {
      WaitlistService.instance = new WaitlistService();
    }
    return WaitlistService.instance;
  }

  async joinWaitlist(entry: WaitlistEntry): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabase();

    try {
      const { error } = await supabase.from('waitlist').insert({
        email: entry.email.toLowerCase().trim(),
        name: entry.name || null,
        company: entry.company || null,
        role: entry.role || null,
        use_case: entry.useCase || null,
        referral_source: entry.referralSource || null,
        referral_code: entry.referralCode || null,
        marketing_consent: entry.marketingConsent || false,
        status: 'pending',
      });

      if (error) {
        if (error.code === '23505') {
          return { success: false, error: 'This email is already on the waitlist!' };
        }
        throw error;
      }

      return { success: true };
    } catch (error) {
      console.error('[Waitlist] Error joining waitlist:', error);
      return { success: false, error: 'Failed to join waitlist. Please try again.' };
    }
  }

  async checkWaitlistStatus(
    email: string,
  ): Promise<{ onWaitlist: boolean; position?: number; status?: string }> {
    const supabase = getSupabase();

    try {
      const { data: entry, error } = await supabase
        .from('waitlist')
        .select('id, status, created_at')
        .eq('email', email.toLowerCase().trim())
        .single();

      if (error || !entry) {
        return { onWaitlist: false };
      }

      const { count } = await supabase
        .from('waitlist')
        .select('*', { count: 'exact', head: true })
        .lt('created_at', entry.created_at)
        .eq('status', 'pending');

      return {
        onWaitlist: true,
        position: (count || 0) + 1,
        status: entry.status,
      };
    } catch (error) {
      console.error('[Waitlist] Error checking status:', error);
      return { onWaitlist: false };
    }
  }

  async validateInviteCode(
    code: string,
  ): Promise<{ valid: boolean; invite?: BetaInvite; error?: string }> {
    const supabase = getSupabase();

    try {
      const { data, error } = await supabase
        .from('beta_invites')
        .select('*')
        .eq('code', code.toUpperCase().trim())
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return { valid: false, error: 'Invalid invite code' };
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return { valid: false, error: 'This invite code has expired' };
      }

      if ((data.current_uses ?? 0) >= (data.max_uses ?? 1)) {
        return { valid: false, error: 'This invite code has reached its usage limit' };
      }

      return {
        valid: true,
        invite: {
          id: data.id,
          code: data.code,
          planTier: (data.plan_tier as 'free' | 'pro' | 'enterprise') ?? 'free',
          trialDays: data.trial_days ?? 0,
          discountPercent: data.discount_percent ?? 0,
          stripeCouponId: data.stripe_coupon_id,
          maxUses: data.max_uses ?? 1,
          currentUses: data.current_uses ?? 0,
          expiresAt: data.expires_at,
          isActive: data.is_active ?? false,
        },
      };
    } catch (error) {
      console.error('[Waitlist] Error validating invite:', error);
      return { valid: false, error: 'Failed to validate invite code' };
    }
  }

  async redeemInviteCode(
    code: string,
    userId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabase();

    try {
      const validation = await this.validateInviteCode(code);
      if (!validation.valid || !validation.invite) {
        return { success: false, error: validation.error };
      }

      const { error: redemptionError } = await supabase.from('beta_redemptions').insert({
        invite_id: validation.invite.id,
        user_id: userId,
      });

      if (redemptionError) {
        if (redemptionError.code === '23505') {
          return { success: false, error: 'You have already used this invite code' };
        }
        throw redemptionError;
      }

      const { error: subscriptionError } = await supabase
        .from('subscriptions')
        .update({
          plan_tier: validation.invite.planTier,
          status: 'trialing',
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(
            Date.now() + validation.invite.trialDays * 24 * 60 * 60 * 1000,
          ).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (subscriptionError) {
        throw subscriptionError;
      }

      return { success: true };
    } catch (error) {
      console.error('[Waitlist] Error redeeming invite:', error);
      return { success: false, error: 'Failed to redeem invite code' };
    }
  }

  async getReferralCode(userId: string): Promise<string | null> {
    const supabase = getSupabase();

    try {
      const { data, error } = await supabase
        .from('referrals')
        .select('referral_code')
        .eq('referrer_id', userId)
        .single();

      if (error || !data) {
        return null;
      }

      return data.referral_code;
    } catch (error) {
      console.error('[Waitlist] Error getting referral code:', error);
      return null;
    }
  }

  async getReferralStats(
    userId: string,
  ): Promise<{ total: number; converted: number; rewarded: number }> {
    const supabase = getSupabase();

    try {
      const { data, error } = await supabase
        .from('referrals')
        .select('status')
        .eq('referrer_id', userId);

      if (error || !data) {
        return { total: 0, converted: 0, rewarded: 0 };
      }

      return {
        total: data.length,
        converted: data.filter((r) => r.status === 'converted' || r.status === 'rewarded').length,
        rewarded: data.filter((r) => r.status === 'rewarded').length,
      };
    } catch (error) {
      console.error('[Waitlist] Error getting referral stats:', error);
      return { total: 0, converted: 0, rewarded: 0 };
    }
  }

  getPaymentLink(plan: 'pro' | 'enterprise', couponCode?: string): string {
    let url = STRIPE_PAYMENT_LINKS[plan];

    if (couponCode) {
      url += `?prefilled_promo_code=${encodeURIComponent(couponCode)}`;
    }

    return url;
  }

  async updateEmailPreferences(
    email: string,
    preferences: {
      marketingEmails?: boolean;
      productUpdates?: boolean;
      securityAlerts?: boolean;
      weeklyDigest?: boolean;
    },
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabase();

    try {
      const { error } = await supabase
        .from('email_preferences')
        .update({
          marketing_emails: preferences.marketingEmails,
          product_updates: preferences.productUpdates,
          security_alerts: preferences.securityAlerts,
          weekly_digest: preferences.weeklyDigest,
          updated_at: new Date().toISOString(),
        })
        .eq('email', email.toLowerCase().trim());

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error('[Waitlist] Error updating email preferences:', error);
      return { success: false, error: 'Failed to update preferences' };
    }
  }

  async unsubscribe(token: string): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabase();

    try {
      const { error } = await supabase
        .from('email_preferences')
        .update({
          marketing_emails: false,
          weekly_digest: false,
          unsubscribed_at: new Date().toISOString(),
        })
        .eq('unsubscribe_token', token);

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error('[Waitlist] Error unsubscribing:', error);
      return { success: false, error: 'Failed to unsubscribe' };
    }
  }
}

export const waitlistService = WaitlistService.getInstance();
