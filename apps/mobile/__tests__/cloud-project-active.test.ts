jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { useCloudProjectStore, type CloudProject } from '@/stores/projects/cloudProjectStore';

function project(id: string, overrides: Partial<CloudProject> = {}): CloudProject {
  return {
    id,
    name: `Project ${id}`,
    description: null,
    instructions: null,
    color: null,
    isArchived: false,
    metadata: null,
    source: 'mobile',
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('cloud project active selection', () => {
  beforeEach(() => {
    useCloudProjectStore.setState({ projects: [], activeProjectId: null });
  });

  it('activates only a live cloud project and rejects unknown ids (no-op)', () => {
    const s = useCloudProjectStore.getState();
    s.upsertCloudProject(project('p1'));

    s.setActiveCloudProject('p1');
    expect(useCloudProjectStore.getState().activeProjectId).toBe('p1');

    s.setActiveCloudProject('does-not-exist');
    expect(useCloudProjectStore.getState().activeProjectId).toBe('p1');

    s.setActiveCloudProject(null);
    expect(useCloudProjectStore.getState().activeProjectId).toBeNull();
  });

  it('refuses to activate a tombstoned project', () => {
    const s = useCloudProjectStore.getState();
    s.upsertCloudProject(project('p1', { deletedAt: '2026-06-22T01:00:00.000Z' }));
    s.setActiveCloudProject('p1');
    expect(useCloudProjectStore.getState().activeProjectId).toBeNull();
  });

  it('clears the active id when its project is tombstoned via upsert (user delete path)', () => {
    const s = useCloudProjectStore.getState();
    s.upsertCloudProject(project('p1'));
    s.setActiveCloudProject('p1');
    expect(useCloudProjectStore.getState().activeProjectId).toBe('p1');

    s.upsertCloudProject(project('p1', { deletedAt: '2026-06-22T02:00:00.000Z' }));
    expect(useCloudProjectStore.getState().activeProjectId).toBeNull();
  });

  it('clears the active id on hardDelete and on an applied sync tombstone', () => {
    const s = useCloudProjectStore.getState();

    s.upsertCloudProject(project('p1'));
    s.setActiveCloudProject('p1');
    s.hardDeleteCloudProject('p1');
    expect(useCloudProjectStore.getState().activeProjectId).toBeNull();

    s.upsertCloudProject(project('p2'));
    s.setActiveCloudProject('p2');
    s.applyCloudProjectDeltas([project('p2', { deletedAt: '2026-06-22T03:00:00.000Z' })]);
    expect(useCloudProjectStore.getState().activeProjectId).toBeNull();
  });

  it('leaves the active id intact when a DIFFERENT project is tombstoned', () => {
    const s = useCloudProjectStore.getState();
    s.upsertCloudProject(project('p1'));
    s.upsertCloudProject(project('p2'));
    s.setActiveCloudProject('p1');
    s.upsertCloudProject(project('p2', { deletedAt: '2026-06-22T04:00:00.000Z' }));
    expect(useCloudProjectStore.getState().activeProjectId).toBe('p1');
  });
});
