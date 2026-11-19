jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

jest.mock('@/services/managedCloudProjects', () => ({
  managedCloudProjects: { updateProject: jest.fn(), getProject: jest.fn() },
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: jest.fn(() => ({ ownerId: 'user-1', epoch: 1 })),
  assertCloudAccountEpochCurrent: jest.fn(),
}));

import { managedCloudProjects } from '@/services/managedCloudProjects';
import { updateCloudProjectDetails } from '@/src/features/projects/service';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { useProjectSyncStateStore } from '@/stores/projects/projectSyncStateStore';

const PROJECT_ID = '0190a000-0000-7000-8000-000000000001';

function managedProject(overrides: Record<string, unknown> = {}) {
  return {
    id: PROJECT_ID,
    ownerUserId: 'user-1',
    name: 'Launch plan',
    defaultPrivacyMode: 'managed',
    defaultProviderMode: 'ManagedGateway',
    allowedSurfaces: ['web', 'desktop', 'mobile'],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
    ...overrides,
  };
}

const update = managedCloudProjects.updateProject as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useCloudProjectStore.setState({ projects: [], details: {}, activeProjectId: null });
});

describe('updateCloudProjectDetails when the save fails', () => {
  it('restores a project whose details were already fetched', async () => {
    useCloudProjectStore.getState().setCloudProjectDetails([managedProject() as never]);
    update.mockRejectedValue(new Error('HTTP 500'));

    await expect(
      updateCloudProjectDetails(PROJECT_ID, { usesAccountStyle: false }),
    ).rejects.toThrow('HTTP 500');

    expect(useCloudProjectStore.getState().details[PROJECT_ID]?.usesAccountStyle).toBe(true);
  });

  it('takes the change back when the details were never fetched', async () => {
    update.mockRejectedValue(new Error('HTTP 500'));
    const saving = updateCloudProjectDetails(PROJECT_ID, {
      usesAccountStyle: false,
      iconEmoji: 'R',
    });

    expect(useCloudProjectStore.getState().details[PROJECT_ID]).toMatchObject({
      usesAccountStyle: false,
      iconEmoji: 'R',
    });
    await expect(saving).rejects.toThrow('HTTP 500');

    const held = useCloudProjectStore.getState().details[PROJECT_ID];
    expect(held?.usesAccountStyle).toBeUndefined();
    expect(held?.iconEmoji).toBeUndefined();
  });

  it('removes the entry when nothing else is left in it', async () => {
    update.mockRejectedValue(new Error('HTTP 500'));
    const saving = updateCloudProjectDetails(PROJECT_ID, { usesAccountStyle: false });
    await expect(saving).rejects.toThrow('HTTP 500');

    expect(PROJECT_ID in useCloudProjectStore.getState().details).toBe(false);
  });

  it('keeps what the server reported while the save was in flight, even when it matches the change', async () => {
    let refuse: (error: Error) => void = () => undefined;
    update.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject;
        }),
    );
    const saving = updateCloudProjectDetails(PROJECT_ID, { usesAccountStyle: false });
    useCloudProjectStore
      .getState()
      .setCloudProjectDetails([managedProject({ usesAccountStyle: true }) as never]);

    refuse(new Error('HTTP 500'));
    await expect(saving).rejects.toThrow('HTTP 500');

    expect(useCloudProjectStore.getState().details[PROJECT_ID]?.usesAccountStyle).toBe(true);
  });

  it('keeps a server value equal to the refused change', async () => {
    let refuse: (error: Error) => void = () => undefined;
    update.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject;
        }),
    );
    const saving = updateCloudProjectDetails(PROJECT_ID, { usesAccountStyle: false });
    useCloudProjectStore
      .getState()
      .setCloudProjectDetails([managedProject({ usesAccountStyle: false }) as never]);

    refuse(new Error('HTTP 500'));
    await expect(saving).rejects.toThrow('HTTP 500');

    expect(useCloudProjectStore.getState().details[PROJECT_ID]?.usesAccountStyle).toBe(false);
  });

  it('leaves the other pending change in place', async () => {
    let refuse: (error: Error) => void = () => undefined;
    update
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            refuse = reject;
          }),
      )
      .mockResolvedValueOnce(managedProject({ usesGlobalMemory: false }));
    const first = updateCloudProjectDetails(PROJECT_ID, { usesAccountStyle: false });
    const second = updateCloudProjectDetails(PROJECT_ID, { usesGlobalMemory: false });

    refuse(new Error('HTTP 500'));
    await expect(first).rejects.toThrow('HTTP 500');
    await second;

    const held = useCloudProjectStore.getState().details[PROJECT_ID];
    expect(held?.usesGlobalMemory).toBe(false);
    expect(held?.usesAccountStyle).toBe(true);
  });
});

describe('updateCloudProjectDetails and a memory scope still waiting to sync', () => {
  beforeEach(() => {
    useProjectSyncStateStore.getState().resetProjectSync();
    useProjectSyncStateStore.getState().markProjectOnlyMemoryPending(PROJECT_ID);
  });

  it('lets a memory choice the server accepted replace the one waiting from creation', async () => {
    update.mockResolvedValue(managedProject({ usesGlobalMemory: true }));

    await updateCloudProjectDetails(PROJECT_ID, { usesGlobalMemory: true });

    expect(useProjectSyncStateStore.getState().projectOnlyMemoryPendingIds).toEqual([]);
  });

  it('keeps the choice from creation waiting when the server did not accept the change', async () => {
    update.mockRejectedValue(new Error('HTTP 500'));

    await expect(updateCloudProjectDetails(PROJECT_ID, { usesGlobalMemory: true })).rejects.toThrow(
      'HTTP 500',
    );

    expect(useProjectSyncStateStore.getState().projectOnlyMemoryPendingIds).toEqual([PROJECT_ID]);
  });

  it('keeps the choice from creation waiting when another setting is saved', async () => {
    update.mockResolvedValue(managedProject({ usesAccountStyle: false }));

    await updateCloudProjectDetails(PROJECT_ID, { usesAccountStyle: false });

    expect(useProjectSyncStateStore.getState().projectOnlyMemoryPendingIds).toEqual([PROJECT_ID]);
  });
});
