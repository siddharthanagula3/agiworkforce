import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureAgiInitialized, getAgiTaskModelEligibility } = vi.hoisted(() => ({
  ensureAgiInitialized: vi.fn().mockResolvedValue(undefined),
  getAgiTaskModelEligibility: vi.fn((): { eligible: boolean; reason?: string } => ({
    eligible: true,
  })),
}));

vi.mock('@/api/agi', () => ({
  ensureAgiInitialized,
}));

vi.mock('@/lib/modelCapabilityGates', () => ({
  getAgiTaskModelEligibility,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { AgentTaskCreator, resolveTaskAutomationState } from '@/features/agi/AgentTaskCreator';
import { invoke } from '@/lib/tauri-mock';
import { MAX_PARALLEL_AGENTS, useAgentTaskStore } from '@/stores/agentTaskStore';
import { useAppModeStore } from '@/stores/appModeStore';
import { useChatModelStore } from '@agiworkforce/unified-chat';

const mockInvoke = vi.mocked(invoke);

// Short enough to stay under the swarm-recommendation debounce threshold, so a
// launch is the only command the component sends.
const GOAL = 'Ship the report';

function describeGoal() {
  fireEvent.change(screen.getByLabelText(/What do you want the AI to accomplish/i), {
    target: { value: GOAL },
  });
}

function launch() {
  fireEvent.click(screen.getByRole('button', { name: /Launch Task/i }));
}

describe('AgentTaskCreator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAgiInitialized.mockResolvedValue(undefined);
    getAgiTaskModelEligibility.mockReturnValue({ eligible: true });
    useAgentTaskStore.setState({ tasks: [], loading: false });
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

  it('sends the parallel slider as an agent count, not as an iteration ceiling', async () => {
    mockInvoke.mockResolvedValueOnce({
      goalId: 'goal-parallel-1',
      state: 'ready_for_review',
      output: 'Done',
      error: null,
    });

    render(<AgentTaskCreator />);
    describeGoal();
    fireEvent.click(screen.getByRole('button', { name: /Parallel/ }));

    const agents = screen.getByLabelText(/Parallel agents/i);
    fireEvent.change(agents, { target: { value: '6' } });
    launch();

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('agi_submit_goal_parallel', {
        request: {
          description: GOAL,
          priority: 'medium',
          numAgents: 6,
          trustMode: 'local',
          modelId: 'fixture-local-model',
          provider: 'ollama',
        },
      });
    });
  });

  it('cannot request more concurrent agents than the engine will run', () => {
    render(<AgentTaskCreator />);
    fireEvent.click(screen.getByRole('button', { name: /Parallel/ }));

    const agents = screen.getByLabelText(/Parallel agents/i);
    expect(agents).toHaveAttribute('max', String(MAX_PARALLEL_AGENTS));
    expect(agents).toHaveAttribute('min', '1');
  });

  it('sends the sequential slider as the goal iteration limit', async () => {
    mockInvoke.mockResolvedValueOnce({ goalId: 'goal-sequential-1' });

    render(<AgentTaskCreator />);
    describeGoal();
    fireEvent.click(screen.getByRole('button', { name: /Sequential/ }));

    fireEvent.change(screen.getByLabelText(/Max iterations/i), { target: { value: '15' } });
    launch();

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('agi_submit_goal', {
        request: {
          description: GOAL,
          priority: 'medium',
          maxSteps: 15,
          trustMode: 'local',
          modelId: 'fixture-local-model',
          provider: 'ollama',
        },
      });
    });
  });

  it('offers an agent count only in parallel mode and iterations only in sequential mode', () => {
    render(<AgentTaskCreator />);

    fireEvent.click(screen.getByRole('button', { name: /Sequential/ }));
    expect(screen.queryByLabelText(/Parallel agents/i)).toBeNull();
    expect(screen.getByLabelText(/Max iterations/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Parallel/ }));
    expect(screen.queryByLabelText(/Max iterations/i)).toBeNull();
    expect(screen.getByLabelText(/Parallel agents/i)).toBeTruthy();
  });

  it('does not treat an in-session macOS permission grant as a ready automation service', () => {
    expect(
      resolveTaskAutomationState({
        accessibility: true,
        automation_service_ready: false,
      }),
    ).toBe('restart-required');
    expect(
      resolveTaskAutomationState({
        accessibility: true,
        automation_service_ready: true,
      }),
    ).toBe('ready');
  });

  it('keeps an unverified function-tool model available for chat but blocks Tasks', () => {
    getAgiTaskModelEligibility.mockReturnValue({
      eligible: false,
      reason:
        'Fixture local model supports function tools, but it is not verified for Tasks. Project chat still works.',
    });

    render(<AgentTaskCreator />);
    describeGoal();

    expect(screen.getByTestId('agent-task-model-gate')).toHaveTextContent(
      'available for chat, not Tasks',
    );
    expect(screen.getByRole('button', { name: /Launch Task/i })).toBeDisabled();
    expect(mockInvoke).not.toHaveBeenCalledWith('agi_submit_goal', expect.anything());
  });
});
