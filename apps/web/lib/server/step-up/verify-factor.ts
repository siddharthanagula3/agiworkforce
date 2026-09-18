import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { verifyTOTPStep, verifyBackupCode } from '@/features/settings/services/user-preferences';
import { openTotpSecret } from '@/lib/crypto/totp-envelope';
import { claimTotpStep } from '@/lib/server/two-factor-replay';
import type { StepUpMethod } from './grant-token';

export type StepUpFactorFailure =
  'not_enrolled' | 'invalid_code' | 'replayed_code' | 'spent_backup_code';

export type StepUpFactorResult =
  | { ok: true; method: StepUpMethod; backupCodesRemaining?: number }
  | { ok: false; failure: StepUpFactorFailure };

interface TwoFactorRow {
  totp_secret_enc: string;
  backup_codes_hashed: string[];
  last_totp_step: string | number | null;
  enabled: boolean;
}

/**
 * The single second-factor check behind every step-up challenge. A TOTP step is
 * claimed and a backup code is spent, so one code can never satisfy two
 * challenges.
 */
export async function verifySecondFactor(
  db: DatabaseAdapter,
  userId: string,
  code: string,
): Promise<StepUpFactorResult> {
  const [row] = await db.query<TwoFactorRow>(
    'select totp_secret_enc, backup_codes_hashed, enabled, last_totp_step from user_two_factor where user_id = $1 limit 1',
    [userId],
  );

  if (!row || !row.enabled) return { ok: false, failure: 'not_enrolled' };

  const step = await verifyTOTPStep(openTotpSecret(row.totp_secret_enc), code);
  if (step !== null) {
    if (!(await claimTotpStep(db, userId, step))) {
      return { ok: false, failure: 'replayed_code' };
    }
    return { ok: true, method: 'totp' };
  }

  const backupIndex = await verifyBackupCode(code, row.backup_codes_hashed ?? []);
  if (backupIndex === -1) return { ok: false, failure: 'invalid_code' };

  const usedHash = (row.backup_codes_hashed ?? [])[backupIndex]!;
  const consumed = await db.query<{ remaining: number }>(
    `update user_two_factor
        set backup_codes_hashed = array_remove(backup_codes_hashed, $2),
            last_verified_at    = now(),
            updated_at          = now()
      where user_id = $1
        and $2 = any(backup_codes_hashed)
      returning coalesce(array_length(backup_codes_hashed, 1), 0) as remaining`,
    [userId, usedHash],
  );
  if (!consumed.length) return { ok: false, failure: 'spent_backup_code' };

  return { ok: true, method: 'backup_code', backupCodesRemaining: consumed[0]?.remaining ?? 0 };
}

export async function hasEnrolledSecondFactor(
  db: DatabaseAdapter,
  userId: string,
): Promise<boolean> {
  const [row] = await db.query<{ enabled: boolean }>(
    'select enabled from user_two_factor where user_id = $1 limit 1',
    [userId],
  );
  return row?.enabled === true;
}
