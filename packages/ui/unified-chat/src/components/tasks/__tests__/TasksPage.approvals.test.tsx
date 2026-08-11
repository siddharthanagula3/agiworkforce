import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudAgentRun, ManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import { TasksPage } from '../TasksPage';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';

const awaitingRun: CloudAgentRun = {
  id: RUN_ID,
  userId: 'user-1',
  requestId: 'request-1',
  conversationId: 'conversation-1',
  originSurface: 'desktop',
  workMode: 'agiwork',
  state: 'awaiting_input',
  provider: 'anthropic',
  model: 'fixture-task-model',
  lastEventSequence: 12,
  cancellationRequestedAt: null,
  completedAt: null,
  createdAt: '2026-07-30T12:00:00.000Z',
  updatedAt: '2026-07-30T12:00:10.000Z',
  pendingApproval: {
    requestedAt: '2026-07-30T12:00:09.000Z',
    toolCalls: [
      {
        toolCallId: 'call-1',
        name: 'mcp__github__create_issue',
        argsPreview: '{"repo":"agiworkforce/app","title":"Ship durable sessions"}',
      },
      { toolCallId: 'call-2', name: 'fs_write', argsPreview: '{"path":"./notes.md"}' },
    ],
  },
};

function client(overrides: Partial<ManagedCloudAgentRunClient> = {}): ManagedCloudAgentRunClient {
  return {
    listRuns: vi.fn(async () => ({ runs: [awaitingRun], nextCursor: null })),
    getRun: vi.fn(async () => ({ run: awaitingRun, events: [], nextAfterSequence: 12 })),
    cancelRun: vi.fn(async () => awaitingRun),
    resumeRun: vi.fn(async () => undefined),
    followRun: vi.fn(),
    ...overrides,
  } as ManagedCloudAgentRunClient;
}

function renderTasks(taskClient: ManagedCloudAgentRunClient, notifyError = vi.fn()) {
  render(<TasksPage transport={{ client: taskClient, openConversation: vi.fn(), notifyError }} />);
  return { notifyError };
}

describe('Tasks pending-approval inbox', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows what the run is asking permission to do without opening the chat', async () => {
    renderTasks(client());

    expect(await screen.findByText('Waiting for your approval')).toBeTruthy();
    expect(screen.getByText('mcp__github__create_issue')).toBeTruthy();
    expect(
      screen.getByText('{"repo":"agiworkforce/app","title":"Ship durable sessions"}'),
    ).toBeTruthy();
  });

  it('applies one decision to every pending call, because the server rejects a partial answer', async () => {
    const resumeRun = vi.fn(async () => undefined);
    renderTasks(client({ resumeRun }));

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(resumeRun).toHaveBeenCalledWith(RUN_ID, [
        { toolCallId: 'call-1', decision: 'approved' },
        { toolCallId: 'call-2', decision: 'approved' },
      ]),
    );
  });

  it('sends a denial as an explicit rejection rather than silence', async () => {
    const resumeRun = vi.fn(async () => undefined);
    renderTasks(client({ resumeRun }));

    fireEvent.click(await screen.findByRole('button', { name: 'Deny' }));

    await waitFor(() =>
      expect(resumeRun).toHaveBeenCalledWith(RUN_ID, [
        { toolCallId: 'call-1', decision: 'rejected' },
        { toolCallId: 'call-2', decision: 'rejected' },
      ]),
    );
  });

  it('re-reads the list after a decision so the card reflects the run that is now running', async () => {
    const listRuns = vi
      .fn()
      .mockResolvedValueOnce({ runs: [awaitingRun], nextCursor: null })
      .mockResolvedValue({
        runs: [{ ...awaitingRun, state: 'running' as const, pendingApproval: undefined }],
        nextCursor: null,
      });
    renderTasks(client({ listRuns }));

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(listRuns).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Waiting for your approval')).toBeNull());
  });

  it('explains a race with another device instead of reporting a generic failure', async () => {
    const conflict = Object.assign(new Error('This approval is already being resumed.'), {
      name: 'ManagedCloudAgentRunAlreadyResumingError',
    });
    const { notifyError } = renderTasks(
      client({ resumeRun: vi.fn(async () => Promise.reject(conflict)) }),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith('Another device already answered this approval.'),
    );
  });

  it('says an approval expired rather than implying the decision can be retried', async () => {
    const expired = Object.assign(new Error('This approval request expired.'), {
      name: 'ManagedCloudAgentRunApprovalExpiredError',
    });
    const { notifyError } = renderTasks(
      client({ resumeRun: vi.fn(async () => Promise.reject(expired)) }),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Deny' }));

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith(
        'This approval expired and the task can no longer continue from it.',
      ),
    );
  });

  it('offers no approval affordance for a run that is not blocked on one', async () => {
    renderTasks(
      client({
        listRuns: vi.fn(async () => ({
          runs: [{ ...awaitingRun, state: 'running' as const, pendingApproval: undefined }],
          nextCursor: null,
        })),
      }),
    );

    await screen.findByText('Unavailable model');
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });
});
