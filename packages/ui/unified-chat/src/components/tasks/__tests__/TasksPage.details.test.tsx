import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CloudAgentRun, ManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { TasksPage, readTaskJournal } from '../TasksPage';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';

const run: CloudAgentRun = {
  id: RUN_ID,
  userId: 'user-1',
  requestId: 'request-1',
  conversationId: 'conversation-1',
  originSurface: 'web',
  workMode: 'agiwork',
  state: 'completed',
  provider: 'openai',
  model: 'gpt-5.6-sol',
  lastEventSequence: 2,
  cancellationRequestedAt: null,
  completedAt: '2026-07-30T12:00:10.000Z',
  createdAt: '2026-07-30T12:00:00.000Z',
  updatedAt: '2026-07-30T12:00:10.000Z',
};

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

const events: AgentEventEnvelope[] = [
  event(0, {
    type: 'progress-update',
    progressId: 'step-1',
    summary: 'Prepared the benchmark',
    status: 'completed',
  }),
  event(1, {
    type: 'artifact-produced',
    artifactId: 'asset-1',
    name: 'benchmark.csv',
    mimeType: 'text/csv',
    uri: '/api/files/asset-1',
    sizeBytes: 2048,
  }),
  event(2, {
    type: 'context-compacted',
    summary: 'Earlier project context was compacted',
    beforeTokens: 5000,
    afterTokens: 1200,
  }),
];

function client(overrides: Partial<ManagedCloudAgentRunClient> = {}): ManagedCloudAgentRunClient {
  return {
    listRuns: vi.fn(async () => ({ runs: [run], nextCursor: null })),
    getRun: vi.fn(async () => ({
      run,
      events,
      nextAfterSequence: 2,
    })),
    cancelRun: vi.fn(async () => run),
    followRun: vi.fn(),
    ...overrides,
  } as ManagedCloudAgentRunClient;
}

describe('Tasks task-detail panel', () => {
  it('loads durable progress, generated outputs, and the honest context boundary', async () => {
    const openConversation = vi.fn();
    const taskClient = client();

    render(
      <TasksPage
        transport={{
          client: taskClient,
          openConversation,
          notifyError: vi.fn(),
        }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'View details for AGI Work task' }));

    expect(await screen.findByText('Prepared the benchmark')).toBeTruthy();
    expect(screen.getByText('Outputs · 1')).toBeTruthy();
    expect(screen.getByText('benchmark.csv')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Download and open' }).getAttribute('href')).toBe(
      '/api/files/asset-1',
    );
    expect(screen.getByText('Earlier project context was compacted')).toBeTruthy();
    expect(screen.getByText(/does not copy input filenames or folder paths/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open source chat' }));
    expect(openConversation).toHaveBeenCalledWith('conversation-1');
  });

  it('reads paginated journals up to the run sequence without dropping events', async () => {
    const first = Array.from({ length: 500 }, (_, sequence) =>
      event(sequence, {
        type: 'progress-update',
        progressId: `step-${sequence}`,
        summary: `Step ${sequence}`,
        status: 'completed',
      }),
    );
    const last = event(500, {
      type: 'artifact-produced',
      artifactId: 'asset-last',
      name: 'result.txt',
      mimeType: 'text/plain',
      uri: '/api/files/asset-last',
    });
    const pagedRun = { ...run, lastEventSequence: 500 };
    const getRun = vi
      .fn()
      .mockResolvedValueOnce({ run: pagedRun, events: first, nextAfterSequence: 499 })
      .mockResolvedValueOnce({ run: pagedRun, events: [last], nextAfterSequence: 500 });

    const journal = await readTaskJournal(client({ getRun }), RUN_ID);

    expect(journal.events).toHaveLength(501);
    expect(journal.truncated).toBe(false);
    expect(getRun).toHaveBeenNthCalledWith(
      2,
      RUN_ID,
      expect.objectContaining({ afterSequence: 499, limit: 500 }),
    );
  });

  it('keeps the source-chat action explicit instead of navigating when a row is selected', async () => {
    const openConversation = vi.fn();
    render(
      <TasksPage
        transport={{
          client: client(),
          openConversation,
          notifyError: vi.fn(),
        }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'View details for AGI Work task' }));
    await waitFor(() => expect(screen.getByLabelText('Task details')).toBeTruthy());
    expect(openConversation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
    expect(openConversation).toHaveBeenCalledWith('conversation-1');
  });
});
