/**
 * Client-side waitlist and invite-code service.
 *
 * This file is the browser-safe companion to waitlistService.ts (server-only).
 * Routes through active Next.js API endpoints — Supabase browser access removed.
 */

import type { InviteCodeError } from '@/components/cloud-bridge/types';
import { addCsrfHeaders } from '@/lib/client/csrf';

export interface RedeemInviteResult {
  success: boolean;
  inviteId?: string;
  error?: InviteCodeError;
}

export interface WaitlistEntry {
  email: string;
  name?: string;
  referralSource?: string;
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

/**
 * Atomic validate + redeem via the active claim-offer route.
 */
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

/**
 * Waitlist signup via /api/waitlist/cloud-managed.
 */
export async function joinWaitlist(
  entry: WaitlistEntry,
): Promise<{ success: boolean; error?: string }> {
  try {
    const allowedSources = new Set(['byok', 'sync', 'billing', 'other']);
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

    return { success: true };
  } catch {
    return { success: false, error: 'Failed to join waitlist. Please try again.' };
  }
}
