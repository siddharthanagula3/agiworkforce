import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const workspace = vi.hoisted(() => ({ current: vi.fn() }));

type OriginalActiveWorkspaceServiceModule =
  typeof import('@/lib/services/active-workspace-service');

vi.mock('@/lib/services/active-workspace-service', async (importOriginal) => ({
  ...(await importOriginal<OriginalActiveWorkspaceServiceModule>()),
  resolveActiveOrganizationId: workspace.current,
}));

import { getActiveWorkspaceMediaAssetById } from './media-assets';

const query = vi.fn();
const db = { query } as unknown as DatabaseAdapter;

describe('owned media source context', () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue([]);
    workspace.current.mockResolvedValue('00000000-0000-4000-8000-000000000001');
  });

  it('binds the asset, user, active workspace and current conversation in the query', async () => {
    expect(
      await getActiveWorkspaceMediaAssetById('fixture-user', 'asset-B', db, {
        conversationId: 'current-chat-A',
      }),
    ).toBeNull();
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain('user_id = $2');
    expect(sql).toContain('organization_id is not distinct from $3::uuid');
    expect(sql).toContain('conversation_id = $4::uuid');
    expect(sql).toContain('deleted_at is null');
    expect(params).toEqual([
      'asset-B',
      'fixture-user',
      '00000000-0000-4000-8000-000000000001',
      'current-chat-A',
    ]);
  });

  it('preserves existing general owned-asset lookups for other readers', async () => {
    await getActiveWorkspaceMediaAssetById('fixture-user', 'asset-B', db);
    expect(query.mock.calls[0]?.[0]).not.toContain('conversation_id =');
    expect(query.mock.calls[0]?.[1]).toHaveLength(3);
  });
});
