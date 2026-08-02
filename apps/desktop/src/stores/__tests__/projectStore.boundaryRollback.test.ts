import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const updateCloudConversation = vi.hoisted(() => vi.fn());

vi.mock('../../services/cloudChat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/cloudChat')>()),
  updateCloudConversation,
}));

import { useAppModeStore } from '../appModeStore';
import { useAuthStore } from '../auth';
import { useChatStore } from '../chat/chatStore';
import { useProjectStore, type Project } from '../projectStore';

function project(id: string, conversationIds: string[]): Project {
  return {
    id,
    name: id,
    description: '',
    customInstructions: '',
    files: [],
    conversationIds,
    conversationCount: conversationIds.length,
    isArchived: false,
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  };
}

function installAccount(id: string, epoch: number): void {
  useAuthStore.setState({
    isAuthenticated: true,
    isLocalDeviceAccount: false,
    accessToken: `token-${id}`,
    user: { id, email: `${id}@example.test`, name: id },
    cloudSessionEpoch: epoch,
  });
}

describe('projectStore Managed Cloud optimistic ownership', () => {
  beforeEach(() => {
    updateCloudConversation.mockReset();
    useAppModeStore.setState({ mode: 'cloud' });
    installAccount('account-a', 1);
    useProjectStore.setState({
      projects: [project('project-a', ['conversation-a']), project('project-target', [])],
      activeProjectId: null,
      error: null,
    });
    useChatStore.setState({
      conversations: [
        {
          id: 'conversation-a',
          title: 'A conversation',
          projectId: 'project-a',
        },
      ] as never,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never rolls account A snapshots back into B after the transport rejects stale work', async () => {
    let rejectMove: ((reason: Error) => void) | undefined;
    updateCloudConversation.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectMove = reject;
      }),
    );

    const pending = useProjectStore
      .getState()
      .moveConversationToProject('conversation-a', 'project-target');
    await vi.waitFor(() => expect(updateCloudConversation).toHaveBeenCalledOnce());

    installAccount('account-b', 2);
    useProjectStore.setState({ projects: [], activeProjectId: null, error: null });
    useChatStore.setState({ conversations: [] });
    rejectMove?.(
      new Error('The Managed Cloud account changed while this request was in progress.'),
    );

    await expect(pending).rejects.toThrow('account changed');
    expect(useProjectStore.getState().projects).toEqual([]);
    expect(useProjectStore.getState().error).toBeNull();
    expect(useChatStore.getState().conversations).toEqual([]);
  });
});
