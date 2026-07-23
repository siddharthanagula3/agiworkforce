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

  it('reassigns a conversation between project counts without duplicates', () => {
    const now = '2026-07-15T00:00:00.000Z';
    useProjectStore.setState({
      projects: [
        {
          id: 'project-a',
          name: 'Project A',
          createdAt: now,
          updatedAt: now,
          conversationIds: ['conversation-1'],
        },
        {
          id: 'project-b',
          name: 'Project B',
          createdAt: now,
          updatedAt: now,
          conversationIds: [],
        },
      ],
      activeProjectId: null,
    });

    useProjectStore.getState().reassignConversation('conversation-1', 'project-a', 'project-b');
    useProjectStore.getState().reassignConversation('conversation-1', 'project-a', 'project-b');

    expect(useProjectStore.getState().projects).toEqual([
      expect.objectContaining({ id: 'project-a', conversationIds: [] }),
      expect.objectContaining({ id: 'project-b', conversationIds: ['conversation-1'] }),
    ]);
  });
});
