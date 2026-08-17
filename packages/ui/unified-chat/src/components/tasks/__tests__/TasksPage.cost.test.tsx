import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CloudAgentRun, ManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import { TasksPage } from '../TasksPage';

const RUN_ID = '0190a000-0000-7000-8000-000000000010';

const baseRun: CloudAgentRun = {
  id: RUN_ID,
  userId: 'user-1',
  requestId: 'request-1',
  conversationId: null,
  originSurface: 'web',
  workMode: 'agiwork',
  state: 'ready_for_review',
  provider: 'openai',
  model: 'fixture-task-model',
  lastEventSequence: -1,
  cancellationRequestedAt: null,
  completedAt: '2026-07-30T12:04:00.000Z',
  createdAt: '2026-07-30T12:00:00.000Z',
  updatedAt: '2026-07-30T12:04:00.000Z',
};

function client(run: CloudAgentRun): ManagedCloudAgentRunClient {
  return {
    listRuns: vi.fn(async () => ({ runs: [run], nextCursor: null })),
    getRun: vi.fn(async () => ({ run, events: [], nextAfterSequence: -1 })),
    cancelRun: vi.fn(async () => run),
    followRun: vi.fn(),
  } as unknown as ManagedCloudAgentRunClient;
}

function renderTasks(run: CloudAgentRun) {
  render(
    <TasksPage
      transport={{ client: client(run), openConversation: vi.fn(), notifyError: vi.fn() }}
    />,
  );
}

async function openDetails() {
  fireEvent.click(await screen.findByRole('button', { name: 'View details for AGI Work task' }));
}

describe('Tasks per-task cost and usage', () => {
  it('prices a settled autonomous run in the list and the detail panel', async () => {
    renderTasks({
      ...baseRun,
      usage: {
        providerCalls: 7,
        inputTokens: 128_400,
        outputTokens: 9_300,
        reasoningTokens: 2_100,
        costCents: 342,
        settledAt: '2026-07-30T12:04:00.000Z',
      },
    });

    expect((await screen.findByTestId(`task-cost-${RUN_ID}`)).textContent).toBe('$3.42');

    await openDetails();

    const panel = await screen.findByTestId('task-cost');
    expect(panel.textContent).toContain('$3.42');
    expect(panel.textContent).toContain('128.4K in');
    expect(panel.textContent).toContain('9.3K out');
    expect(panel.textContent).toContain('2.1K reasoning');
    expect(panel.textContent).toContain('7 model calls');
  });

  it('says the cost is still pending rather than showing a false zero on a live run', async () => {
    renderTasks({ ...baseRun, state: 'running' });

    await openDetails();

    const panel = await screen.findByTestId('task-cost');
    expect(panel.textContent).toContain('recorded when this task settles');
    expect(panel.textContent).not.toContain('$');
    expect(screen.queryByTestId(`task-cost-${RUN_ID}`)).toBeNull();
  });

  it('does not invent a charge for a run metered against the free trial', async () => {
    renderTasks({
      ...baseRun,
      usage: {
        providerCalls: 1,
        inputTokens: 500,
        outputTokens: 120,
        reasoningTokens: 0,
        costCents: null,
        settledAt: '2026-07-30T12:04:00.000Z',
      },
    });

    await openDetails();

    const panel = await screen.findByTestId('task-cost');
    expect(panel.textContent).toContain('free trial allowance');
    expect(panel.textContent).not.toContain('$');
    expect(panel.textContent).toContain('500 in');
    expect(screen.queryByTestId(`task-cost-${RUN_ID}`)).toBeNull();
  });
});
