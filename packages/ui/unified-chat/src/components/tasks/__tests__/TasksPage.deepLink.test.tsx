import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CloudAgentRun, ManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import { TasksPage } from '../TasksPage';

const LINKED_RUN_ID = '0190a000-0000-7000-8000-0000000000aa';

const linkedRun: CloudAgentRun = {
  id: LINKED_RUN_ID,
  userId: 'user-1',
  requestId: 'request-1',
  conversationId: 'conversation-1',
  originSurface: 'web',
  workMode: 'agiwork',
  state: 'completed',
  provider: 'openai',
  model: 'fixture-task-model',
  lastEventSequence: 0,
  cancellationRequestedAt: null,
  completedAt: '2026-07-30T12:00:10.000Z',
  createdAt: '2026-07-30T12:00:00.000Z',
  updatedAt: '2026-07-30T12:00:10.000Z',
};

function client(): ManagedCloudAgentRunClient {
  return {
    listRuns: vi.fn(async () => ({ runs: [], nextCursor: null })),
    getRun: vi.fn(async () => ({ run: linkedRun, events: [], nextAfterSequence: 0 })),
    cancelRun: vi.fn(),
    resolveApproval: vi.fn(),
    submitGuidance: vi.fn(),
  } as unknown as ManagedCloudAgentRunClient;
}

describe('TasksPage deep link', () => {
  it('opens the linked run even when the loaded list does not contain it', async () => {
    const runClient = client();
    render(
      <TasksPage
        transport={{
          client: runClient,
          openConversation: vi.fn(),
          conversationTitle: () => undefined,
          notifyError: vi.fn(),
          startWork: vi.fn(),
          rerunWork: vi.fn(),
        }}
        initialRunId={LINKED_RUN_ID}
      />,
    );

    await waitFor(() =>
      expect(runClient.getRun).toHaveBeenCalledWith(LINKED_RUN_ID, expect.anything()),
    );
  });

  it('selects nothing when no run is linked', async () => {
    const runClient = client();
    render(
      <TasksPage
        transport={{
          client: runClient,
          openConversation: vi.fn(),
          conversationTitle: () => undefined,
          notifyError: vi.fn(),
          startWork: vi.fn(),
          rerunWork: vi.fn(),
        }}
      />,
    );

    await waitFor(() => expect(runClient.listRuns).toHaveBeenCalled());
    expect(runClient.getRun).not.toHaveBeenCalled();
  });
});
