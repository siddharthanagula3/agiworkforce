import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProductivityStore } from '../productivityStore';
import type { Task } from '../../types/productivity';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  invokeMock.mockReset();
  useProductivityStore.setState({
    connectedProviders: new Set(),
    selectedProvider: null,
    tasks: [],
    selectedTaskId: null,
    notionPages: [],
    trelloBoards: [],
    trelloCards: [],
    asanaProjects: [],
    asanaTasks: [],
    asanaWorkspaceId: null,
    loading: false,
    error: null,
  });
});

describe('useProductivityStore', () => {
  it('connects to notion and loads tasks/pages', async () => {
    const tasks: Task[] = [
      {
        id: 'task-1',
        title: 'Draft proposal',
        description: 'Outline scope with customer team',
        status: 'in_progress',
        tags: ['proposal'],
        project_name: 'Client A',
        due_date: null,
        assignee: 'Casey',
        priority: null,
        url: null,
      },
    ];

    invokeMock.mockImplementation(async (command: string) => {
      switch (command) {
        case 'productivity_connect':
          return { account_id: 'acct-1', success: true };
        case 'productivity_list_tasks':
          return tasks;
        case 'productivity_notion_list_pages':
          return [{ id: 'page-1', properties: {}, url: 'https://notion.so/page-1' }];
        default:
          throw new Error(`Unexpected invoke command: ${command}`);
      }
    });

    await useProductivityStore.getState().connect('notion', { token: 'secret-token' });
    await flushPromises();

    const state = useProductivityStore.getState();
    expect(Array.from(state.connectedProviders)).toContain('notion');
    expect(state.selectedProvider).toBe('notion');
    expect(state.tasks).toEqual(tasks);
    expect(state.notionPages).toHaveLength(1);
  });

  it('selectProvider loads trello boards and tasks', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      switch (command) {
        case 'productivity_list_tasks':
          return [
            {
              id: 'card-1',
              title: 'Prepare board deck',
              status: 'todo',
              tags: [],
              url: null,
              description: null,
              project_name: null,
              due_date: null,
              assignee: null,
              priority: null,
            },
          ];
        case 'productivity_trello_list_boards':
          return [{ id: 'board-1', name: 'Product Roadmap', url: 'https://trello.com/b/board-1' }];
        default:
          throw new Error(`Unexpected invoke command: ${command}`);
      }
    });

    useProductivityStore.setState({
      connectedProviders: new Set(['trello']),
    });

    useProductivityStore.getState().selectProvider('trello');
    await flushPromises();

    const state = useProductivityStore.getState();
    expect(state.selectedProvider).toBe('trello');
    expect(state.tasks).toHaveLength(1);
    expect(state.trelloBoards).toHaveLength(1);
  });

  it('setAsanaWorkspace persists workspace ID and fetches projects', async () => {
    invokeMock.mockImplementation(async (command: string, payload: unknown) => {
      if (command === 'productivity_asana_list_projects') {
        expect(payload).toEqual({ workspace_id: 'workspace-123' });
        return [{ gid: 'proj-1', name: 'Marketing Ops' }];
      }
      throw new Error(`Unexpected invoke command: ${command}`);
    });

    await useProductivityStore.getState().setAsanaWorkspace('workspace-123');
    await flushPromises();

    const state = useProductivityStore.getState();
    expect(state.asanaWorkspaceId).toBe('workspace-123');
    expect(state.asanaProjects).toEqual([{ gid: 'proj-1', name: 'Marketing Ops' }]);
  });
});
