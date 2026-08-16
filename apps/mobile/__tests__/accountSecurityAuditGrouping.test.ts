import { groupAuditEntries } from '@/src/features/settings/account-security/service';
import type { AuditLogEntry } from '@/src/features/settings/account-security/service';

function entry(id: string, action: string, createdAt = '2026-07-31T18:38:52.000Z'): AuditLogEntry {
  return { id, action, ipAddress: null, createdAt };
}

describe('groupAuditEntries', () => {
  it('returns an empty list unchanged', () => {
    expect(groupAuditEntries([])).toEqual([]);
  });

  it('keeps distinct actions as separate rows', () => {
    const grouped = groupAuditEntries([
      entry('1', 'login_success'),
      entry('2', 'password_changed'),
    ]);

    expect(grouped.map((row) => row.action)).toEqual(['login_success', 'password_changed']);
    expect(grouped.every((row) => row.repeats === 1)).toBe(true);
  });

  it('collapses a run of the same action and counts it', () => {
    const grouped = groupAuditEntries([
      entry('1', 'rate_limit_exceeded'),
      entry('2', 'rate_limit_exceeded'),
      entry('3', 'rate_limit_exceeded'),
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.repeats).toBe(3);
    expect(grouped[0]?.id).toBe('1');
  });

  it('does not merge across a different action in between', () => {
    const grouped = groupAuditEntries([
      entry('1', 'rate_limit_exceeded'),
      entry('2', 'login_success'),
      entry('3', 'rate_limit_exceeded'),
    ]);

    expect(grouped.map((row) => row.action)).toEqual([
      'rate_limit_exceeded',
      'login_success',
      'rate_limit_exceeded',
    ]);
    expect(grouped.every((row) => row.repeats === 1)).toBe(true);
  });

  it('preserves the total number of events across grouping', () => {
    const entries = [
      entry('1', 'rate_limit_exceeded'),
      entry('2', 'rate_limit_exceeded'),
      entry('3', 'login_success'),
      entry('4', 'rate_limit_exceeded'),
    ];

    const total = groupAuditEntries(entries).reduce((sum, row) => sum + row.repeats, 0);
    expect(total).toBe(entries.length);
  });
});
