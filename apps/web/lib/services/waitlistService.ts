/**
 * @file waitlistService.ts
 *
 * Web-surface waitlist and invite-code service.
 *
 * # v1 scope
 *
 * v1 ships two methods only: joinWaitlist + validateInviteCode.
 * checkWaitlistStatus is deferred to v2 · it needs a rank RPC for
 * cloud_managed_waitlist. The rank RPC that exists today (cloud_waitlist_rank)
 * targets the older cloud_waitlist table, not cloud_managed_waitlist, so the
 * two don't compose correctly.
 *
 * # Client injection contract
 *
 * Methods that act on behalf of an authenticated user accept a `db:
 * DatabaseAdapter` injected by the caller (use `getNeonDb()` from
 * `@/lib/server/neon-db`). Service-context operations call
 * `getNeonDb()` internally and are documented as such.
 *
 * The `validateInviteCode` method calls the `validate_and_redeem_invite_code`
 * RPC. That RPC is NOT security-definer and `beta_invites` has NO row-level
 * security in the Neon schema (`apps/web/db/neon/0020_functions.sql:1-13`
 * documents the port dropping `auth.uid()`/`auth.role()`/SECURITY DEFINER;
 * RLS exists only on `web_artifacts*`, see `0039_artifact_cloud_sync.sql:85`).
 * Authorization is caller-enforced at the route layer, and the live redemption
 * path — `apps/web/app/api/claim-offer/route.ts` — deliberately reads
 * `beta_invites` with a direct SELECT (`:54-57`) and then redeems through
 * `claim_beta_invite`. Treat this module's RPC as one of two redemption paths,
 * not as a privileged gate.
 */
import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { normalizeWaitlistEmail } from '@/lib/server/waitlist-email';

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

// RPC row shape returned by validate_and_redeem_invite_code
interface ValidateRpcRow {
  valid: boolean;
  invite_id: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// joinWaitlist
// Inserts into cloud_managed_waitlist with normalized email storage.
// Accepts a DatabaseAdapter · no auth required.
// ---------------------------------------------------------------------------

export async function joinWaitlist(
  db: DatabaseAdapter,
  entry: WaitlistEntry,
): Promise<{ success: boolean; error?: string }> {
  const source = entry.source ?? 'other';
  const email = normalizeWaitlistEmail(entry.email);

  try {
    await db.execute(
      `INSERT INTO cloud_managed_waitlist (email, source)
       VALUES ($1, $2)
       ON CONFLICT (email, source) DO UPDATE
         SET updated_at = now()`,
      [email, source],
    );
    return { success: true };
  } catch (err) {
    logger.error({ code: (err as { code?: string }).code }, '[waitlistService] joinWaitlist error');
    return { success: false, error: 'Failed to join waitlist. Please try again.' };
  }
}

// ---------------------------------------------------------------------------
// validateInviteCode
// Calls validate_and_redeem_invite_code RPC.
//
// UNWIRED — no production caller today; the shipping redemption path is
// POST /api/claim-offer, which uses the `claim_beta_invite` RPC instead.
// Do not wire this up as-is: the deployed function is
// `validate_and_redeem_invite_code(p_user_id text, p_code text, p_surface text,
// p_source text)` (`apps/web/db/neon/0020_functions.sql:1440-1445`) — FOUR
// parameters — while the query below binds three, so a real call raises
// `function ... does not exist`. The 'unauthenticated' member of
// InviteCodeError is likewise vestigial: the Neon port has no auth.uid() and
// this RPC can never return it.
// ---------------------------------------------------------------------------

export async function validateInviteCode(
  db: DatabaseAdapter,
  code: string,
  surface: string,
  source: string,
): Promise<ValidateInviteResult> {
  try {
    const rows = await db.query<ValidateRpcRow>(
      'SELECT * FROM validate_and_redeem_invite_code($1, $2, $3)',
      [code.trim().toUpperCase(), surface, source],
    );

    // RPC returns a single row
    const row = rows[0] ?? null;

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
  } catch (err) {
    logger.error(
      { code: (err as { code?: string }).code },
      '[waitlistService] validateInviteCode rpc error',
    );
    return { valid: false, error: 'rpc_error' };
  }
}
