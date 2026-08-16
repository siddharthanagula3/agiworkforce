import { describe, it, expect, beforeEach, vi } from 'vitest';

const { ensureAgiInitialized } = vi.hoisted(() => ({
  ensureAgiInitialized: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../api/agi', () => ({
  ensureAgiInitialized,
}));

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
  MAX_GOAL_ITERATIONS,
  MAX_PARALLEL_AGENTS,
  useAgentTaskStore,
} from '../agentTaskStore';
import { useAppModeStore } from '../appModeStore';
import { invoke } from '../../lib/tauri-mock';
import { toast } from 'sonner';
import { useChatModelStore } from '@agiworkforce/unified-chat';

const mockInvoke = vi.mocked(invoke);

describe('agentTaskStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAgiInitialized.mockResolvedValue(undefined);
    useAgentTaskStore.setState({
      tasks: [],
      loading: false,
    });
    useAppModeStore.setState({ mode: 'local' });
    useChatModelStore.getState().setModels([
      {
        id: 'fixture-local-model',
        name: 'Fixture local model',
        provider: 'ollama',
        tier: 'standard',
        supportsThinking: false,
        supportsVision: false,
        supportsTools: false,
        contextWindow: 4096,
        isLocal: true,
        isByok: false,
      },
    ]);
    useChatModelStore.getState().selectModel('fixture-local-model');
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
    it('preserves string-shaped native submission errors for the user', async () => {
      mockInvoke.mockRejectedValueOnce('Selected Ollama provider is unavailable');

      await expect(useAgentTaskStore.getState().submitGoal('Write a report')).rejects.toBe(
        'Selected Ollama provider is unavailable',
      );
      expect(toast.error).toHaveBeenCalledOnce();
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to submit goal: Selected Ollama provider is unavailable',
      );
    });

    it('calls invoke with correct command and adds a queued task', async () => {
      mockInvoke.mockResolvedValueOnce({ goalId: 'goal-123' });

      const { submitGoal } = useAgentTaskStore.getState();
      const taskId = await submitGoal('Write a report');

      expect(mockInvoke).toHaveBeenCalledWith('agi_submit_goal', {
        request: {
          description: 'Write a report',
          priority: 'medium',
          trustMode: 'local',
          modelId: 'fixture-local-model',
          provider: 'ollama',
        },
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
      useChatModelStore.getState().setModels([
        {
          id: 'fixture-managed-model',
          name: 'Fixture managed model',
          provider: 'managed_cloud',
          tier: 'standard',
          supportsThinking: false,
          supportsVision: false,
          supportsTools: false,
          contextWindow: 4096,
          isLocal: false,
          isByok: false,
        },
      ]);
      useChatModelStore.getState().selectModel('fixture-managed-model');
      mockInvoke.mockResolvedValueOnce({ goalId: 'goal-cloud-1' });

      const { submitGoal } = useAgentTaskStore.getState();
      await submitGoal('Summarize cloud docs');

      expect(mockInvoke).toHaveBeenCalledWith('agi_submit_goal', {
        request: {
          description: 'Summarize cloud docs',
          priority: 'medium',
          trustMode: 'managed',
          modelId: 'fixture-managed-model',
          provider: 'managed_cloud',
        },
      });
    });

    it('does not invoke native execution when caller authority expires during initialization', async () => {
      let finishInitialization!: () => void;
      ensureAgiInitialized.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishInitialization = resolve;
        }),
      );
      let current = true;

      const submission = useAgentTaskStore.getState().submitGoal('Stale companion task', {
        assertCurrent: () => {
          if (!current) throw new DOMException('Session ended', 'AbortError');
        },
      });
      await vi.waitFor(() => expect(ensureAgiInitialized).toHaveBeenCalledOnce());
      current = false;
      finishInitialization();

      await expect(submission).rejects.toMatchObject({ name: 'AbortError' });
      expect(mockInvoke).not.toHaveBeenCalledWith('agi_submit_goal', expect.anything());
    });

    it('does not silently submit under a new trust mode after initialization', async () => {
      let finishInitialization!: () => void;
      ensureAgiInitialized.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishInitialization = resolve;
        }),
      );

      const submission = useAgentTaskStore.getState().submitGoal('Boundary-pinned task');
      await vi.waitFor(() => expect(ensureAgiInitialized).toHaveBeenCalledOnce());
      useAppModeStore.setState({ mode: 'cloud' });
      finishInitialization();

      await expect(submission).rejects.toMatchObject({ name: 'AbortError' });
      expect(mockInvoke).not.toHaveBeenCalledWith('agi_submit_goal', expect.anything());
    });

    it('uses the engine goal id and actual result for parallel execution', async () => {
      mockInvoke.mockResolvedValueOnce({
        goalId: 'goal-parallel-123',
        state: 'ready_for_review',
        output: 'The inspected result is ready.',
        error: null,
      });

      const { submitGoal } = useAgentTaskStore.getState();
      const taskId = await submitGoal('Parallel task', { parallel: true, numAgents: 3 });

      expect(mockInvoke).toHaveBeenCalledWith('agi_submit_goal_parallel', {
        request: {
          description: 'Parallel task',
          priority: 'medium',
          numAgents: 3,
          trustMode: 'local',
          modelId: 'fixture-local-model',
          provider: 'ollama',
        },
      });
      expect(taskId).toBe('goal-parallel-123');

      const { tasks } = useAgentTaskStore.getState();
      expect(tasks.length).toBe(1);
      expect(tasks[0]!.id).toBe('goal-parallel-123');
      expect(tasks[0]!.status).toBe('ready_for_review');
      expect(tasks[0]!.result).toBe('The inspected result is ready.');
    });

    it('holds a caller-supplied agent count inside the engine fan-out ceiling', async () => {
      mockInvoke.mockResolvedValue({
        goalId: 'goal-parallel-clamped',
        state: 'ready_for_review',
        output: 'Done',
        error: null,
      });

      const { submitGoal } = useAgentTaskStore.getState();
      await submitGoal('Parallel task', { parallel: true, numAgents: 50 });
      await submitGoal('Parallel task', { parallel: true, numAgents: 0 });

      expect(mockInvoke).toHaveBeenNthCalledWith(
        1,
        'agi_submit_goal_parallel',
        expect.objectContaining({
          request: expect.objectContaining({ numAgents: MAX_PARALLEL_AGENTS }),
        }),
      );
      expect(mockInvoke).toHaveBeenNthCalledWith(
        2,
        'agi_submit_goal_parallel',
        expect.objectContaining({ request: expect.objectContaining({ numAgents: 1 }) }),
      );
    });

    it('caps the sequential iteration ceiling the engine is asked for', async () => {
      mockInvoke.mockResolvedValue({ goalId: 'goal-sequential-clamped' });

      await useAgentTaskStore.getState().submitGoal('Long task', { maxIterations: 500 });

      expect(mockInvoke).toHaveBeenCalledWith(
        'agi_submit_goal',
        expect.objectContaining({
          request: expect.objectContaining({ maxSteps: MAX_GOAL_ITERATIONS }),
        }),
      );
    });

    it('records the canonical failed state and error returned by parallel execution', async () => {
      mockInvoke.mockResolvedValueOnce({
        goalId: 'goal-parallel-failed',
        state: 'failed',
        output: null,
        error: 'Tool execution failed',
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
        state: 'ready_for_review',
        output: 'Canonical final output',
        error: null,
      });

      await useAgentTaskStore.getState().submitGoal('Parallel task', { parallel: true });

      const { tasks } = useAgentTaskStore.getState();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toEqual(
        expect.objectContaining({
          id: 'goal-parallel-existing',
          status: 'ready_for_review',
          result: 'Canonical final output',
        }),
      );
    });
  });

  describe('submitGoalSwarm', () => {
    it('sends the local trust boundary on the swarm payload', async () => {
      mockInvoke.mockResolvedValueOnce({
        success: true,
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
          modelId: 'fixture-local-model',
          provider: 'ollama',
        },
      });
      expect(taskId).toBe('goal-swarm-1');
      expect(useAgentTaskStore.getState().tasks[0]).toEqual(
        expect.objectContaining({
          id: 'goal-swarm-1',
          status: 'ready_for_review',
          completedAt: expect.any(String),
        }),
      );
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
          modelId: 'fixture-local-model',
          provider: 'ollama',
        },
      });
      expect(taskId).toBe('goal-auto-1');
    });

    it('sends the managed trust boundary when the workspace is in cloud mode', async () => {
      useAppModeStore.setState({ mode: 'cloud' });
      useChatModelStore.getState().setModels([
        {
          id: 'fixture-managed-model',
          name: 'Fixture managed model',
          provider: 'managed_cloud',
          tier: 'standard',
          supportsThinking: false,
          supportsVision: false,
          supportsTools: false,
          contextWindow: 4096,
          isLocal: false,
          isByok: false,
        },
      ]);
      useChatModelStore.getState().selectModel('fixture-managed-model');
      mockInvoke.mockResolvedValueOnce({ goalId: 'goal-auto-cloud-1' });

      await useAgentTaskStore.getState().submitGoalAuto('Summarize cloud usage');

      expect(mockInvoke).toHaveBeenCalledWith('agi_submit_goal_auto', {
        request: expect.objectContaining({
          description: 'Summarize cloud usage',
          trustMode: 'managed',
          modelId: 'fixture-managed-model',
          provider: 'managed_cloud',
        }),
      });
    });
  });

  describe('cancelTask', () => {
    it('marks a task as cancelled on success', async () => {
      mockInvoke.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
        state: 'cancelled',
        currentIteration: 0,
        context: { tool_results: [] },
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

      const { tasks } = useAgentTaskStore.getState();
      const task = tasks.find((t) => t.id === 'test-task-2');
      expect(task).toBeDefined();
      expect(task!.status).toBe('running');

      expect(toast.error).toHaveBeenCalledWith('Failed to cancel task');
    });
  });

  describe('fetchTasks', () => {
    it('fails a persisted active task honestly when the native process no longer owns it', async () => {
      useAgentTaskStore.setState({
        tasks: [
          {
            id: 'goal-interrupted',
            goal: 'Apply repository changes',
            status: 'running',
            createdAt: '2026-08-13T00:00:00.000Z',
          },
        ],
      });
      mockInvoke
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce('AGI not initialized')
        .mockResolvedValueOnce(null);

      await useAgentTaskStore.getState().fetchTasks();

      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'agi_get_goal_status', {
        goalId: 'goal-interrupted',
      });
      expect(mockInvoke).toHaveBeenNthCalledWith(3, 'agi_get_task_state', {
        goalId: 'goal-interrupted',
      });
      expect(useAgentTaskStore.getState().tasks[0]).toEqual(
        expect.objectContaining({
          status: 'failed',
          completedAt: expect.any(String),
          error: expect.stringContaining('native execution state cannot be recovered'),
        }),
      );
    });

    it('recovers a state-only native task after a renderer reload', async () => {
      useAgentTaskStore.setState({
        tasks: [
          {
            id: 'goal-live-swarm',
            goal: 'Inspect in parallel',
            status: 'queued',
            createdAt: '2026-08-13T00:00:00.000Z',
            executionMode: 'swarm',
          },
        ],
      });
      mockInvoke
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce('Goal goal-live-swarm not found')
        .mockResolvedValueOnce('running');

      await useAgentTaskStore.getState().fetchTasks();

      expect(useAgentTaskStore.getState().tasks[0]).toEqual(
        expect.objectContaining({
          id: 'goal-live-swarm',
          status: 'running',
          executionMode: 'swarm',
        }),
      );
    });

    it('preserves locally recorded execution metadata for backend-known tasks', async () => {
      useAgentTaskStore.setState({
        tasks: [
          {
            id: 'goal-swarm',
            goal: 'Original goal',
            status: 'paused',
            createdAt: '2026-08-13T00:00:00.000Z',
            executionMode: 'swarm',
            pauseReason: 'Waiting for review',
            swarmMetrics: {
              succeeded: 3,
              failed: 1,
              wallTimeMs: 1_200,
              speedupRatio: 2.5,
              criticalPathLength: 2,
              maxParallelism: 4,
              summary: 'Three workers completed successfully.',
            },
          },
        ],
      });
      mockInvoke.mockResolvedValueOnce([
        {
          id: 'goal-swarm',
          description: 'Original goal',
          priority: 'medium',
          constraints: [],
          successCriteria: [],
        },
      ]);

      await useAgentTaskStore.getState().fetchTasks();

      expect(useAgentTaskStore.getState().tasks[0]).toEqual(
        expect.objectContaining({
          executionMode: 'swarm',
          pauseReason: 'Waiting for review',
          swarmMetrics: expect.objectContaining({ succeeded: 3, failed: 1 }),
        }),
      );
    });

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
        context: { tool_results: [] },
      });

      const { getTaskStatus } = useAgentTaskStore.getState();
      const result = await getTaskStatus('nonexistent-task');
      expect(result).toBeNull();
    });

    it('updates task status from backend response', async () => {
      mockInvoke.mockResolvedValueOnce({
        state: 'completed',
        currentIteration: 5,
        context: { tool_results: [{ result: 'Done!', error: null }] },
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
