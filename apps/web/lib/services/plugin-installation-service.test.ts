import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getNeonDbMock } = vi.hoisted(() => ({ getNeonDbMock: vi.fn() }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: getNeonDbMock }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { countPluginInstallations } from './plugin-installation-service';

function database(rows: unknown[]): DatabaseAdapter & { query: ReturnType<typeof vi.fn> } {
  const db = { query: vi.fn().mockResolvedValue(rows) };
  return db as unknown as DatabaseAdapter & { query: ReturnType<typeof vi.fn> };
}

describe('countPluginInstallations', () => {
  beforeEach(() => {
    getNeonDbMock.mockReset();
  });

  it('maps grouped rows onto a plugin id -> count map', async () => {
    const db = database([
      { plugin_id: 'engineering-pack', install_count: '3' },
      { plugin_id: 'writing-pack', install_count: 1 },
    ]);
    const counts = await countPluginInstallations(db);
    expect(counts.get('engineering-pack')).toBe(3);
    expect(counts.get('writing-pack')).toBe(1);
    expect(counts.get('unknown-pack')).toBeUndefined();
  });

  it('never selects or returns a user id — only a plugin id and a count', async () => {
    const db = database([{ plugin_id: 'engineering-pack', install_count: 1 }]);
    await countPluginInstallations(db);
    const sql = String(db.query.mock.calls[0]?.[0]);
    expect(sql.toLowerCase()).not.toContain('user_id');
    expect(sql.toLowerCase()).toContain('group by plugin_id');
  });

  it('reflects an uninstall as a lower count on the next read', async () => {
    const db = database([
      { plugin_id: 'engineering-pack', install_count: 2 },
      { plugin_id: 'writing-pack', install_count: 1 },
    ]);
    const before = await countPluginInstallations(db);
    expect(before.get('engineering-pack')).toBe(2);

    db.query.mockResolvedValueOnce([{ plugin_id: 'writing-pack', install_count: 1 }]);
    const after = await countPluginInstallations(db);
    expect(after.get('engineering-pack')).toBeUndefined();
    expect(after.get('writing-pack')).toBe(1);
  });

  it('coerces a non-numeric count to zero rather than throwing', async () => {
    const db = database([{ plugin_id: 'engineering-pack', install_count: 'nope' as never }]);
    const counts = await countPluginInstallations(db);
    expect(counts.get('engineering-pack')).toBe(0);
  });

  it('returns an empty map when no plugin has ever been installed', async () => {
    const db = database([]);
    await expect(countPluginInstallations(db)).resolves.toEqual(new Map());
  });
});
