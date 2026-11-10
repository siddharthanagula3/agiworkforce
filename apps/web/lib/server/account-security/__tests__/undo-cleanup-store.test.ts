import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { claimUndoCleanup, endUndoCleanup, recordUndoCleanupStep, undoEnrollment } from '../store';

vi.mock('server-only', () => ({}));

const OWNER = 'undo-cleanup-owner';
const HASH = 'a'.repeat(64);

function normalized(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

// Adapter fixtures check SQL text and transaction ownership, not PostgreSQL behavior.
function adapter(queryRows: unknown[][] = [], executeCount = 1) {
  const query = vi.fn(async () => queryRows.shift() ?? []);
  const execute = vi.fn(async () => executeCount);
  const db = { query, execute } as unknown as DatabaseAdapter;
  return { db, query, execute };
}

describe('undo cleanup record SQL', () => {
  it('writes the cleanup record in the same statement that burns the link', async () => {
    const statements: string[] = [];
    const tx = {
      query: vi.fn(async (sql: string) => {
        statements.push(normalized(sql));
        return [{ enrolled_at: new Date('2026-11-07T12:00:00.000Z') }];
      }),
      execute: vi.fn(async (sql: string) => {
        statements.push(normalized(sql));
        return 1;
      }),
    };
    const db = {
      transaction: vi.fn(async (run: (inner: unknown) => Promise<boolean>) => run(tx)),
    } as unknown as DatabaseAdapter;

    expect(await undoEnrollment(db, { userId: OWNER, tokenHash: HASH })).toBe(true);

    const [burn] = statements;
    expect(burn).toContain('select enrolled_at, enrolled_session_id, undo_expires_at');
    expect(burn).toContain('undo_token_hash = null');
    expect(burn).toContain('undo_cleanup_token_hash = $2');
    expect(burn).toContain('undo_cleanup_expires_at = enrolled.undo_expires_at');
    expect(burn).toContain(
      "undo_cleanup = jsonb_build_object('enrolledSessionId', enrolled.enrolled_session_id)",
    );
    expect(tx.query).toHaveBeenCalledTimes(1);
    expect(tx.execute).toHaveBeenCalledTimes(3);
  });

  it('claims an unfinished record only while no other opener holds its lease', async () => {
    const f = adapter([
      [{ user_id: OWNER, undo_cleanup: { enrolledSessionId: 's1', enrollmentForgotten: true } }],
    ]);

    expect(await claimUndoCleanup(f.db, { tokenHash: HASH, leaseSeconds: 90 })).toEqual({
      status: 'claimed',
      userId: OWNER,
      progress: { enrolledSessionId: 's1', enrollmentForgotten: true },
    });
    const [sql, params] = f.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(normalized(sql)).toContain('undo_cleanup_expires_at > now()');
    expect(normalized(sql)).toContain('enrolled_at is null');
    expect(normalized(sql)).toContain(
      '(undo_cleanup_lease_until is null or undo_cleanup_lease_until <= now())',
    );
    expect(params).toEqual([HASH, 90]);
    expect(f.query).toHaveBeenCalledTimes(1);
  });

  it('tells a held record from a missing one when the claim finds nothing', async () => {
    expect(
      await claimUndoCleanup(adapter([[], [{ user_id: OWNER }]]).db, {
        tokenHash: HASH,
        leaseSeconds: 90,
      }),
    ).toEqual({ status: 'busy' });
    expect(
      await claimUndoCleanup(adapter([[], []]).db, { tokenHash: HASH, leaseSeconds: 90 }),
    ).toEqual({ status: 'none' });
  });

  it('refuses a stored outcome it does not recognise', async () => {
    const f = adapter([[{ user_id: OWNER, undo_cleanup: { password: 'maybe' } }]]);
    await expect(claimUndoCleanup(f.db, { tokenHash: HASH, leaseSeconds: 90 })).rejects.toThrow();
  });

  it('merges one settled step into the record and reports a record that is gone', async () => {
    const f = adapter([], 1);
    expect(
      await recordUndoCleanupStep(f.db, {
        userId: OWNER,
        tokenHash: HASH,
        settled: { password: 'reset' },
      }),
    ).toBe(true);
    const [sql, params] = f.execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(normalized(sql)).toContain('set undo_cleanup = undo_cleanup || $3::jsonb');
    expect(normalized(sql)).toContain('user_id = $1 and undo_cleanup_token_hash = $2');
    expect(params).toEqual([OWNER, HASH, '{"password":"reset"}']);

    expect(
      await recordUndoCleanupStep(adapter([], 0).db, {
        userId: OWNER,
        tokenHash: HASH,
        settled: { notified: true },
      }),
    ).toBe(false);
  });

  it('releases the lease, and removes the record only when every step finished', async () => {
    const f = adapter();
    await endUndoCleanup(f.db, { userId: OWNER, tokenHash: HASH, finished: false });
    await endUndoCleanup(f.db, { userId: OWNER, tokenHash: HASH, finished: true });

    const [sql] = f.execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(normalized(sql)).toContain('undo_cleanup_lease_until = null');
    expect(normalized(sql)).toContain(
      'undo_cleanup = case when $3::boolean then null else undo_cleanup end',
    );
    expect(f.execute.mock.calls.map(([, params]) => params)).toEqual([
      [OWNER, HASH, false],
      [OWNER, HASH, true],
    ]);
  });
});
