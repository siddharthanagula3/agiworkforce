/**
 * Client-side waitlist and invite-code service.
 *
 * This file is the browser-safe companion to waitlistService.ts (server-only).
 * Routes through /api/invite/redeem and /api/waitlist/join — Supabase removed.
 */

import type { InviteCodeError } from '@/components/cloud-bridge/types';

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

/**
 * Atomic validate + redeem via /api/invite/redeem.
 */
export async function redeemInviteCode(code: string, source: string): Promise<RedeemInviteResult> {
  try {
    const res = await fetch('/api/invite/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code.trim().toUpperCase(),
        surface: 'web',
        source,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { success: false, error: (body.error as InviteCodeError) ?? 'rpc_error' };
    }

    const data = (await res.json()) as { success?: boolean; invite_id?: string; error?: string };

    if (data.success) {
      return { success: true, inviteId: data.invite_id ?? undefined };
    }

    return { success: false, error: (data.error as InviteCodeError) ?? 'rpc_error' };
  } catch {
    return { success: false, error: 'rpc_error' };
  }
}

/**
 * Waitlist signup via /api/waitlist/join.
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

    const res = await fetch('/api/waitlist/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: entry.email.toLowerCase().trim(),
        name: entry.name,
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
