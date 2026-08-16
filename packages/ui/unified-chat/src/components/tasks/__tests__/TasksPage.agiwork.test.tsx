import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CloudAgentRun, ManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { TasksPage } from '../TasksPage';

const RUN_ID = '0190a000-0000-7000-8000-0000000000bb';

function makeRun(overrides: Partial<CloudAgentRun> = {}): CloudAgentRun {
  return {
    id: RUN_ID,
    userId: 'user-1',
    requestId: 'request-1',
    conversationId: 'conversation-1',
    originSurface: 'web',
    workMode: 'agiwork',
    state: 'completed',
    provider: 'openai',
    model: 'fixture-task-model',
    lastEventSequence: 3,
    cancellationRequestedAt: null,
    completedAt: '2026-08-02T12:05:00.000Z',
    createdAt: '2026-08-02T12:00:00.000Z',
    updatedAt: '2026-08-02T12:05:00.000Z',
    ...overrides,
  };
}

function event(sequence: number, value: AgentEventEnvelope['event']): AgentEventEnvelope {
  return {
    schemaVersion: 3,
    sessionId: 'conversation-1',
    turnId: 'turn-1',
    sequence,
    emittedAtMs: 1_785_000_000_000 + sequence,
    event: value,
  };
}

const journal: AgentEventEnvelope[] = [
  event(0, {
    type: 'progress-update',
    progressId: 'agiwork:goal',
    summary: 'Build a competitor pricing table',
    detail: 'Constraints: public sources only\nDeliverable: a CSV',
    status: 'completed',
  }),
  event(1, {
    type: 'progress-update',
    progressId: 'agiwork:plan:agiwork-plan-1',
    summary: '1. Identify the competitors',
    status: 'completed',
  }),
  event(2, {
    type: 'progress-update',
    progressId: 'agiwork:plan:agiwork-plan-2',
    summary: '2. Collect published prices',
    status: 'completed',
  }),
  event(3, {
    type: 'progress-update',
    progressId: 'work-1',
    summary: 'Compiled the table',
    status: 'completed',
  }),
];

function client(overrides: Partial<ManagedCloudAgentRunClient> = {}): ManagedCloudAgentRunClient {
  const run = makeRun();
  return {
    listRuns: vi.fn(async () => ({ runs: [run], nextCursor: null })),
    getRun: vi.fn(async () => ({ run, events: journal, nextAfterSequence: 3 })),
    cancelRun: vi.fn(async () => run),
    followRun: vi.fn(),
    ...overrides,
  } as ManagedCloudAgentRunClient;
}

async function openDetails() {
  fireEvent.click(await screen.findByRole('button', { name: 'View details for AGI Work task' }));
}

describe('Tasks — AGI Work goal + plan', () => {
  it('renders the goal and its scope, and the committed plan, as their own sections', async () => {
    render(
      <TasksPage
        transport={{ client: client(), openConversation: vi.fn(), notifyError: vi.fn() }}
      />,
    );
    await openDetails();

    const goal = await screen.findByTestId('task-goal');
    expect(goal.textContent).toContain('Build a competitor pricing table');
    expect(goal.textContent).toContain('Deliverable: a CSV');

    const plan = screen.getByTestId('task-plan');
    expect(plan.textContent).toContain('Plan · 2');
    expect(plan.textContent).toContain('1. Identify the competitors');
    expect(plan.textContent).toContain('2. Collect published prices');

    expect(screen.getByText('Compiled the table')).toBeTruthy();
    expect(screen.getByText('Progress · 1')).toBeTruthy();
  });

  it('offers Re-run and re-sends the reconstructed goal through the host', async () => {
    const rerunWork = vi.fn();
    render(
      <TasksPage
        transport={{
          client: client(),
          openConversation: vi.fn(),
          notifyError: vi.fn(),
          rerunWork,
        }}
      />,
    );
    await openDetails();

    fireEvent.click(await screen.findByRole('button', { name: /Re-run this task/ }));
    expect(rerunWork).toHaveBeenCalledWith({
      goal: 'Build a competitor pricing table',
      constraints: 'public sources only',
      deliverable: 'a CSV',
    });
  });

  it('hides Re-run when the host cannot start a run', async () => {
    render(
      <TasksPage
        transport={{ client: client(), openConversation: vi.fn(), notifyError: vi.fn() }}
      />,
    );
    await openDetails();
    await screen.findByTestId('task-goal');
    expect(screen.queryByRole('button', { name: /Re-run this task/ })).toBeNull();
  });

  it('hides Re-run while the run is still live', async () => {
    const runningRun = makeRun({ state: 'running', completedAt: null });
    render(
      <TasksPage
        transport={{
          client: client({
            listRuns: vi.fn(async () => ({ runs: [runningRun], nextCursor: null })),
            getRun: vi.fn(async () => ({ run: runningRun, events: journal, nextAfterSequence: 3 })),
          }),
          openConversation: vi.fn(),
          notifyError: vi.fn(),
          rerunWork: vi.fn(),
        }}
      />,
    );
    await openDetails();
    await screen.findByTestId('task-goal');
    expect(screen.queryByRole('button', { name: /Re-run this task/ })).toBeNull();
  });
});
