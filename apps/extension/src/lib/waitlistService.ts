import { getSupabase } from './supabase';
import type { InviteCodeError } from '../features/cloud-bridge/types';

export interface WaitlistEntry {
  email: string;
  name?: string;
  referralSource?: string;
}

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
        referral_source: entry.referralSource || null,
        status: 'pending',
      });

      if (error) {
        if (error.code === '23505') {
          return { success: false, error: 'This email is already on the waitlist!' };
        }
        throw error;
      }

      return { success: true };
    } catch {
      return { success: false, error: 'Failed to join waitlist. Please try again.' };
    }
  }

  async redeemInviteCode(
    code: string,
    source = 'cloud_unlock',
  ): Promise<{ success: boolean; inviteId?: string; error?: InviteCodeError }> {
    const supabase = getSupabase();
    try {
      let {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
        if (anonError || !anonData.session) {
          return { success: false, error: 'anon_signin_failed' };
        }
        session = anonData.session;
      }

      const { data, error } = await supabase.rpc('validate_and_redeem_invite_code', {
        p_code: code.toUpperCase().trim(),
        p_surface: 'chrome',
        p_source: source,
      });

      if (error) {
        return { success: false, error: 'rpc_error' };
      }

      const result = Array.isArray(data) ? data[0] : data;

      if (!result?.valid) {
        const errCode = (result?.error ?? 'rpc_error') as InviteCodeError;
        return { success: false, error: errCode };
      }

      return { success: true, inviteId: result.invite_id as string };
    } catch {
      return { success: false, error: 'rpc_error' };
    }
  }
}

export const waitlistService = WaitlistService.getInstance();
