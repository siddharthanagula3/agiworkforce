import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock sonner toast before importing the store
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { useAgentTaskStore } from '../agentTaskStore';
import { invoke } from '../../lib/tauri-mock';
import { toast } from 'sonner';

const mockInvoke = vi.mocked(invoke);

describe('agentTaskStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentTaskStore.setState({
      tasks: [],
      loading: false,
    });
  });

  describe('submitGoal', () => {
    it('calls invoke with correct command and adds a pending task', async () => {
      mockInvoke.mockResolvedValueOnce({ goalId: 'goal-123' });

      const { submitGoal } = useAgentTaskStore.getState();
      const taskId = await submitGoal('Write a report');

      expect(mockInvoke).toHaveBeenCalledWith('agi_submit_goal', {
        request: { description: 'Write a report', priority: 'medium' },
      });
      expect(taskId).toBe('goal-123');

      const { tasks } = useAgentTaskStore.getState();
      expect(tasks.length).toBe(1);
      expect(tasks[0]!.goal).toBe('Write a report');
      expect(tasks[0]!.status).toBe('pending');
      expect(tasks[0]!.id).toBe('goal-123');
    });

    it('uses the engine goal id and actual result for parallel execution', async () => {
      mockInvoke.mockResolvedValueOnce({
        goalId: 'goal-parallel-123',
        bestResult: {
          score: 0.95,
          result: { success: true, error: null },
        },
      });

      const { submitGoal } = useAgentTaskStore.getState();
      const taskId = await submitGoal('Parallel task', { parallel: true, maxIterations: 3 });

      expect(mockInvoke).toHaveBeenCalledWith('agi_submit_goal_parallel', {
        request: { description: 'Parallel task', priority: 'medium', numAgents: 3 },
      });
      expect(taskId).toBe('goal-parallel-123');

      const { tasks } = useAgentTaskStore.getState();
      expect(tasks.length).toBe(1);
      expect(tasks[0]!.id).toBe('goal-parallel-123');
      expect(tasks[0]!.status).toBe('completed');
      expect(tasks[0]!.result).toContain('0.95');
    });

    it('marks a parallel task failed when the engine result failed', async () => {
      mockInvoke.mockResolvedValueOnce({
        goalId: 'goal-parallel-failed',
        bestResult: {
          score: 0.1,
          result: { success: false, error: 'Tool execution failed' },
        },
      });

      await useAgentTaskStore.getState().submitGoal('Parallel task', { parallel: true });

      expect(useAgentTaskStore.getState().tasks).toEqual([
        expect.objectContaining({
          id: 'goal-parallel-failed',
          status: 'failed',
          error: 'Tool execution failed',
        }),
      ]);
    });

    it('updates an event-created task instead of appending a duplicate', async () => {
      useAgentTaskStore.setState({
        tasks: [
          {
            id: 'goal-parallel-existing',
            goal: 'Parallel task',
            status: 'running',
            createdAt: new Date().toISOString(),
            executionMode: 'parallel',
          },
        ],
      });
      mockInvoke.mockResolvedValueOnce({
        goalId: 'goal-parallel-existing',
        bestResult: {
          score: 0.9,
          result: { success: true, error: null },
        },
      });

      await useAgentTaskStore.getState().submitGoal('Parallel task', { parallel: true });

      const { tasks } = useAgentTaskStore.getState();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toEqual(
        expect.objectContaining({ id: 'goal-parallel-existing', status: 'completed' }),
      );
    });
  });

  describe('cancelTask', () => {
    it('marks a task as cancelled on success', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      useAgentTaskStore.setState({
        tasks: [
          {
            id: 'test-task-1',
            goal: 'Test goal',
            status: 'running',
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const { cancelTask } = useAgentTaskStore.getState();
      await cancelTask('test-task-1');

      const { tasks } = useAgentTaskStore.getState();
      const task = tasks.find((t) => t.id === 'test-task-1');
      expect(task).toBeDefined();
      expect(task!.status).toBe('cancelled');
      expect(task!.completedAt).toBeDefined();
    });

    it('shows toast.error on failure and does not change task status', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Network error'));

      useAgentTaskStore.setState({
        tasks: [
          {
            id: 'test-task-2',
            goal: 'Test goal',
            status: 'running',
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const { cancelTask } = useAgentTaskStore.getState();
      await cancelTask('test-task-2');

      // Task status should remain 'running' since cancel failed
      const { tasks } = useAgentTaskStore.getState();
      const task = tasks.find((t) => t.id === 'test-task-2');
      expect(task).toBeDefined();
      expect(task!.status).toBe('running');

      // toast.error should have been called
      expect(toast.error).toHaveBeenCalledWith('Failed to cancel task');
    });
  });

  describe('fetchTasks', () => {
    it('sets loading to false after fetch completes', async () => {
      mockInvoke.mockResolvedValueOnce([]);

      const { fetchTasks } = useAgentTaskStore.getState();
      await fetchTasks();

      const { loading } = useAgentTaskStore.getState();
      expect(loading).toBe(false);
    });

    it('calls toast.error on fetch failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Fetch failed'));

      const { fetchTasks } = useAgentTaskStore.getState();
      await fetchTasks();

      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load agent tasks'),
      );
      const { loading } = useAgentTaskStore.getState();
      expect(loading).toBe(false);
    });
  });

  describe('getTaskStatus', () => {
    it('returns null for task not in state', async () => {
      mockInvoke.mockResolvedValueOnce({
        context: { currentIteration: 0, status: 'pending' },
      });

      const { getTaskStatus } = useAgentTaskStore.getState();
      const result = await getTaskStatus('nonexistent-task');
      expect(result).toBeNull();
    });

    it('updates task status from backend response', async () => {
      mockInvoke.mockResolvedValueOnce({
        context: { currentIteration: 5, status: 'completed', result: 'Done!' },
      });

      useAgentTaskStore.setState({
        tasks: [
          {
            id: 'task-1',
            goal: 'Test',
            status: 'running',
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const { getTaskStatus } = useAgentTaskStore.getState();
      const result = await getTaskStatus('task-1');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(result!.iterations).toBe(5);
      expect(result!.result).toBe('Done!');
    });
  });

  describe('fetchInsights', () => {
    it('returns empty array when no insights', async () => {
      mockInvoke.mockResolvedValueOnce(null);

      const { fetchInsights } = useAgentTaskStore.getState();
      const insights = await fetchInsights('some-task');
      expect(insights).toEqual([]);
    });

    it('stores and returns recommendations', async () => {
      mockInvoke.mockResolvedValueOnce({
        recommendations: ['Improve efficiency', 'Reduce costs'],
      });

      useAgentTaskStore.setState({
        tasks: [
          {
            id: 'task-1',
            goal: 'Test',
            status: 'completed',
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const { fetchInsights } = useAgentTaskStore.getState();
      const insights = await fetchInsights('task-1');

      expect(insights).toEqual(['Improve efficiency', 'Reduce costs']);

      const { tasks } = useAgentTaskStore.getState();
      const task = tasks.find((t) => t.id === 'task-1');
      expect(task!.insights).toEqual(['Improve efficiency', 'Reduce costs']);
    });
  });
});
