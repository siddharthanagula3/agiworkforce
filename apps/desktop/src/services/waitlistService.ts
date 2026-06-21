import { WEB_APP_URL } from '../api/config';
import { guardedFetch } from '../lib/egressGuard';
import type { InviteCodeError } from '../features/cloud-bridge/types';

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

export type { InviteCodeError } from '../features/cloud-bridge/types';

const WEB_API_NOT_WIRED_ERROR =
  'AGI web API base URL is not configured for desktop Cloud waitlist and invite-code calls.';

class WebApiConfigError extends Error {}

function getWebApiBaseUrl(): string {
  const configured =
    (import.meta.env['VITE_AGI_WEB_API_BASE_URL'] as string | undefined)?.trim() ||
    WEB_APP_URL.trim();

  if (!configured) {
    throw new WebApiConfigError(WEB_API_NOT_WIRED_ERROR);
  }

  try {
    const parsed = new URL(configured);
    const isLocalhost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]';
    const isAgiWeb =
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'agiworkforce.com' || parsed.hostname.endsWith('.agiworkforce.com'));

    if (!isLocalhost && !isAgiWeb) throw new WebApiConfigError(WEB_API_NOT_WIRED_ERROR);
    if (isLocalhost && parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new WebApiConfigError(WEB_API_NOT_WIRED_ERROR);
    }

    return parsed.origin;
  } catch (error) {
    if (error instanceof WebApiConfigError) throw error;
    throw new WebApiConfigError(WEB_API_NOT_WIRED_ERROR);
  }
}

async function fetchCsrfHeaders(baseUrl: string): Promise<Record<string, string>> {
  const response = await guardedFetch(`${baseUrl}/api/csrf`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch CSRF token: ${response.status}`);
  }

  const data = (await response.json()) as { token?: unknown; csrfToken?: unknown };
  const token = typeof data.token === 'string' ? data.token : data.csrfToken;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('CSRF token response was invalid');
  }

  return {
    'content-type': 'application/json',
    'x-csrf-token': token,
    'x-requested-with': 'agiworkforce-desktop',
  };
}

function toInviteCodeError(value: unknown): InviteCodeError {
  if (
    value === 'invalid_code' ||
    value === 'expired' ||
    value === 'fully_redeemed' ||
    value === 'already_redeemed_by_user' ||
    value === 'anon_signin_failed' ||
    value === 'rpc_error'
  ) {
    return value;
  }

  const message = typeof value === 'string' ? value.toLowerCase() : '';
  if (message.includes('invalid')) return 'invalid_code';
  if (message.includes('expired')) return 'expired';
  if (message.includes('fully') || message.includes('maximum')) return 'fully_redeemed';
  if (message.includes('already')) return 'already_redeemed_by_user';
  return 'rpc_error';
}

function waitlistSourceForWebApi(
  source: string | undefined,
): 'byok' | 'sync' | 'billing' | 'other' {
  return source === 'byok' || source === 'sync' || source === 'billing' ? source : 'other';
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
    try {
      const baseUrl = getWebApiBaseUrl();
      const headers = await fetchCsrfHeaders(baseUrl);
      const response = await guardedFetch(`${baseUrl}/api/waitlist/cloud-managed`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          email: entry.email.toLowerCase().trim(),
          source: waitlistSourceForWebApi(entry.referralSource),
        }),
      });

      if (!response.ok) {
        return { success: false, error: 'Failed to join waitlist. Please try again.' };
      }

      return { success: true };
    } catch (error) {
      if (error instanceof WebApiConfigError) {
        return { success: false, error: error.message };
      }
      return { success: false, error: 'Failed to join waitlist. Please try again.' };
    }
  }

  async checkWaitlistStatus(
    _email: string,
  ): Promise<{ onWaitlist: boolean; position?: number; status?: string }> {
    return { onWaitlist: false };
  }

  async validateInviteCode(
    _code: string,
  ): Promise<{ valid: boolean; invite?: BetaInvite; error?: string }> {
    return { valid: false, error: 'not_available' };
  }

  async redeemInviteCode(
    code: string,
    source = 'cloud_unlock',
  ): Promise<{ success: boolean; inviteId?: string; error?: InviteCodeError }> {
    void source;
    try {
      const baseUrl = getWebApiBaseUrl();
      const headers = await fetchCsrfHeaders(baseUrl);
      const response = await guardedFetch(`${baseUrl}/api/claim-offer`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ code: code.toUpperCase().trim() }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string | { code?: string; message?: string };
        };
        const error =
          typeof body.error === 'object' ? (body.error.code ?? body.error.message) : body.error;
        return { success: false, error: toInviteCodeError(error) };
      }

      const data = (await response.json()) as {
        success?: boolean;
        inviteId?: string;
        invite_id?: string;
        subscription?: { id?: string } | null;
        error?: string;
      };

      if (data.success) {
        return {
          success: true,
          inviteId: data.inviteId ?? data.invite_id ?? data.subscription?.id ?? 'claim-offer',
        };
      }

      return { success: false, error: toInviteCodeError(data.error) };
    } catch (error) {
      if (error instanceof WebApiConfigError) {
        return { success: false, error: 'rpc_error' };
      }
      return { success: false, error: 'rpc_error' };
    }
  }

  async getReferralCode(_userId: string): Promise<string | null> {
    return null;
  }

  async getReferralStats(
    _userId: string,
  ): Promise<{ total: number; converted: number; rewarded: number }> {
    return { total: 0, converted: 0, rewarded: 0 };
  }

  async updateEmailPreferences(
    _email: string,
    _preferences: {
      marketingEmails?: boolean;
      productUpdates?: boolean;
      securityAlerts?: boolean;
      weeklyDigest?: boolean;
    },
  ): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Email preferences must be updated from AGI web.' };
  }

  async unsubscribe(_token: string): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Unsubscribe links are handled by AGI web.' };
  }
}

export const waitlistService = WaitlistService.getInstance();
