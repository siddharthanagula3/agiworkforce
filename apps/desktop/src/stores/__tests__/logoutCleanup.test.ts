import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enableMapSet } from 'immer';
import { cleanupAllStoresOnLogout, clearPersistedUserData } from '../logoutCleanup';
import { useAgentTaskStore } from '../agentTaskStore';
import { useGitStore } from '../gitStore';

enableMapSet();

describe('clearPersistedUserData', () => {
  const removeItem = vi.fn();

  beforeEach(() => {
    removeItem.mockClear();
    Object.defineProperty(window, 'localStorage', {
      value: {
        removeItem,
      },
      writable: true,
    });
  });

  it('removes modular chat and agent task persisted stores on logout', () => {
    clearPersistedUserData();

    expect(removeItem).toHaveBeenCalledWith('chat-storage');
    expect(removeItem).toHaveBeenCalledWith('agiworkforce-agent-tasks');
  });
});

describe('cleanupAllStoresOnLogout', () => {
  beforeEach(() => {
    useAgentTaskStore.setState({
      tasks: [],
      loading: false,
      liveStepsByTask: {},
      liveProgressByTask: {},
    });
    useGitStore.setState({ reset: vi.fn() });
  });

  it('clears in-memory agent task state in the same renderer session', () => {
    useAgentTaskStore.setState({
      tasks: [
        {
          id: 'task-1',
          goal: 'Prior user task',
          status: 'running',
          createdAt: new Date().toISOString(),
        },
      ],
      loading: true,
      liveStepsByTask: {
        'task-1': [
          {
            id: 'step-1',
            index: 0,
            description: 'Leaked progress',
            status: 'running',
          },
        ],
      },
      liveProgressByTask: {
        'task-1': { step: 1, total: 2 },
      },
    });

    cleanupAllStoresOnLogout();

    expect(useAgentTaskStore.getState()).toMatchObject({
      tasks: [],
      loading: false,
      liveStepsByTask: {},
      liveProgressByTask: {},
    });
  });
});
