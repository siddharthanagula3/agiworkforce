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
  maxUses: number;
  currentUses: number;
  expiresAt: string | null;
  isActive: boolean;
  // v2-compat: read from metadata jsonb when present; undefined in v1
  planTier?: 'free' | 'pro' | 'enterprise';
  trialDays?: number;
  discountPercent?: number;
  stripeCouponId?: string;
}

export interface WaitlistStats {
  total: number;
  pending: number;
  invited: number;
  converted: number;
}

// Typed error codes returned by validate_and_redeem_invite_code RPC.
// InviteCodeModal currently pattern-matches prose strings; a follow-up
// (Stage 0c) should switch it to these discriminated codes.
export type InviteCodeError =
  | 'invalid_code'
  | 'expired'
  | 'fully_redeemed'
  | 'already_redeemed_by_user'
  | 'anon_signin_failed'
  | 'rpc_error';

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

  // validateInviteCode is kept as a read-only helper for callers that need to
  // inspect invite metadata without redeeming (e.g. admin UI, pre-flight UI hints).
  // Under the current v1 schema, beta_invites has RLS set to block direct SELECT
  // for anon/authenticated roles — all flows go through the RPC. This method will
  // always return valid=false in v1 unless called from a service-role context.
  // Kept to avoid breaking the InviteCodeModal call at InviteCodeModal.tsx:67;
  // Stage 0c will migrate the modal to call redeemInviteCode directly.
  async validateInviteCode(
    code: string,
  ): Promise<{ valid: boolean; invite?: BetaInvite; error?: string }> {
    const supabase = getSupabase();

    try {
      const { data, error } = await supabase
        .from('beta_invites')
        .select('id, code, max_uses, current_uses, expires_at, is_active, metadata')
        .eq('code', code.toUpperCase().trim())
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return { valid: false, error: 'invalid_code' };
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return { valid: false, error: 'expired' };
      }

      if ((data.current_uses ?? 0) >= (data.max_uses ?? 1)) {
        return { valid: false, error: 'fully_redeemed' };
      }

      const meta = (data.metadata ?? {}) as Record<string, unknown>;

      return {
        valid: true,
        invite: {
          id: data.id,
          code: data.code,
          maxUses: data.max_uses ?? 1,
          currentUses: data.current_uses ?? 0,
          expiresAt: data.expires_at,
          isActive: data.is_active ?? false,
          planTier:
            typeof meta['plan_tier'] === 'string'
              ? (meta['plan_tier'] as 'free' | 'pro' | 'enterprise')
              : undefined,
          trialDays: typeof meta['trial_days'] === 'number' ? meta['trial_days'] : undefined,
          discountPercent:
            typeof meta['discount_percent'] === 'number' ? meta['discount_percent'] : undefined,
          stripeCouponId:
            typeof meta['stripe_coupon_id'] === 'string' ? meta['stripe_coupon_id'] : undefined,
        },
      };
    } catch (error) {
      console.error('[Waitlist] Error validating invite:', error);
      return { valid: false, error: 'rpc_error' };
    }
  }

  // redeemInviteCode — atomic validate + redeem via security-definer RPC.
  // userId parameter removed: auth session (anonymous or linked) provides identity.
  // For v1 local-only users, an anonymous Supabase session is created inline per
  // the v1-local-only-cloud-waitlist lock (no account required; anon row upgradeable
  // via linkIdentity() in v2).
  async redeemInviteCode(
    code: string,
    source: string = 'cloud_unlock',
  ): Promise<{ success: boolean; inviteId?: string; error?: InviteCodeError }> {
    const supabase = getSupabase();

    try {
      // Ensure an auth session — anonymous is fine for v1.
      let {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
        if (anonError || !anonData.session) {
          console.error('[Waitlist] Anonymous sign-in failed:', anonError);
          return { success: false, error: 'anon_signin_failed' };
        }
        session = anonData.session;
      }

      // Atomic validate + redeem: FOR UPDATE lock prevents concurrent double-spend.
      const { data, error } = await supabase.rpc('validate_and_redeem_invite_code', {
        p_code: code.toUpperCase().trim(),
        p_surface: 'desktop',
        p_source: source,
      });

      if (error) {
        console.error('[Waitlist] RPC error:', error);
        return { success: false, error: 'rpc_error' };
      }

      const result = Array.isArray(data) ? data[0] : data;

      if (!result?.valid) {
        const errCode = (result?.error ?? 'rpc_error') as InviteCodeError;
        return { success: false, error: errCode };
      }

      return { success: true, inviteId: result.invite_id as string };
    } catch (error) {
      console.error('[Waitlist] Error redeeming invite:', error);
      return { success: false, error: 'rpc_error' };
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
