import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const listRuns = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../services/cloud-tasks-client', () => ({
  createWebCloudTasksClient: () => ({ listRuns }),
}));

import { TasksPage } from './TasksPage';
import { useChatStore, PENDING_CONVERSATION_KEY } from '@shared/stores/web-chat-store';

describe('web TasksPage empty state', () => {
  beforeEach(() => {
    push.mockReset();
    listRuns.mockReset();
    listRuns.mockResolvedValue({ runs: [], nextCursor: null });
    useChatStore.getState().reset();
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
