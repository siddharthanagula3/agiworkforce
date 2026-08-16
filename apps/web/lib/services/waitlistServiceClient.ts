
import type { InviteCodeError } from '@shared/components/cloud-bridge/types';
import { addCsrfHeaders } from '@/lib/client/csrf';
import type { ConsentDecision } from '@/lib/consent-purposes';

export interface RedeemInviteResult {
  success: boolean;
  inviteId?: string;
  error?: InviteCodeError;
}

export interface WaitlistEntry {
  email: string;
  name?: string;
  referralSource?: string;
  consent?: ConsentDecision[];
  consentSurface?: 'web-waitlist-inline' | 'web-waitlist-modal';
}

export interface JoinWaitlistResult {
  success: boolean;
  error?: string;
  rank?: number;
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

export async function redeemInviteCode(code: string, source: string): Promise<RedeemInviteResult> {
  void source;
  try {
    const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/claim-offer', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        code: code.trim().toUpperCase(),
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: string | { code?: string; message?: string };
      };
      const error =
        typeof body.error === 'object' ? (body.error.code ?? body.error.message) : body.error;
      return { success: false, error: toInviteCodeError(error) };
    }

    const data = (await res.json()) as {
      success?: boolean;
      inviteId?: string;
      invite_id?: string;
      error?: string;
    };

    if (data.success) {
      return { success: true, inviteId: data.inviteId ?? data.invite_id ?? undefined };
    }

    return { success: false, error: toInviteCodeError(data.error) };
  } catch {
    return { success: false, error: 'rpc_error' };
  }
}

export async function joinPublicWaitlist(entry: WaitlistEntry): Promise<JoinWaitlistResult> {
  try {
    const allowedSources = new Set(['website', 'byok', 'sync', 'billing', 'mobile', 'other']);
    const source =
      entry.referralSource && allowedSources.has(entry.referralSource)
        ? entry.referralSource
        : 'website';

    const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/waitlist/public', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: entry.email.toLowerCase().trim(),
        source,
        consent: entry.consent ?? [],
        consentSurface: entry.consentSurface ?? 'web-waitlist-inline',
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { code?: string; message?: string } | string;
      } | null;
      const message =
        typeof body?.error === 'object' && typeof body.error?.message === 'string'
          ? body.error.message
          : 'Failed to join waitlist. Please try again.';
      return { success: false, error: message };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Failed to join waitlist. Please try again.' };
  }
}

export async function joinWaitlist(entry: WaitlistEntry): Promise<JoinWaitlistResult> {
  try {
    const allowedSources = new Set(['byok', 'sync', 'billing', 'mobile', 'other']);
    const source =
      entry.referralSource && allowedSources.has(entry.referralSource)
        ? entry.referralSource
        : 'other';

    const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/waitlist/cloud-managed', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: entry.email.toLowerCase().trim(),
        source,
      }),
    });

    if (!res.ok) {
      return { success: false, error: 'Failed to join waitlist. Please try again.' };
    }

    const data = (await res.json().catch(() => ({}))) as { rank?: unknown };
    const rank =
      typeof data.rank === 'number' && Number.isFinite(data.rank) ? data.rank : undefined;

    return rank === undefined ? { success: true } : { success: true, rank };
  } catch {
    return { success: false, error: 'Failed to join waitlist. Please try again.' };
  }
}
