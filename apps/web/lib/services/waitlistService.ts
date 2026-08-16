import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { normalizeWaitlistEmail } from '@/lib/server/waitlist-email';

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

interface ValidateRpcRow {
  valid: boolean;
  invite_id: string | null;
  error: string | null;
}

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
