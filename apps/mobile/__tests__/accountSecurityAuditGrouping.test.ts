/**
 * The mobile security activity list collapses consecutive repeats of the same
 * action. A retry burst against one rate-limited endpoint otherwise fills the
 * whole page with identical rows and buries the sign-ins and account changes
 * the section exists to show — the live account returned twenty "Rate limit
 * exceeded" entries, six of them inside the same second.
 */
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
    // The newest of the run is what the row reports, matching the newest-first
    // order the endpoint returns.
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

  /** A security log must never silently drop an event. */
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
