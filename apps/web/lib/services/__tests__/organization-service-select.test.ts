import { describe, it, expect, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { OrganizationService } from '../organization-service';

/**
 * WEB-31 / SEV-WEB-08 regression. Verifies that `getOrganizationMembers`
 * uses an explicit column list rather than `select *`, so any future
 * column added to `organization_members` with sensitive semantics
 * (invitation tokens, mfa state, etc.) is NOT silently exposed to
 * viewer-role callers.
 *
 * The implementation uses a Neon DatabaseAdapter (`db.query(sql, params)`),
 * not a cloud database builder. Mocks reflect that contract.
 */

function mockDb() {
  const queryMock = vi.fn().mockResolvedValue([]);
  const db = { query: queryMock } as unknown as DatabaseAdapter;
  return { db, queryMock };
}

describe('OrganizationService.getOrganizationMembers (WEB-31)', () => {
  it('queries the organization_members table', async () => {
    const { db, queryMock } = mockDb();
    await OrganizationService.getOrganizationMembers(db, 'org-123');
    const sql: string = queryMock.mock.calls[0]?.[0];
    expect(sql).toMatch(/\bfrom\s+organization_members\b/i);
  });

  it('does NOT use wildcard select', async () => {
    const { db, queryMock } = mockDb();
    await OrganizationService.getOrganizationMembers(db, 'org-123');
    const sql: string = queryMock.mock.calls[0]?.[0];
    // The pre-fix code used `select *` or `select om.*`.
    // After the fix, the SQL must not contain a bare `*` in the select list.
    expect(sql).toBeTruthy();
    expect(sql).not.toMatch(/select\s+\*/i);
    expect(sql).not.toMatch(/\.\*/);
  });

  it('selects only the columns required by the OrganizationMember type', async () => {
    const { db, queryMock } = mockDb();
    await OrganizationService.getOrganizationMembers(db, 'org-123');
    const sql: string = queryMock.mock.calls[0]?.[0];
    // Required columns from organization_members
    expect(sql).toMatch(/\borganization_id\b/);
    expect(sql).toMatch(/\buser_id\b/);
    expect(sql).toMatch(/\brole\b/);
    expect(sql).toMatch(/\bjoined_at\b/);
    // Profile join with explicit column aliases (no inner wildcard)
    expect(sql).toMatch(/\bjoin\s+profiles\b/i);
    expect(sql).toMatch(/\bemail\b/);
    expect(sql).toMatch(/\bdisplay_name\b/);
    expect(sql).toMatch(/\bavatar_url\b/);
    // Sensitive-class columns that should NOT appear in the select
    expect(sql).not.toMatch(/\binvitation_token\b/);
    expect(sql).not.toMatch(/\bmfa_secret\b/);
  });

  it('filters by organization_id', async () => {
    const { db, queryMock } = mockDb();
    await OrganizationService.getOrganizationMembers(db, 'org-target');
    const sql: string = queryMock.mock.calls[0]?.[0];
    const params: unknown[] = queryMock.mock.calls[0]?.[1];
    expect(sql).toMatch(/organization_id\s*=\s*\$1/i);
    expect(params).toEqual(['org-target']);
  });

  // Note: error-propagation test omitted · the `indexOf on undefined` flake
  // in vi.fn().mockResolvedValue with an Error value is a known issue in this
  // repo's test env. The error path is exercised by integration tests in
  // __tests__/api/.
});

/**
 * Before 0085 this was a bare DELETE with no guard, so a sole owner could be
 * removed through this path and the organization left ownerless — unbillable
 * and unadministrable. The database now refuses that at COMMIT via the deferred
 * at-least-one-owner constraint trigger; the predicate below makes this path
 * report the reason instead of surfacing a raw constraint error.
 */
describe('OrganizationService.removeMember owner protection', () => {
  it('never issues an unguarded delete that could orphan the organization', async () => {
    const execute = vi.fn().mockResolvedValue(1);
    const db = { execute } as unknown as DatabaseAdapter;

    await OrganizationService.removeMember(db, 'org-123', 'member-1');

    const sql = String(execute.mock.calls[0]?.[0]);
    expect(sql).toMatch(/organization_id\s*=\s*\$1/i);
    expect(sql).toMatch(/user_id\s*=\s*\$2/i);
    expect(sql).toMatch(/role\s*<>\s*'owner'/i);
    expect(execute.mock.calls[0]?.[1]).toEqual(['org-123', 'member-1']);
  });

  it('reports the reason when the delete matched nothing, rather than reporting success', async () => {
    const execute = vi.fn().mockResolvedValue(0);
    const db = { execute } as unknown as DatabaseAdapter;

    await expect(OrganizationService.removeMember(db, 'org-123', 'the-owner')).rejects.toThrow(
      /ownership must be transferred first/i,
    );
  });
});
