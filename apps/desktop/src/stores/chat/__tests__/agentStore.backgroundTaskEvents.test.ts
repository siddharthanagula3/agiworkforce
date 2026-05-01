import { beforeEach, describe, expect, it } from 'vitest';
import { enableMapSet } from 'immer';
import {
  applyBackgroundTaskEvent,
  applyBackgroundTaskSnapshot,
  useAgentStore,
} from '../agentStore';

enableMapSet();

describe('agentStore background task event reducers', () => {
  beforeEach(() => {
    useAgentStore.getState().resetOnLogout();
  });

  it('updates progress from lightweight task progress payloads', () => {
    useAgentStore.getState().addBackgroundTask({
      id: 'task-1',
      name: 'Index project',
      status: 'running',
      progress: 10,
      priority: 'normal',
    });

    applyBackgroundTaskEvent(
      {
        task_id: 'task-1',
        progress: 55,
      },
      'task:progress',
    );

    expect(useAgentStore.getState().backgroundTasks[0]).toMatchObject({
      id: 'task-1',
      progress: 55,
    });
  });

  it('normalizes terminal task snapshots from Rust payloads', () => {
    const completedAt = new Date().toISOString();

    applyBackgroundTaskEvent(
      {
        id: 'task-2',
        name: 'Run backup',
        description: 'Backup workspace',
        status: 'Failed',
        progress: 80,
        priority: 'High',
        created_at: '2026-04-06T10:00:00.000Z',
        completed_at: completedAt,
        result: {
          success: false,
          error: 'Disk full',
        },
      },
      'task:failed',
    );

    expect(useAgentStore.getState().backgroundTasks[0]).toMatchObject({
      id: 'task-2',
      name: 'Run backup',
      status: 'failed',
      progress: 80,
      priority: 'high',
      error: 'Disk full',
    });
    expect(useAgentStore.getState().backgroundTasks[0]?.completedAt).toBeInstanceOf(Date);
  });

  it('replaces store state from a bootstrap snapshot', () => {
    useAgentStore.getState().addBackgroundTask({
      id: 'stale-task',
      name: 'Stale',
      status: 'running',
      progress: 5,
      priority: 'normal',
    });

    applyBackgroundTaskSnapshot([
      {
        id: 'task-3',
        name: 'Bootstrap task',
        status: 'Running',
        progress: 25,
        priority: 'Normal',
        created_at: '2026-04-06T10:00:00.000Z',
      },
    ]);

    expect(useAgentStore.getState().backgroundTasks).toHaveLength(1);
    expect(useAgentStore.getState().backgroundTasks[0]).toMatchObject({
      id: 'task-3',
      name: 'Bootstrap task',
      status: 'running',
      progress: 25,
    });
  });
});
