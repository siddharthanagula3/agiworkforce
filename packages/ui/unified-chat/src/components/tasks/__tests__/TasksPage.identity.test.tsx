import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CloudAgentRun, ManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import { TasksPage } from '../TasksPage';

const RUN_ID = '0190a000-0000-7000-8000-0000000000a1';
const SECOND_RUN_ID = '0190a000-0000-7000-8000-0000000000a2';

function makeRun(overrides: Partial<CloudAgentRun> = {}): CloudAgentRun {
  return {
    id: RUN_ID,
    userId: 'user-1',
    requestId: 'request-1',
    conversationId: 'conversation-1',
    originSurface: 'web',
    workMode: 'agiwork',
    state: 'ready_for_review',
    provider: 'openai',
    model: 'fixture-task-model',
    lastEventSequence: 0,
    cancellationRequestedAt: null,
    completedAt: null,
    createdAt: '2026-08-30T12:00:00.000Z',
    updatedAt: '2026-08-30T12:00:00.000Z',
    ...overrides,
  };
}

function client(runs: CloudAgentRun[], overrides: Partial<ManagedCloudAgentRunClient> = {}) {
  return {
    listRuns: vi.fn(async () => ({ runs, nextCursor: null })),
    getRun: vi.fn(async () => ({
      run: { ...runs[0]!, conversationTitle: undefined },
      events: [],
      nextAfterSequence: 0,
    })),
    cancelRun: vi.fn(async () => ({ ...runs[0]!, conversationTitle: undefined })),
    followRun: vi.fn(),
    ...overrides,
  } as unknown as ManagedCloudAgentRunClient;
}

function renderTasks(taskClient: ManagedCloudAgentRunClient) {
  render(
    <TasksPage
      transport={{ client: taskClient, openConversation: vi.fn(), notifyError: vi.fn() }}
    />,
  );
}

describe('Tasks run identity', () => {
  it('names a run after its conversation instead of its work mode', async () => {
    const runs = [makeRun({ conversationTitle: 'Orchard Calculator and CSV Generator' })];
    renderTasks(client(runs));

    expect(await screen.findByText('Orchard Calculator and CSV Generator')).toBeTruthy();
    expect(screen.getByText('AGI Work')).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'View details for Orchard Calculator and CSV Generator, Ready for review',
      }),
    ).toBeTruthy();
  });

  it('gives two runs distinct names and distinct accessible labels', async () => {
    const runs = [
      makeRun({ conversationTitle: 'Orchard Calculator' }),
      makeRun({
        id: SECOND_RUN_ID,
        conversationId: 'conversation-2',
        conversationTitle: 'Japan Travel Guide',
        state: 'completed',
      }),
    ];
    renderTasks(client(runs));

    await screen.findByText('Orchard Calculator');
    expect(screen.getByText('Japan Travel Guide')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'View details for Orchard Calculator, Ready for review' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'View details for Japan Travel Guide, Completed' }),
    ).toBeTruthy();
  });

  it('falls back to the work mode when the run has no conversation title', async () => {
    const runs = [makeRun({ conversationId: null })];
    renderTasks(client(runs));

    expect(
      await screen.findByRole('button', { name: 'View details for AGI Work, Ready for review' }),
    ).toBeTruthy();
  });

  it('keeps the name when the journal read returns a run without one', async () => {
    const runs = [makeRun({ conversationTitle: 'Orchard Calculator' })];
    renderTasks(client(runs));

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View details for Orchard Calculator, Ready for review',
      }),
    );

    // Opening the panel merges getRun's result back into the list. That
    // response carries no title, so a naive merge blanked the row.
    await waitFor(() => expect(screen.getByText('Orchard Calculator')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /^View details for AGI Work,/ })).toBeNull();
  });

  it('prefers the run’s own title over the host resolver', async () => {
    const runs = [makeRun({ conversationTitle: 'From the server' })];
    render(
      <TasksPage
        transport={{
          client: client(runs),
          openConversation: vi.fn(),
          notifyError: vi.fn(),
          conversationTitle: () => 'From the host',
        }}
      />,
    );

    expect(await screen.findByText('From the server')).toBeTruthy();
    expect(screen.queryByText('From the host')).toBeNull();
  });

  it('uses the host resolver when the run carries no title', async () => {
    const runs = [makeRun()];
    render(
      <TasksPage
        transport={{
          client: client(runs),
          openConversation: vi.fn(),
          notifyError: vi.fn(),
          conversationTitle: (id) => (id === 'conversation-1' ? 'From the host' : null),
        }}
      />,
    );

    expect(await screen.findByText('From the host')).toBeTruthy();
  });
});
