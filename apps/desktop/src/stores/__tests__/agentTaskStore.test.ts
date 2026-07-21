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

import {
  applyAgentTaskGoalError,
  applyAgentTaskGoalExecutionStarted,
  applyAgentTaskStateChanged,
  useAgentTaskStore,
} from '../agentTaskStore';
import { useAppModeStore } from '../appModeStore';
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
    // TRUST BOUNDARY (desktop-trust-boundary-01): pin the workspace mode so
    // the trustMode each submission sends is deterministic, not an accident
    // of the non-Tauri test environment's default.
    useAppModeStore.setState({ mode: 'local' });
  });

  describe('canonical lifecycle ownership', () => {
    it('keeps lifecycle state engine-authored when a legacy goal error arrives', () => {
      useAgentTaskStore.setState({
        tasks: [
          {
            id: 'goal-error',
            goal: 'Inspect the repository',
            status: 'running',
            createdAt: new Date().toISOString(),
          },
        ],
      });

      applyAgentTaskGoalError({ goal_id: 'goal-error', error: 'Tool failed' });

      expect(useAgentTaskStore.getState().tasks[0]).toEqual(
        expect.objectContaining({ status: 'running', error: 'Tool failed' }),
      );
    });

    it('does not infer running before the engine emits a task-state event', () => {
      applyAgentTaskGoalExecutionStarted(
        { goal_id: 'goal-parallel', description: 'Inspect in parallel' },
        'parallel',
      );

      expect(useAgentTaskStore.getState().tasks[0]).toEqual(
        expect.objectContaining({ id: 'goal-parallel', status: 'queued' }),
      );
    });

    it('clears a review completion timestamp when the engine resumes work', () => {
      useAgentTaskStore.setState({
        tasks: [
          {
            id: 'goal-review',
            goal: 'Revise the report',
            status: 'ready_for_review',
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        ],
      });

      applyAgentTaskStateChanged({
        taskId: 'goal-review',
        state: 'running',
        previousState: 'ready_for_review',
        summary: 'Agent resumed working.',
      });

      expect(useAgentTaskStore.getState().tasks[0]).toEqual(
        expect.objectContaining({ status: 'running', completedAt: undefined }),
      );
    });
  });

  describe('submitGoal', () => {
    it('calls invoke with correct command and adds a queued task', async () => {
      mockInvoke.mockResolvedValueOnce({ goalId: 'goal-123' });

      const { submitGoal } = useAgentTaskStore.getState();
      const taskId = await submitGoal('Write a report');

      expect(mockInvoke).toHaveBeenCalledWith('agi_submit_goal', {
        request: { description: 'Write a report', priority: 'medium', trustMode: 'local' },
      });
      expect(taskId).toBe('goal-123');

      const { tasks } = useAgentTaskStore.getState();
      expect(tasks.length).toBe(1);
      expect(tasks[0]!.goal).toBe('Write a report');
      expect(tasks[0]!.status).toBe('queued');
      expect(tasks[0]!.id).toBe('goal-123');
    });

    it('sends the managed trust boundary when the workspace is in cloud mode', async () => {
      useAppModeStore.setState({ mode: 'cloud' });
      mockInvoke.mockResolvedValueOnce({ goalId: 'goal-cloud-1' });

      const { submitGoal } = useAgentTaskStore.getState();
      await submitGoal('Summarize cloud docs');

      expect(mockInvoke).toHaveBeenCalledWith('agi_submit_goal', {
        request: { description: 'Summarize cloud docs', priority: 'medium', trustMode: 'managed' },
      });
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
        request: {
          description: 'Parallel task',
          priority: 'medium',
          numAgents: 3,
          trustMode: 'local',
        },
      });
      expect(taskId).toBe('goal-parallel-123');

      const { tasks } = useAgentTaskStore.getState();
      expect(tasks.length).toBe(1);
      expect(tasks[0]!.id).toBe('goal-parallel-123');
      expect(tasks[0]!.status).toBe('queued');
      expect(tasks[0]!.result).toContain('0.95');
    });

    it('records a parallel result error without inferring lifecycle state', async () => {
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
          status: 'queued',
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
        expect.objectContaining({ id: 'goal-parallel-existing', status: 'running' }),
      );
    });
  });

  describe('submitGoalSwarm', () => {
    it('sends the local trust boundary on the swarm payload', async () => {
      mockInvoke.mockResolvedValueOnce({
        goalId: 'goal-swarm-1',
        summary: 'Swarm finished',
        succeeded: 2,
        failed: 0,
        wallTimeMs: 1200,
        speedupRatio: 1.8,
        criticalPathLength: 3,
        maxParallelism: 2,
      });

      const taskId = await useAgentTaskStore.getState().submitGoalSwarm('Swarm the audit');

      expect(mockInvoke).toHaveBeenCalledWith('agi_submit_goal_swarm', {
        request: {
          description: 'Swarm the audit',
          priority: 'medium',
          deadline: undefined,
          successCriteria: undefined,
          trustMode: 'local',
        },
      });
      expect(taskId).toBe('goal-swarm-1');
    });
  });

  describe('submitGoalAuto', () => {
    it('sends the local trust boundary on the auto payload', async () => {
      mockInvoke.mockResolvedValueOnce({ goalId: 'goal-auto-1' });

      const taskId = await useAgentTaskStore.getState().submitGoalAuto('Pick the best strategy');

      expect(mockInvoke).toHaveBeenCalledWith('agi_submit_goal_auto', {
        request: {
          description: 'Pick the best strategy',
          priority: 'medium',
          deadline: undefined,
          successCriteria: undefined,
          trustMode: 'local',
        },
      });
      expect(taskId).toBe('goal-auto-1');
    });

    it('sends the managed trust boundary when the workspace is in cloud mode', async () => {
      useAppModeStore.setState({ mode: 'cloud' });
      mockInvoke.mockResolvedValueOnce({ goalId: 'goal-auto-cloud-1' });

      await useAgentTaskStore.getState().submitGoalAuto('Summarize cloud usage');

      expect(mockInvoke).toHaveBeenCalledWith('agi_submit_goal_auto', {
        request: expect.objectContaining({
          description: 'Summarize cloud usage',
          trustMode: 'managed',
        }),
      });
    });
  });

  describe('cancelTask', () => {
    it('marks a task as cancelled on success', async () => {
      mockInvoke.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
        state: 'cancelled',
        currentIteration: 0,
        context: { toolResults: [] },
      });

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
        state: 'queued',
        currentIteration: 0,
        context: { toolResults: [] },
      });

      const { getTaskStatus } = useAgentTaskStore.getState();
      const result = await getTaskStatus('nonexistent-task');
      expect(result).toBeNull();
    });

    it('updates task status from backend response', async () => {
      mockInvoke.mockResolvedValueOnce({
        state: 'completed',
        currentIteration: 5,
        context: { toolResults: [{ result: 'Done!', error: null }] },
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
