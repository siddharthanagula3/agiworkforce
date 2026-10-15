import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke,
  isTauri: true,
}));

import { useAppModeStore } from '../appModeStore';
import { useProjectStore, type Project } from '../projectStore';

type TauriMockModule = typeof import('../../lib/tauri-mock');

const LAUNCH: Project = {
  id: 'p-1',
  name: 'Launch',
  description: '',
  customInstructions: '',
  files: [],
  conversationIds: [],
  isArchived: false,
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
};

describe('projectStore local project star', () => {
  beforeEach(() => {
    invoke.mockReset();
    useAppModeStore.setState({ mode: 'local' });
    useProjectStore.setState({ projects: [LAUNCH], activeProjectId: null, error: null });
  });

  it('sends the star under the name the native project update reads', async () => {
    invoke.mockResolvedValue(undefined);

    await useProjectStore.getState().updateProject('p-1', { isStarred: true });

    expect(invoke).toHaveBeenCalledWith('project_update', {
      id: 'p-1',
      updates: { isStarred: true, updatedAt: expect.any(String) },
    });
    expect(useProjectStore.getState().projects[0]?.isStarred).toBe(true);
  });

  it('shows the star the native project list returns after a reload', async () => {
    invoke.mockImplementation(async (command: string) =>
      command === 'project_list' ? [{ ...LAUNCH, isStarred: true }] : undefined,
    );

    await useProjectStore.getState().loadProjects();

    expect(useProjectStore.getState().projects[0]?.isStarred).toBe(true);
  });
});
