'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TasksPage as SharedTasksPage, type TasksTransport } from '@agiworkforce/unified-chat';
import { useChatStore, PENDING_CONVERSATION_KEY } from '@shared/stores/web-chat-store';
import { createWebCloudTasksClient } from '../services/cloud-tasks-client';

export function TasksPage() {
  const router = useRouter();

  const transport = useMemo<TasksTransport>(
    () => ({
      client: createWebCloudTasksClient(),
      openConversation: (conversationId) => router.push(`/chat/${conversationId}`),
      notifyError: (message) => toast.error(message),
      startWork: () => {
        const store = useChatStore.getState();
        store.setComposerToggles({ workMode: 'agiwork' }, PENDING_CONVERSATION_KEY);
        router.push('/chat');
      },
      rerunWork: (goal) => {
        const store = useChatStore.getState();
        store.setDraftContent(goal.goal, PENDING_CONVERSATION_KEY);
        store.setComposerToggles({ workMode: 'agiwork' }, PENDING_CONVERSATION_KEY);
        router.push('/chat');
        toast.success(
          'Loaded this task’s goal into a new AGI Work chat. Review and send to re-run.',
        );
      },
    }),
    [router],
  );

  return <SharedTasksPage transport={transport} />;
}
