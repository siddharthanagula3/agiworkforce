import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const listRuns = vi.fn();
const getRun = vi.fn();
const search = { value: '' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(search.value),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../services/cloud-tasks-client', () => ({
  createWebCloudTasksClient: () => ({ listRuns, getRun }),
  setWebCloudTaskArchived: vi.fn(),
}));

import { TasksPage } from './TasksPage';
import { useChatStore, PENDING_CONVERSATION_KEY } from '@shared/stores/web-chat-store';

describe('web TasksPage empty state', () => {
  beforeEach(() => {
    push.mockReset();
    listRuns.mockReset();
    listRuns.mockResolvedValue({ runs: [], nextCursor: null });
    getRun.mockReset();
    search.value = '';
    useChatStore.getState().reset();
  });

  it('opens the run named by a push notification deep link', async () => {
    const RUN_ID = '0190a000-0000-7000-8000-00000000abcd';
    search.value = `run=${RUN_ID}`;
    getRun.mockResolvedValue({
      run: {
        id: RUN_ID,
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
      },
      events: [],
      nextAfterSequence: 0,
    });

    render(<TasksPage />);

    await waitFor(() => expect(getRun).toHaveBeenCalledWith(RUN_ID, expect.anything()));
  });

  it('offers a way forward when there are no tasks', async () => {
    render(<TasksPage />);

    const start = await screen.findByRole('button', { name: 'Start AGI Work' });
    await userEvent.click(start);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/chat'));
    expect(
      useChatStore.getState().composerTogglesByConversation[PENDING_CONVERSATION_KEY]?.workMode,
    ).toBe('agiwork');
  });
});
