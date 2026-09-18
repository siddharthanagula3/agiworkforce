import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  MandatoryRetentionSkipped,
  assertNoMandatoryWorkspaceDropped,
  listOrganizationsWithRetentionPolicy,
  mandatoryRetentionWorkspaces,
  retentionEnforcement,
} from '../enforcement';

describe('retentionEnforcement', () => {
  it('marks an enterprise window required even when nobody opted in', () => {
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

describe('assertNoMandatoryWorkspaceDropped', () => {
  it('accepts a workspace deferred to the next run', () => {
    expect(() =>
      assertNoMandatoryWorkspaceDropped({
        mandatory: ['org-a', 'org-b'],
        swept: ['org-a'],
        deferred: ['org-b'],
      }),
    ).not.toThrow();
  });

  it('refuses a run that dropped one', () => {
    expect(() =>
      assertNoMandatoryWorkspaceDropped({ mandatory: ['org-a'], swept: [], deferred: [] }),
    ).toThrow(MandatoryRetentionSkipped);
  });
});

describe('mandatoryRetentionWorkspaces', () => {
  it('covers an enterprise workspace that never opted in and skips a team one', () => {
    const plans: Record<string, string> = { 'org-a': 'enterprise', 'org-b': 'team' };
    expect(
      mandatoryRetentionWorkspaces(
        [
          { organizationId: 'org-a', retentionDays: 30, retentionEnforced: false },
          { organizationId: 'org-b', retentionDays: 30, retentionEnforced: false },
          { organizationId: 'org-c', retentionDays: null, retentionEnforced: true },
        ],
        (id) => plans[id] ?? null,
      ),
    ).toEqual(['org-a']);
  });
});
