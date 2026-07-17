import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '../projectStore';

describe('projectStore persistence boundary', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useProjectStore.setState({ projects: [], activeProjectId: null });
  });

  it('does not persist cloud project metadata in an unscoped browser key', () => {
    const now = '2026-07-15T00:00:00.000Z';

    useProjectStore.getState().addProject({
      id: 'project_account_a',
      name: 'Account A confidential project',
      createdAt: now,
      updatedAt: now,
    });

    expect(window.localStorage.getItem('agi-projects')).toBeNull();
  });
});
