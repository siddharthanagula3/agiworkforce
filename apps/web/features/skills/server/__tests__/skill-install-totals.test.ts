import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { readSkillInstallTotals } from '../skill-install-totals';

function db(query: DatabaseAdapter['query']): DatabaseAdapter {
  return { query } as unknown as DatabaseAdapter;
}

describe('readSkillInstallTotals', () => {
  it('asks for each named skill once and keeps only positive totals', async () => {
    const query = vi.fn().mockResolvedValue([
      { skill_name: 'pdf', installs: '129812' },
      { skill_name: 'docx', installs: 0 },
    ]);
    const totals = await readSkillInstallTotals(db(query), ['pdf', 'docx', 'pdf']);
    expect(query).toHaveBeenCalledWith(
      'select skill_name, installs from public.skill_install_totals($1::text[])',
      [['pdf', 'docx']],
    );
    expect([...totals]).toEqual([['pdf', 129_812]]);
  });

  it('skips the query for an empty list and reads no totals when the store fails', async () => {
    const idle = vi.fn();
    expect((await readSkillInstallTotals(db(idle), [])).size).toBe(0);
    expect(idle).not.toHaveBeenCalled();
    const failing = vi.fn().mockRejectedValue(new Error('function does not exist'));
    expect((await readSkillInstallTotals(db(failing), ['pdf'])).size).toBe(0);
  });
});
