import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureAgiInitialized } = vi.hoisted(() => ({
  ensureAgiInitialized: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/api/agi', () => ({
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

import { AgentTaskCreator } from '@/features/agi/AgentTaskCreator';
import { invoke } from '@/lib/tauri-mock';
import { MAX_PARALLEL_AGENTS, useAgentTaskStore } from '@/stores/agentTaskStore';
import { useAppModeStore } from '@/stores/appModeStore';

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
    useAgentTaskStore.setState({ tasks: [], loading: false });
    useAppModeStore.setState({ mode: 'local' });
  });

  it('sends the parallel slider as an agent count, not as an iteration ceiling', async () => {
    mockInvoke.mockResolvedValueOnce({
      goalId: 'goal-parallel-1',
      bestResult: { score: 0.9, result: { success: true, error: null } },
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
});
