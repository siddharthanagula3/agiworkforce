import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const permissionRole = vi.hoisted(() => ({ value: 'admin' as string | null }));
vi.mock('@/lib/services/organization-permission-service', async () =>
  (await import('./organization-permission-service-mock')).organizationPermissionServiceMock(
    permissionRole,
  ),
);

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { resolveAuthority } from '../organization-member-admin-service';

const ORG = '11111111-1111-4111-8111-111111111111';

function dbHolding(status: string) {
  const row = {
    organization_id: ORG,
    user_id: 'user-admin',
    role: 'admin',
    status,
    provisioning_source: 'manual',
    provisioned_at: null,
    joined_at: '2026-09-01T00:00:00.000Z',
  };
  return { query: vi.fn(async () => [row]) } as unknown as DatabaseAdapter;
}

describe('resolveAuthority', () => {
  it('resolves the role and permissions of an active administrator', async () => {
    await expect(
      resolveAuthority(dbHolding('active'), ORG, { kind: 'member', userId: 'user-admin' }),
    ).resolves.toMatchObject({ actorId: 'user-admin', role: 'admin' });
  });

  it.each(['invited', 'suspended', 'deprovisioned'])(
    'refuses an administrator whose membership is %s',
    async (status) => {
      await expect(
        resolveAuthority(dbHolding(status), ORG, { kind: 'member', userId: 'user-admin' }),
      ).rejects.toMatchObject({ statusCode: 403 });
    },
  );
});
