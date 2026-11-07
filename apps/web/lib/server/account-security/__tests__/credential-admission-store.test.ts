import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { lockEnrollment } from '../store';

vi.mock('server-only', () => ({}));

const OWNER = 'credential-admission-owner';
const ENROLLED = new Date('2026-11-07T12:00:00.000Z');
const PENDING = '2026-11-07T12:30:00.000Z';
const UNLOCKS = '2026-11-08T12:00:00.000Z';

function row(enrolled = false) {
  return {
    enrolled_at: enrolled ? ENROLLED : null,
    recovery_keys_remaining: enrolled ? 8 : 0,
    pending_recovery_keys_expire_at: enrolled ? PENDING : null,
    recovery_started_at: enrolled ? ENROLLED : null,
    recovery_unlocks_at: enrolled ? UNLOCKS : null,
    recovery_session_id: enrolled ? 'recovering-session' : null,
  };
}

function normalized(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

// Adapter fixtures check SQL and transaction ownership, not PostgreSQL concurrency behavior.
function fixture(enrolled = false) {
  const execute = vi.fn(async () => {
    throw new Error('separate mutation used');
  });
  const query = vi.fn(async (sql: string, params: readonly unknown[]) => {
    expect(normalized(sql)).toBe(
      'insert into public.account_security_enrollments (user_id) values ($1) on conflict (user_id) do update set user_id = excluded.user_id returning enrolled_at, cardinality(recovery_key_hashes)::integer as recovery_keys_remaining, pending_recovery_keys_expire_at, recovery_started_at, recovery_unlocks_at, recovery_session_id',
    );
    expect(params).toEqual([OWNER]);
    return [row(enrolled)];
  });
  const transaction = vi.fn(async () => {
    throw new Error('nested transactions are not supported');
  });
  const tx = { execute, query, transaction } as unknown as DatabaseAdapter;
  return { tx, execute, query, transaction };
}

describe('credential admission enrollment mutex SQL', () => {
  it('maps an unenrolled row returned by the single admission write', async () => {
    const f = fixture(false);
    expect(await lockEnrollment(f.tx, OWNER)).toEqual({
      enrolledAt: null,
      recoveryKeysRemaining: 0,
      pendingRecoveryKeysExpireAt: null,
      recovery: null,
    });
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.query).toHaveBeenCalledTimes(1);
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it('preserves and maps the locked existing enrollment rather than resetting it', async () => {
    const f = fixture(true);
    expect(await lockEnrollment(f.tx, OWNER)).toEqual({
      enrolledAt: ENROLLED.getTime(),
      recoveryKeysRemaining: 8,
      pendingRecoveryKeysExpireAt: new Date(PENDING).getTime(),
      recovery: {
        startedAt: ENROLLED.getTime(),
        unlocksAt: new Date(UNLOCKS).getTime(),
        sessionId: 'recovering-session',
      },
    });
    expect(f.query).toHaveBeenCalledTimes(1);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it('awaits the admission write without a separate read or nested transaction', async () => {
    const f = fixture();
    let releaseWrite!: (rows: ReturnType<typeof row>[]) => void;
    f.query.mockImplementationOnce(
      () =>
        new Promise<ReturnType<typeof row>[]>((resolve) => {
          releaseWrite = resolve;
        }),
    );
    let completed = false;
    const pending = lockEnrollment(f.tx, OWNER).then((enrollment) => {
      completed = true;
      return enrollment;
    });
    expect(f.query).toHaveBeenCalledTimes(1);
    expect(completed).toBe(false);
    releaseWrite([row()]);
    expect((await pending).enrolledAt).toBeNull();
    expect(completed).toBe(true);
    expect(f.query).toHaveBeenCalledTimes(1);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it('fails closed when the admission write returns no owner row', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([]);
    await expect(lockEnrollment(f.tx, OWNER)).rejects.toThrow(
      'account security enrollment could not be locked',
    );
    expect(f.query).toHaveBeenCalledTimes(1);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it('propagates an admission write failure without retrying or opening a transaction', async () => {
    const f = fixture();
    const error = new Error('admission write refused');
    f.query.mockRejectedValueOnce(error);
    await expect(lockEnrollment(f.tx, OWNER)).rejects.toBe(error);
    expect(f.query).toHaveBeenCalledTimes(1);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it('keeps commit and rollback with the caller transaction, including work after the lock', async () => {
    const f = fixture();
    const boundaries: string[] = [];
    const database = {
      query: vi.fn(() => {
        throw new Error('outer query used');
      }),
      execute: vi.fn(() => {
        throw new Error('outer execute used');
      }),
      transaction: async <T>(work: (tx: DatabaseAdapter) => Promise<T>): Promise<T> => {
        boundaries.push('begin');
        try {
          const result = await work(f.tx);
          boundaries.push('commit');
          return result;
        } catch (error) {
          boundaries.push('rollback');
          throw error;
        }
      },
    };
    const afterLockFailure = new Error('admission refused');
    await expect(
      database.transaction(async (tx) => {
        await lockEnrollment(tx, OWNER);
        boundaries.push('admission');
        throw afterLockFailure;
      }),
    ).rejects.toBe(afterLockFailure);
    expect(boundaries).toEqual(['begin', 'admission', 'rollback']);
    expect(database.query).not.toHaveBeenCalled();
    expect(database.execute).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
  });
});
