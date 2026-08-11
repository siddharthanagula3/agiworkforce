import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  persistActiveWorkspaceSelection,
  persistProvenActiveWorkspaceSelection,
  resolveActiveOrganizationId,
  resolveOrganizationMembershipId,
} from '../active-workspace-service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function harness() {
  const query = vi.fn();
  const execute = vi.fn();
  return {
    db: { query, execute } as unknown as DatabaseAdapter,
    query,
    execute,
  };
}

describe('active workspace persistence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only a durable selection backed by a current membership', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]);

    await expect(resolveActiveOrganizationId(h.db, 'user-1')).resolves.toBe(ORGANIZATION_ID);
    expect(String(h.query.mock.calls[0]?.[0])).toContain('join public.organization_members');
  });

  it('revalidates an explicit workspace selector and rejects malformed ids before SQL', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]);

    await expect(resolveOrganizationMembershipId(h.db, 'user-1', ORGANIZATION_ID)).resolves.toBe(
      ORGANIZATION_ID,
    );
    expect(h.query).toHaveBeenCalledWith(expect.stringContaining('organization_members'), [
      ORGANIZATION_ID,
      'user-1',
    ]);

    h.query.mockClear();
    await expect(resolveOrganizationMembershipId(h.db, 'user-1', 'not-an-id')).resolves.toBeNull();
    expect(h.query).not.toHaveBeenCalled();
  });

  it('rejects an organization that the account does not belong to', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]);

    await expect(
      persistActiveWorkspaceSelection(h.db, 'user-1', ORGANIZATION_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('creates a missing workspace object while preserving existing settings and workspace keys', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]);

    await persistActiveWorkspaceSelection(h.db, 'user-1', ORGANIZATION_ID);

    const [sql, params] = h.execute.mock.calls[0] ?? [];
    expect(String(sql)).toContain("settings -> 'workspace'");
    expect(String(sql)).toContain("|| jsonb_build_object('activeOrganizationId'");
    expect(String(sql)).not.toContain('jsonb_set(');
    expect(params).toEqual(['user-1', ORGANIZATION_ID]);
  });

  it('writes Personal without a membership lookup', async () => {
    const h = harness();

    await persistActiveWorkspaceSelection(h.db, 'user-1', null);

    expect(h.query).not.toHaveBeenCalled();
    expect(h.execute).toHaveBeenCalledWith(expect.any(String), ['user-1', 'personal']);
  });

  it('supports an exact membership already proven in the same transaction', async () => {
    const h = harness();

    await persistProvenActiveWorkspaceSelection(h.db, 'user-1', ORGANIZATION_ID);

    expect(h.query).not.toHaveBeenCalled();
    expect(h.execute).toHaveBeenCalledWith(expect.any(String), ['user-1', ORGANIZATION_ID]);
  });
});
