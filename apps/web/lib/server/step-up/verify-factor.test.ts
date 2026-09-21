import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/crypto/totp-envelope', () => ({
  openTotpSecret: (sealed: string) => sealed.replace(/^sealed:/, ''),
}));

import {
  generateBackupCodes,
  generateTOTPSecret,
  hashBackupCode,
} from '@/features/settings/services/user-preferences';
import { verifySecondFactor, hasEnrolledSecondFactor } from './verify-factor';

const SECRET = generateTOTPSecret();

interface StoredAccount {
  enabled: boolean;
  backupHashes: string[];
  lastStep: number | null;
}

/**
 * The two statements verify-factor issues, answered the way Postgres answers
 * them: the TOTP claim only wins when the step moves forward, and a backup code
 * only spends when the hash is still in the array.
 */
function fakeDb(account: StoredAccount) {
  const statements: string[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      statements.push(sql);
      if (/from user_two_factor/i.test(sql) && /select totp_secret_enc/i.test(sql)) {
        return [
          {
            totp_secret_enc: `sealed:${SECRET}`,
            backup_codes_hashed: account.backupHashes,
            enabled: account.enabled,
            last_totp_step: account.lastStep,
          },
        ];
      }
      if (/select enabled from user_two_factor/i.test(sql)) {
        return [{ enabled: account.enabled }];
      }
      if (/set last_totp_step/i.test(sql)) {
        const step = params[1] as number;
        if (account.lastStep !== null && account.lastStep >= step) return [];
        account.lastStep = step;
        return [{ user_id: params[0] }];
      }
      if (/array_remove\(backup_codes_hashed/i.test(sql)) {
        const used = params[1] as string;
        if (!account.backupHashes.includes(used)) return [];
        account.backupHashes = account.backupHashes.filter((hash) => hash !== used);
        return [{ remaining: account.backupHashes.length }];
      }
      return [];
    }),
  } as unknown as DatabaseAdapter;
  return { db, statements, account };
}

async function currentTotpCode(): Promise<string> {
  const { generateTOTPCode } = await import('@/features/settings/services/user-preferences');
  return generateTOTPCode(SECRET);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recovery codes', () => {
  it('draws every code from the platform CSPRNG rather than Math.random', () => {
    const random = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const mathRandom = vi.spyOn(Math, 'random');

    const codes = generateBackupCodes();

    expect(random).toHaveBeenCalledTimes(codes.length);
    expect(mathRandom).not.toHaveBeenCalled();
    random.mockRestore();
    mathRandom.mockRestore();
  });

  it('mints a distinct set every time it is asked', () => {
    const first = generateBackupCodes();
    const second = generateBackupCodes();

    expect(new Set(first).size).toBe(first.length);
    expect(first.some((code) => second.includes(code))).toBe(false);
  });

  it('stores a digest, never the code a person was shown', async () => {
    const [code] = generateBackupCodes();
    const stored = await hashBackupCode(code as string);

    expect(stored).not.toContain(code as string);
    expect(stored).not.toContain((code as string).replace('-', ''));
    expect(stored.length).toBeGreaterThanOrEqual(64);
  });

  it('spends a code once, reports what is left, and refuses it the second time', async () => {
    const codes = generateBackupCodes();
    const hashes = await Promise.all(codes.map((code) => hashBackupCode(code)));
    const { db, account } = fakeDb({ enabled: true, backupHashes: hashes, lastStep: null });

    const first = await verifySecondFactor(db, 'user-1', codes[0] as string);
    expect(first).toEqual({
      ok: true,
      method: 'backup_code',
      backupCodesRemaining: codes.length - 1,
    });
    expect(account.backupHashes).toHaveLength(codes.length - 1);

    const replay = await verifySecondFactor(db, 'user-1', codes[0] as string);
    expect(replay).toEqual({ ok: false, failure: 'invalid_code' });
  });

  it('leaves the other codes usable after one is spent', async () => {
    const codes = generateBackupCodes();
    const hashes = await Promise.all(codes.map((code) => hashBackupCode(code)));
    const { db } = fakeDb({ enabled: true, backupHashes: hashes, lastStep: null });

    await verifySecondFactor(db, 'user-1', codes[0] as string);

    await expect(verifySecondFactor(db, 'user-1', codes[1] as string)).resolves.toMatchObject({
      ok: true,
      backupCodesRemaining: codes.length - 2,
    });
  });

  it('makes the spend the where clause, so two attempts cannot both win', async () => {
    const codes = generateBackupCodes();
    const hashes = await Promise.all(codes.map((code) => hashBackupCode(code)));
    const { db, statements } = fakeDb({ enabled: true, backupHashes: hashes, lastStep: null });

    await verifySecondFactor(db, 'user-1', codes[0] as string);

    const spend = statements.find((sql) => /array_remove\(backup_codes_hashed/i.test(sql));
    expect(spend).toContain('= any(backup_codes_hashed)');
  });
});

describe('the second factor a step-up challenge checks', () => {
  it('refuses an account that never enrolled, before looking at the code', async () => {
    const { db } = fakeDb({ enabled: false, backupHashes: [], lastStep: null });

    await expect(verifySecondFactor(db, 'user-1', '000000')).resolves.toEqual({
      ok: false,
      failure: 'not_enrolled',
    });
    await expect(hasEnrolledSecondFactor(db, 'user-1')).resolves.toBe(false);
  });

  it('accepts a current authenticator code once and refuses the same code again', async () => {
    const { db } = fakeDb({ enabled: true, backupHashes: [], lastStep: null });
    const code = await currentTotpCode();

    await expect(verifySecondFactor(db, 'user-1', code)).resolves.toEqual({
      ok: true,
      method: 'totp',
    });
    await expect(verifySecondFactor(db, 'user-1', code)).resolves.toEqual({
      ok: false,
      failure: 'replayed_code',
    });
  });

  it('refuses a code that is neither the authenticator step nor a recovery code', async () => {
    const hashes = await Promise.all(generateBackupCodes().map((code) => hashBackupCode(code)));
    const { db } = fakeDb({ enabled: true, backupHashes: hashes, lastStep: null });

    await expect(verifySecondFactor(db, 'user-1', '000000')).resolves.toEqual({
      ok: false,
      failure: 'invalid_code',
    });
  });

  it('reads and writes one account, never the table', async () => {
    const { db, statements } = fakeDb({ enabled: true, backupHashes: [], lastStep: null });

    await verifySecondFactor(db, 'user-1', await currentTotpCode());

    expect(statements.length).toBeGreaterThan(0);
    for (const sql of statements) expect(sql).toMatch(/where user_id = \$1/);
  });
});
