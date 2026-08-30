import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

/**
 * Claims a TOTP time step for a user, refusing one already spent.
 *
 * A TOTP code stays valid for its own step plus the skew steps either side, so
 * verifying the digits alone accepts the same code repeatedly for as long as it
 * is current. Every endpoint that treats a code as proof claims the step here
 * instead, and the conditional update makes two concurrent attempts resolve to
 * one winner rather than both succeeding.
 */
export async function claimTotpStep(
  db: DatabaseAdapter,
  userId: string,
  step: number,
): Promise<boolean> {
  const rows = await db.query<{ user_id: string }>(
    `update user_two_factor
        set last_totp_step   = $2,
            last_verified_at = now(),
            updated_at       = now()
      where user_id = $1
        and (last_totp_step is null or last_totp_step < $2)
      returning user_id`,
    [userId, step],
  );
  return rows.length > 0;
}
