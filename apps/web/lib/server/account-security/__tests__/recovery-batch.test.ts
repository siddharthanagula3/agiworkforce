import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  AccountSecurityEnrollmentRequestSchema,
  AccountSecurityRecoveryKeysSavedSchema,
} from '@agiworkforce/cloud-contracts/account-security';
import {
  clearEnrollment,
  promotePendingRecoveryKeys,
  storePendingRecoveryKeys,
  undoEnrollment,
} from '../store';

vi.mock('server-only', () => ({}));

const A = 'a'.repeat(43);
const B = 'b'.repeat(43);
const NOW = new Date('2026-11-07T12:00:00.000Z');
const EXPIRES = new Date('2026-11-07T12:30:00.000Z');

type Pending = { batchId: string; hashes: readonly string[]; sessionId: string; expiresAt: Date };

// This model checks SQL shape and binding; it is not PostgreSQL concurrency evidence.
function fixture(enrolled: boolean) {
  const state = {
    userId: 'user-1',
    enrolledAt: enrolled ? NOW : (null as Date | null),
    active: ['old-active'] as readonly string[],
    pending: null as Pending | null,
  };
  const query = vi.fn(async (statement: string, params: readonly unknown[]) => {
    const sql = statement.replace(/\s+/g, ' ').trim();
    if (sql.startsWith('insert into public.account_security_enrollments')) {
      expect(sql).toMatch(/pending_recovery_session_id, pending_recovery_batch_id\)/);
      expect(sql).toContain(
        'values ($1, $2::text[], now() + make_interval(mins => $3::integer), $4, $5)',
      );
      expect(sql).toContain('pending_recovery_batch_id = excluded.pending_recovery_batch_id');
      expect(params).toHaveLength(5);
      expect(params[0]).toBe(state.userId);
      state.pending = {
        hashes: params[1] as readonly string[],
        sessionId: params[3] as string,
        batchId: params[4] as string,
        expiresAt: EXPIRES,
      };
      return [{ pending_recovery_keys_expire_at: EXPIRES }];
    }
    expect(sql).toMatch(
      /^update public.account_security_enrollments set recovery_key_hashes = pending_recovery_key_hashes,/,
    );
    expect(sql).toContain('where user_id = $1');
    expect(sql).toContain('and pending_recovery_key_hashes is not null');
    expect(sql).toContain('and pending_recovery_keys_expire_at > now()');
    expect(sql).toContain('and pending_recovery_session_id = $3');
    expect(sql).toContain('and pending_recovery_batch_id = $4');
    expect(sql).toContain(
      "and (case when $2::text = 'enroll' then enrolled_at is null else enrolled_at is not null end)",
    );
    expect(sql).toContain(
      "enrolled_at = case when $2::text = 'enroll' then now() else enrolled_at end",
    );
    for (const field of [
      'pending_recovery_key_hashes',
      'pending_recovery_keys_expire_at',
      'pending_recovery_session_id',
      'pending_recovery_batch_id',
    ]) {
      expect(sql).toContain(`${field} = null`);
    }
    expect(params).toHaveLength(4);
    const [userId, mode, sessionId, batchId] = params;
    const pending = state.pending;
    if (
      !pending ||
      userId !== state.userId ||
      sessionId !== pending.sessionId ||
      batchId !== pending.batchId ||
      pending.expiresAt <= NOW ||
      (mode === 'enroll') !== (state.enrolledAt === null)
    )
      return [];
    state.active = pending.hashes;
    state.pending = null;
    if (mode === 'enroll') state.enrolledAt = NOW;
    return [{ enrolled_at: state.enrolledAt }];
  });
  return { state, query, db: { query } as unknown as DatabaseAdapter };
}

async function prepare(db: DatabaseAdapter, batchId: string) {
  return storePendingRecoveryKeys(db, {
    userId: 'user-1',
    sessionId: 'session-1',
    hashes: [`hash-${batchId}`],
    ttlMinutes: 30,
    batchId,
  });
}

describe('pending recovery batch atomic promotion', () => {
  it.each(['enroll', 'replace'] as const)(
    '%s rejects A after B without changing pending or active keys, then accepts B once',
    async (mode) => {
      const { db, query, state } = fixture(mode === 'replace');
      expect(await prepare(db, A)).toBe(EXPIRES.getTime());
      expect(query.mock.calls[0]?.[1]).toEqual(['user-1', [`hash-${A}`], 30, 'session-1', A]);
      await prepare(db, B);
      const pendingB = state.pending;
      const priorActive = state.active;
      const input = { userId: 'user-1', sessionId: 'session-1', mode, batchId: A };
      expect(await promotePendingRecoveryKeys(db, input)).toBeNull();
      expect(query.mock.calls[2]?.[1]).toEqual(['user-1', mode, 'session-1', A]);
      expect(state.pending).toBe(pendingB);
      expect(state.active).toBe(priorActive);
      expect(state.enrolledAt).toEqual(mode === 'replace' ? NOW : null);
      expect(await promotePendingRecoveryKeys(db, { ...input, batchId: B })).toBe(NOW.getTime());
      expect(state.active).toEqual([`hash-${B}`]);
      expect(state.pending).toBeNull();
      const activated = state.active;
      expect(await promotePendingRecoveryKeys(db, { ...input, batchId: B })).toBeNull();
      expect(state.active).toBe(activated);
      expect(query).toHaveBeenCalledTimes(5);
    },
  );

  it.each(['enroll', 'replace'] as const)(
    '%s retains user, session, expiry and mode guards',
    async (mode) => {
      for (const mismatch of ['user', 'session', 'expiry', 'mode'] as const) {
        const { db, state } = fixture(mode === 'replace');
        await prepare(db, A);
        if (mismatch === 'expiry') state.pending!.expiresAt = NOW;
        const pending = state.pending;
        const active = state.active;
        expect(
          await promotePendingRecoveryKeys(db, {
            userId: mismatch === 'user' ? 'other-user' : 'user-1',
            sessionId: mismatch === 'session' ? 'other-session' : 'session-1',
            mode: mismatch === 'mode' ? (mode === 'replace' ? 'enroll' : 'replace') : mode,
            batchId: A,
          }),
        ).toBeNull();
        expect(state.pending).toBe(pending);
        expect(state.active).toBe(active);
      }
    },
  );

  it.each(['clear', 'undo'] as const)(
    '%s clears the receipt with all pending state',
    async (operation) => {
      const query = vi.fn(async (_statement: string, _params: readonly unknown[]) => [
        { enrolled_at: NOW },
      ]);
      const execute = vi.fn(async (_statement: string, _params: readonly unknown[]) => 1);
      const tx = { query, execute } as unknown as DatabaseAdapter;
      const db = {
        transaction: async (work: (connection: DatabaseAdapter) => Promise<unknown>) => work(tx),
      } as unknown as DatabaseAdapter;
      if (operation === 'clear') expect(await clearEnrollment(db, 'user-1')).toBe(true);
      else
        expect(await undoEnrollment(db, { userId: 'user-1', tokenHash: 'undo-hash' })).toBe(true);
      const call = operation === 'clear' ? execute.mock.calls[0] : query.mock.calls[0];
      const sql = String(call?.[0]);
      for (const field of [
        'pending_recovery_key_hashes',
        'pending_recovery_keys_expire_at',
        'pending_recovery_session_id',
        'pending_recovery_batch_id',
      ]) {
        expect(sql).toContain(`${field} = null`);
      }
      expect(call?.[1]).toEqual(operation === 'clear' ? ['user-1'] : ['user-1', 'undo-hash']);
    },
  );
});

describe('recovery receipt request contracts', () => {
  it.each([
    undefined,
    null,
    '',
    'legacy',
    'a'.repeat(42),
    'a'.repeat(44),
    '!'.repeat(43),
    ...['\n', '\r', '\u2028', '\u2029'].map((terminator) => 'a'.repeat(43) + terminator),
  ])('rejects missing or malformed batch %s for both paths', (recoveryBatchId) => {
    const saved = { recoveryKeysSaved: true, recoveryBatchId };
    expect(AccountSecurityRecoveryKeysSavedSchema.safeParse(saved).success).toBe(false);
    expect(
      AccountSecurityEnrollmentRequestSchema.safeParse({
        ...saved,
        emailCode: '123456',
        response: {},
      }).success,
    ).toBe(false);
  });

  it('accepts only a saved acknowledgment with the exact opaque receipt', () => {
    const saved = { recoveryKeysSaved: true, recoveryBatchId: A };
    expect(AccountSecurityRecoveryKeysSavedSchema.parse(saved)).toEqual(saved);
    expect(
      AccountSecurityEnrollmentRequestSchema.parse({ ...saved, emailCode: '123456', response: {} }),
    ).toEqual({ ...saved, emailCode: '123456', response: {} });
    expect(
      AccountSecurityRecoveryKeysSavedSchema.safeParse({ ...saved, recoveryKeysSaved: false })
        .success,
    ).toBe(false);
    expect(
      AccountSecurityRecoveryKeysSavedSchema.safeParse({ ...saved, latest: true }).success,
    ).toBe(false);
  });
});
