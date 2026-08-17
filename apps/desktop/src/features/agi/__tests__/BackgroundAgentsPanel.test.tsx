import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { AgentTaskPanel } from '@/features/agi/AgentTaskPanel';
import { invoke } from '@/lib/tauri-mock';
import {
  applyBackgroundAgentEvent,
  useBackgroundAgentStore,
  type BackgroundAgent,
} from '@/stores/backgroundAgentStore';

const mockInvoke = vi.mocked(invoke);

const AGENT: BackgroundAgent = {
  id: 'agent-1',
  conversationId: 'conv-1',
  goal: 'Refactor the billing module',
  status: 'running',
  progress: {
    currentStep: 1,
    totalSteps: 4,
    currentStepDescription: 'Reading billing service',
    percentage: 25,
    elapsedSecs: 12,
  },
  summary: null,
  error: null,
  createdAt: '2026-08-15T00:00:00Z',
  startedAt: '2026-08-15T00:00:01Z',
  completedAt: null,
  context: {
    workingDirectory: null,
    environment: {},
    conversationSnapshot: [],
    activeMcpServers: [],
    customInstructions: null,
  },
  priority: 5,
  timeoutSecs: 86400,
};

function stubBackend(agent: BackgroundAgent = AGENT) {
  mockInvoke.mockImplementation(async (command: string) => {
    switch (command) {
      case 'background_agent_list':
        return { agents: [agent], activeCount: 1, maxAgents: 8 };
      case 'background_agent_get':
        return agent;
      case 'background_agent_take_over':
        return { agent: { ...agent, status: 'taken_over' }, context: agent.context };
      default:
        return undefined;
    }
  });
}

async function openBackgroundTab() {
  render(<AgentTaskPanel />);
  fireEvent.click(screen.getByRole('button', { name: /Background/i }));
  await screen.findByText('Refactor the billing module');
}

describe('Background Agents panel', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    useBackgroundAgentStore.getState().reset();
  });

  it('is reachable from the agent task panel and lists agents with live progress', async () => {
    stubBackend();
    await openBackgroundTab();

    expect(screen.getByText('Reading billing service')).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();
    expect(screen.getByText(/1\/8 active/)).toBeInTheDocument();
  });

  it('sends pause, cancel and take-over through to the backend commands', async () => {
    stubBackend();
    await openBackgroundTab();

    fireEvent.click(screen.getByRole('button', { name: /Pause/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    fireEvent.click(screen.getByRole('button', { name: /Take Over/i }));

    await waitFor(() => {
      const commands = mockInvoke.mock.calls.map(([command]) => command);
      expect(commands).toContain('background_agent_pause');
      expect(commands).toContain('background_agent_cancel');
      expect(commands).toContain('background_agent_take_over');
    });
  });

  it('offers Resume once a paused event arrives', async () => {
    stubBackend();
    await openBackgroundTab();

    mockInvoke.mockResolvedValue(undefined);
    applyBackgroundAgentEvent('background_agent:paused', { agentId: 'agent-1' });

    const resume = await screen.findByRole('button', { name: /Resume/i });
    fireEvent.click(resume);

    await waitFor(() => {
      expect(mockInvoke.mock.calls.map(([command]) => command)).toContain(
        'background_agent_resume',
      );
    });
  });
});
