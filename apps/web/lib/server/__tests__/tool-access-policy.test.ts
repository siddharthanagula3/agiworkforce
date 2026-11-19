import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { resolveToolAccessMode } from '../tool-access-policy';

function dbReturning(rows: unknown[] | Error): DatabaseAdapter {
  const query = vi.fn(async () => {
    if (rows instanceof Error) throw rows;
    return rows;
  });
  return { query } as unknown as DatabaseAdapter;
}

describe('resolveToolAccessMode', () => {
  it.each(['auto', 'on_demand', 'always'] as const)('reads a stored %s choice', async (mode) => {
    await expect(
      resolveToolAccessMode(dbReturning([{ tool_access: mode }]), 'user-1'),
    ).resolves.toBe(mode);
  });

  it('reads only the account owner row and only the capabilities choice', async () => {
    const db = dbReturning([{ tool_access: 'always' }]);
    await resolveToolAccessMode(db, 'user-42');
    const [sql, params] = (db.query as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(sql).toContain("settings -> 'capabilities' ->> 'toolAccess'");
    expect(sql).toContain('where user_id = $1');
    expect(params).toEqual(['user-42']);
  });

  it('uses Auto when nothing is stored', async () => {
    await expect(resolveToolAccessMode(dbReturning([]), 'user-1')).resolves.toBe('auto');
    await expect(
      resolveToolAccessMode(dbReturning([{ tool_access: null }]), 'user-1'),
    ).resolves.toBe('auto');
  });

  it('uses Auto for a value it does not know', async () => {
    await expect(
      resolveToolAccessMode(dbReturning([{ tool_access: 'everything' }]), 'user-1'),
    ).resolves.toBe('auto');
  });

  it('uses Auto when the read fails', async () => {
    await expect(
      resolveToolAccessMode(dbReturning(new Error('connection refused')), 'user-1'),
    ).resolves.toBe('auto');
  });
});
