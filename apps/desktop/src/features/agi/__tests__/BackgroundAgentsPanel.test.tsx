import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
      default:
        return undefined;
    }
  });
}

async function openBackgroundTab() {
  render(<AgentTaskPanel />);
  fireEvent.click(screen.getByRole('tab', { name: /Background/i }));
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

  it('counts tool calls for a chat-turn run, which has no fixed step count', async () => {
    stubBackend({
      ...AGENT,
      progress: {
        currentStep: 3,
        totalSteps: 0,
        currentStepDescription: 'Running read_file',
        percentage: 0,
        elapsedSecs: 5,
      },
    });
    await openBackgroundTab();

    expect(screen.getByText('Running read_file')).toBeInTheDocument();
    expect(screen.getByText('Tool call 3')).toBeInTheDocument();
    expect(screen.queryByText(/of 0/)).not.toBeInTheDocument();
  });

  function sentCommands() {
    return mockInvoke.mock.calls.map(([command]) => command);
  }

  it('pauses at once, since a paused run can be resumed', async () => {
    stubBackend();
    await openBackgroundTab();

    fireEvent.click(screen.getByRole('button', { name: /Pause/i }));

    await waitFor(() => expect(sentCommands()).toContain('background_agent_pause'));
  });

  it('asks before cancelling and says the run cannot be resumed', async () => {
    stubBackend();
    await openBackgroundTab();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    const question = await screen.findByRole('alertdialog');
    expect(within(question).getByText('Cancel this background run?')).toBeInTheDocument();
    expect(within(question).getByText(/cannot be resumed/)).toBeInTheDocument();
    expect(within(question).getByText(/Refactor the billing module/)).toBeInTheDocument();
    expect(sentCommands()).not.toContain('background_agent_cancel');

    fireEvent.click(within(question).getByRole('button', { name: 'Keep running' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(sentCommands()).not.toContain('background_agent_cancel');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel run' }),
    );
    await waitFor(() => expect(sentCommands()).toContain('background_agent_cancel'));
  });

  it('offers no control that only stops the run under another name', async () => {
    stubBackend();
    await openBackgroundTab();

    expect(screen.queryByRole('button', { name: /Take Over/i })).not.toBeInTheDocument();
  });

  it('says which boundary the run keeps its model calls inside', async () => {
    stubBackend({ ...AGENT, context: { ...AGENT.context, boundary: 'managed_cloud' } });
    await openBackgroundTab();

    expect(screen.getByTestId('background-agent-boundary')).toHaveTextContent('Model: AGI Cloud');
  });

  it('shows no boundary for a run stored before boundaries were recorded', async () => {
    stubBackend();
    await openBackgroundTab();

    expect(screen.queryByTestId('background-agent-boundary')).not.toBeInTheDocument();
  });

  it('shows what a finished run found, its steps and any plan change that was dropped', async () => {
    stubBackend({
      ...AGENT,
      status: 'completed',
      completedAt: '2026-08-15T00:05:00Z',
      summary: {
        description: 'Three invoices from Dana are unpaid; the March one is 40 days late.',
        filesChanged: [],
        actionsTaken: ['Read the ledger: 212 rows', 'Read the inbox: 3 unread'],
        warnings: ['The plan change the model asked for was not adopted: it added a command.'],
        goalAchieved: true,
      },
    });
    await openBackgroundTab();

    const result = screen.getByTestId('background-agent-result');
    expect(
      within(result).getByText(
        'Three invoices from Dana are unpaid; the March one is 40 days late.',
      ),
    ).toBeInTheDocument();
    expect(within(result).getByText('2 steps')).toBeInTheDocument();
    expect(within(result).getByText('Read the inbox: 3 unread')).toBeInTheDocument();
    expect(within(result).getByText(/was not adopted/)).toBeInTheDocument();
  });

  it('shows the whole reason a run failed', async () => {
    const reason =
      "Not run unattended: 'browser_navigate' needs your approval, and nobody was here to give it. Run it from chat, or save an 'Always allow' for this tool in Settings.";
    stubBackend({ ...AGENT, status: 'failed', error: reason });
    await openBackgroundTab();

    expect(
      within(screen.getByTestId('background-agent-result')).getByText(reason),
    ).toBeInTheDocument();
  });

  it('does not tell the person to type a prefix that does nothing', async () => {
    mockInvoke.mockImplementation(async (command: string) =>
      command === 'background_agent_list'
        ? { agents: [], activeCount: 0, maxAgents: 8 }
        : undefined,
    );
    render(<AgentTaskPanel />);
    fireEvent.click(screen.getByRole('tab', { name: /Background/i }));

    const empty = await screen.findByText(/No background agents yet/);
    expect(empty).not.toHaveTextContent('&');
    expect(empty).toHaveTextContent('automation trigger fires');
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
