import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  isRetentionSweepEnabled,
  listOrganizationsWithRetentionPolicy,
  retentionEnforcement,
} from '../enforcement';

describe('isRetentionSweepEnabled', () => {
  it('sweeps only a recorded window whose enforcement is on', () => {
    expect(isRetentionSweepEnabled({ retentionDays: 30, retentionEnforced: true })).toBe(true);
    expect(isRetentionSweepEnabled({ retentionDays: 30, retentionEnforced: false })).toBe(false);
    expect(isRetentionSweepEnabled({ retentionDays: null, retentionEnforced: true })).toBe(false);
    expect(isRetentionSweepEnabled({ retentionDays: null, retentionEnforced: false })).toBe(false);
  });

  it('agrees with the decision for every plan', () => {
    for (const plan of ['enterprise', 'team', 'free', null]) {
      for (const retentionDays of [30, null]) {
        for (const retentionEnforced of [true, false]) {
          expect(retentionEnforcement({ plan, retentionDays, retentionEnforced }).enforced).toBe(
            isRetentionSweepEnabled({ retentionDays, retentionEnforced }),
          );
        }
      }
    }
  });
});

describe('retentionEnforcement', () => {
  it('reports an enterprise window as required but not enforced when nobody opted in', () => {
    expect(
      retentionEnforcement({ plan: 'enterprise', retentionDays: 30, retentionEnforced: false }),
    ).toEqual({ enforced: false, required: true, reason: 'required-not-yet-enforced' });
    expect(
      retentionEnforcement({ plan: 'enterprise', retentionDays: 30, retentionEnforced: true }),
    ).toEqual({ enforced: true, required: true, reason: 'required-and-enforced' });
  });

  it('keeps the opt-in for a plan that does not sell enterprise controls', () => {
    expect(
      retentionEnforcement({ plan: 'team', retentionDays: 30, retentionEnforced: false }),
    ).toEqual({ enforced: false, required: false, reason: 'not-required' });
    expect(
      retentionEnforcement({ plan: 'team', retentionDays: 30, retentionEnforced: true }),
    ).toEqual({ enforced: true, required: false, reason: 'opted-in' });
  });

  it('deletes nothing for a workspace that recorded no window', () => {
    for (const plan of ['enterprise', 'team', 'free', null]) {
      expect(retentionEnforcement({ plan, retentionDays: null, retentionEnforced: true })).toEqual({
        enforced: false,
        required: false,
        reason: 'no-policy',
      });
    }
  });
});

describe('listOrganizationsWithRetentionPolicy', () => {
  it('returns every workspace with a window, not only the opted-in ones', async () => {
    const query = vi.fn(async (..._args: unknown[]) => [
      { organization_id: 'org-a', retention_days: '30', retention_enforced: false },
      { organization_id: 'org-b', retention_days: 90, retention_enforced: true },
    ]);
    const rows = await listOrganizationsWithRetentionPolicy({ query } as never);

    expect(String(query.mock.calls.at(0)?.at(0))).not.toMatch(/retention_enforced\s*=\s*true/u);
    expect(rows).toEqual([
      { organizationId: 'org-a', retentionDays: 30, retentionEnforced: false },
      { organizationId: 'org-b', retentionDays: 90, retentionEnforced: true },
    ]);
  });
});
