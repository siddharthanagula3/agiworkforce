/**
 * @file waitlistService.ts
 *
 * Web-surface waitlist and invite-code service.
 *
 * # v1 scope
 *
 * v1 ships two methods only: joinWaitlist + validateInviteCode.
 * checkWaitlistStatus is deferred to v2 — it needs a rank RPC for
 * cloud_managed_waitlist. The rank RPC that exists today (cloud_waitlist_rank)
 * targets the older cloud_waitlist table, not cloud_managed_waitlist, so the
 * two don't compose correctly.
 *
 * # Client injection contract
 *
 * Methods that act on behalf of an authenticated user accept a `client:
 * SupabaseClient` injected by the caller (use `getUserClient(jwt)` from
 * `@/lib/supabase-server`).  Service-context operations call
 * `getServiceClient()` internally and are documented as such.
 *
 * The `validateInviteCode` method calls the `validate_and_redeem_invite_code`
 * security-definer RPC — the only permitted path to read invite state.  Direct
 * SELECT on `beta_invites` is blocked by RLS.
 */
import 'server-only';

import { type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WaitlistEntry {
  email: string;
  source?: 'byok' | 'sync' | 'billing' | 'other';
}

export type InviteCodeError =
  | 'invalid_code'
  | 'expired'
  | 'fully_redeemed'
  | 'already_redeemed_by_user'
  | 'unauthenticated'
  | 'rpc_error';

export interface ValidateInviteResult {
  valid: boolean;
  inviteId?: string;
  error?: InviteCodeError;
}

// ---------------------------------------------------------------------------
// joinWaitlist
// Inserts into cloud_managed_waitlist (migration 20260522000000).
// Accepts an anonymous Supabase client — no auth required.
// ---------------------------------------------------------------------------

export async function joinWaitlist(
  client: SupabaseClient,
  entry: WaitlistEntry,
): Promise<{ success: boolean; error?: string }> {
  const source = entry.source ?? 'other';

  const { error } = await client.from('cloud_managed_waitlist').upsert(
    {
      email: entry.email.toLowerCase().trim(),
      source,
    },
    { onConflict: 'email,source' },
  );

  if (error) {
    logger.error({ code: error.code }, '[waitlistService] joinWaitlist error');
    return { success: false, error: 'Failed to join waitlist. Please try again.' };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// validateInviteCode
// Calls validate_and_redeem_invite_code RPC (migration 20260523000000).
// Must be called with an authenticated user client; returns 'unauthenticated'
// when auth.uid() is null (the RPC GRANT is restricted to `authenticated`).
// ---------------------------------------------------------------------------

export async function validateInviteCode(
  client: SupabaseClient,
  code: string,
  surface: string,
  source: string,
): Promise<ValidateInviteResult> {
  const { data, error } = await client.rpc('validate_and_redeem_invite_code', {
    p_code: code.trim().toUpperCase(),
    p_surface: surface,
    p_source: source,
  });

  if (error) {
    logger.error({ code: error.code }, '[waitlistService] validateInviteCode rpc error');
    return { valid: false, error: 'rpc_error' };
  }

  // RPC returns a single row as an array with one element
  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    return { valid: false, error: 'rpc_error' };
  }

  if (row.valid) {
    return { valid: true, inviteId: row.invite_id ?? undefined };
  }

  return {
    valid: false,
    error: (row.error as InviteCodeError) ?? 'rpc_error',
  };
}
