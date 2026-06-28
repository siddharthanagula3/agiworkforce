import type { InviteCodeError } from '../features/cloud-bridge/types';

export interface WaitlistEntry {
  email: string;
  name?: string;
  referralSource?: string;
}

const WEB_API_NOT_WIRED_ERROR =
  'AGI web API base URL is not configured for the extension. Code-redemption and product-update calls are not wired.';

const WEB_API_INVALID_CONFIG_ERROR =
  'AGI web API base URL is invalid for the extension. Code-redemption and product-update calls are not wired.';

class WebApiConfigError extends Error {}

function getMetaEnv(): Record<string, string | undefined> {
  const importEnv =
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const processEnv =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

  return { ...processEnv, ...importEnv };
}

function validateWebApiBaseUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    const isLocalhost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]';
    const isAgiWeb =
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'agiworkforce.com' || parsed.hostname.endsWith('.agiworkforce.com'));

    if (!isLocalhost && !isAgiWeb) return null;
    if (isLocalhost && parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    return parsed.origin;
  } catch {
    return null;
  }
}

function getWebApiBaseUrl(): string {
  const env = getMetaEnv();
  const configured =
    env['VITE_AGI_WEB_API_BASE_URL']?.trim() || env['VITE_API_BASE_URL']?.trim() || '';

  if (!configured) {
    throw new WebApiConfigError(WEB_API_NOT_WIRED_ERROR);
  }

  const validated = validateWebApiBaseUrl(configured);
  if (!validated) {
    throw new WebApiConfigError(WEB_API_INVALID_CONFIG_ERROR);
  }

  return validated;
}

async function addCsrfHeaders(baseUrl: string): Promise<Record<string, string>> {
  const response = await fetch(`${baseUrl}/api/csrf`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch CSRF token: ${response.status}`);
  }

  const data = (await response.json()) as { token?: unknown };
  if (typeof data.token !== 'string' || data.token.length === 0) {
    throw new Error('CSRF token response was invalid');
  }

  return {
    'content-type': 'application/json',
    'x-csrf-token': data.token,
    'x-requested-with': 'agiworkforce-chrome-extension',
  };
}

function toInviteCodeError(value: unknown): InviteCodeError {
  if (
    value === 'invalid_code' ||
    value === 'expired' ||
    value === 'fully_redeemed' ||
    value === 'already_redeemed_by_user' ||
    value === 'anon_signin_failed' ||
    value === 'not_wired' ||
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
      const headers = await addCsrfHeaders(baseUrl);
      const response = await fetch(`${baseUrl}/api/waitlist/cloud-managed`, {
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

  async redeemInviteCode(
    code: string,
    source = 'cloud_unlock',
  ): Promise<{ success: boolean; inviteId?: string; error?: InviteCodeError }> {
    void source;
    try {
      const baseUrl = getWebApiBaseUrl();
      const headers = await addCsrfHeaders(baseUrl);
      const response = await fetch(`${baseUrl}/api/claim-offer`, {
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
          inviteId:
            data.inviteId ?? data.invite_id ?? data.subscription?.id ?? 'web-api-claim-offer',
        };
      }

      return { success: false, error: toInviteCodeError(data.error) };
    } catch (error) {
      if (error instanceof WebApiConfigError) {
        return { success: false, error: 'not_wired' };
      }
      return { success: false, error: 'rpc_error' };
    }
  }
}

export const waitlistService = WaitlistService.getInstance();
