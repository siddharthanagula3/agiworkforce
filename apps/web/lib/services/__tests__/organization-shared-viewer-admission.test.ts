import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { lockdown } = vi.hoisted(() => ({ lockdown: vi.fn() }));
vi.mock('@/lib/feature-flags/tenant-lockdown', async (importOriginal) => ({
  ...(await importOriginal<MockedModule0>()),
  assertTenantNotLockedDown: lockdown,
}));

import { assertOrganizationSharedViewerAdmission } from '../organization-shared-viewer-admission';

const ORG = '11111111-1111-4111-8111-111111111111';
const RESOURCE = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
  lockdown.mockResolvedValue(undefined);
});

describe.each(['session', 'artifact'] as const)('%s organization viewer admission', (type) => {
  const resource = {
    type,
    id: RESOURCE,
    ownerUserId: 'owner',
    visibility: 'organization' as const,
  };

  it('checks the actual unique grant through the same scoped adapter', async () => {
    const query = vi.fn().mockResolvedValue([{ organization_id: ORG }]);
    const db = { query } as unknown as DatabaseAdapter;
    await expect(
      assertOrganizationSharedViewerAdmission(db, 'member', resource),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        type === 'session' ? 'organization_shared_sessions' : 'organization_shared_artifacts',
      ),
      [RESOURCE],
    );
    expect(lockdown).toHaveBeenCalledWith(ORG);
  });

  it('refuses a missing or no longer readable grant', async () => {
    const query = vi.fn().mockResolvedValue([]);
    await expect(
      assertOrganizationSharedViewerAdmission(
        { query } as unknown as DatabaseAdapter,
        'member',
        resource,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(lockdown).not.toHaveBeenCalled();
  });

  it('propagates actual organization lockdown', async () => {
    const failure = new Error('locked actual organization');
    lockdown.mockRejectedValueOnce(failure);
    const query = vi.fn().mockResolvedValue([{ organization_id: ORG }]);
    await expect(
      assertOrganizationSharedViewerAdmission(
        { query } as unknown as DatabaseAdapter,
        'member',
        resource,
      ),
    ).rejects.toBe(failure);
  });

  it('preserves independently authorized owner access', async () => {
    const query = vi.fn();
    await assertOrganizationSharedViewerAdmission(
      { query } as unknown as DatabaseAdapter,
      'owner',
      resource,
    );
    expect(query).not.toHaveBeenCalled();
    expect(lockdown).not.toHaveBeenCalled();
  });

  it.each(['public', 'invited'] as const)('preserves %s admission', async (visibility) => {
    const query = vi.fn();
    await assertOrganizationSharedViewerAdmission(
      { query } as unknown as DatabaseAdapter,
      'viewer',
      { ...resource, visibility },
    );
    expect(query).not.toHaveBeenCalled();
    expect(lockdown).not.toHaveBeenCalled();
  });
});

type MockedModule0 = typeof import('@/lib/feature-flags/tenant-lockdown');
