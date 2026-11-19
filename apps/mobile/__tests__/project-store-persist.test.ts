const mockStored = new Map<string, string>();

jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn((key: string) => mockStored.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      mockStored.set(key, value);
    }),
    removeItem: jest.fn((key: string) => {
      mockStored.delete(key);
    }),
  },
}));

import { useProjectStore, type Project } from '@/src/features/projects/store';

const STORAGE_KEY = 'project-store';

function project(id: string): Project {
  return {
    id,
    name: `Project ${id}`,
    description: '',
    instructions: '',
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
  };
}

describe('local project store persistence', () => {
  beforeEach(() => {
    mockStored.clear();
    useProjectStore.setState({ projects: [], activeProjectId: null });
  });

  it('restores stored projects but never a stored active project', async () => {
    mockStored.set(
      STORAGE_KEY,
      JSON.stringify({
        state: { projects: [project('p1')], activeProjectId: 'p1' },
        version: 0,
      }),
    );

    await useProjectStore.persist.rehydrate();

    expect(useProjectStore.getState().projects.map((p) => p.id)).toEqual(['p1']);
    expect(useProjectStore.getState().activeProjectId).toBeNull();
  });

  it('does not write the active project to storage', () => {
    useProjectStore.setState({ projects: [project('p1')], activeProjectId: 'p1' });

    const written = JSON.parse(mockStored.get(STORAGE_KEY) ?? '{}');
    expect(written.state.projects).toHaveLength(1);
    expect(written.state).not.toHaveProperty('activeProjectId');
  });
});
