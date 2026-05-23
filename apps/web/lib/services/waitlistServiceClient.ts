/**
 * Client-side waitlist and invite-code service.
 *
 * This file is the browser-safe companion to waitlistService.ts (server-only).
 * It imports from @/lib/supabase (client singleton) and handles anonymous
 * sign-in inline — the modal must not hold auth state itself.
 *
 * Only call redeemInviteCode from the invite-code submit path. validateInviteCode
 * in the server service is a read-only admin helper; this client path always
 * does atomic validate + redeem via the security-definer RPC.
 */

import { getSupabase } from '@/lib/supabase';
import type { InviteCodeError } from '@/components/cloud-bridge/types';

interface RedeemRow {
  valid: boolean;
  invite_id: string | null;
  error: string | null;
}

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
 * Atomic validate + redeem via the validate_and_redeem_invite_code RPC.
 * Ensures an anonymous Supabase session exists before calling — the RPC
 * is GRANT'd to `authenticated` only and requires auth.uid() != null.
 */
export async function redeemInviteCode(code: string, source: string): Promise<RedeemInviteResult> {
  const client = getSupabase();

  // Ensure an authenticated session (anonymous sign-in if needed).
  const {
    data: { session },
  } = await client.auth.getSession();

  if (!session) {
    const { error: signInError } = await client.auth.signInAnonymously();
    if (signInError) {
      return { success: false, error: 'anon_signin_failed' };
    }
  }

  // cast to any: validate_and_redeem_invite_code is not yet in the generated
  // Supabase types (migration 20260523000000_beta_invites.sql) — types regenerate
  // after supabase db pull. The RPC signature and return shape are stable.
  const anyClient = client as unknown as {
    rpc: (name: string, args: Record<string, string>) => Promise<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await anyClient.rpc('validate_and_redeem_invite_code', {
    p_code: code.trim().toUpperCase(),
    p_surface: 'web',
    p_source: source,
  });

  if (error) {
    return { success: false, error: 'rpc_error' };
  }

  const rows = data as RedeemRow[] | null;
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    return { success: false, error: 'rpc_error' };
  }

  if (row.valid) {
    return { success: true, inviteId: row.invite_id ?? undefined };
  }

  return { success: false, error: (row.error as InviteCodeError) ?? 'rpc_error' };
}

/**
 * Waitlist signup. Maps name + referralSource onto the cloud_managed_waitlist
 * schema. The table's source column has a check constraint
 * ('byok'|'sync'|'billing'|'other') so InviteCodeSource values are coerced
 * to 'other' when they fall outside that set.
 */
export async function joinWaitlist(
  entry: WaitlistEntry,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabase();

  const allowedSources = new Set(['byok', 'sync', 'billing', 'other']);
  const source =
    entry.referralSource && allowedSources.has(entry.referralSource)
      ? entry.referralSource
      : 'other';

  // cloud_managed_waitlist is not yet in the generated Supabase types
  // (migration 20260522000000_cloud_managed_waitlist.sql — types regenerate after db pull).

  const { error } = await (client as any).from('cloud_managed_waitlist').upsert(
    {
      email: entry.email.toLowerCase().trim(),
      source,
    },
    { onConflict: 'email,source' },
  );

  if (error) {
    return { success: false, error: 'Failed to join waitlist. Please try again.' };
  }

  return { success: true };
}
