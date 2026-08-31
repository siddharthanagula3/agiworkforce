'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TasksPage as SharedTasksPage, type TasksTransport } from '@agiworkforce/unified-chat';
import { useChatStore, PENDING_CONVERSATION_KEY } from '@shared/stores/web-chat-store';
import { createWebCloudTasksClient } from '../services/cloud-tasks-client';

export function TasksPage() {
  const router = useRouter();

  // Held apart from the transport so the memo below may rebuild freely: the
  // shared page keys its fetching on `transport.client`, so a stable client
  // means a new transport object never re-runs the run query.
  const client = useMemo(() => createWebCloudTasksClient(), []);

  // Subscribed, not read through getState(): the conversation list loads
  // independently of the run list, and a snapshot taken on first render leaves
  // every row stranded on its fallback title when conversations arrive second.
  const conversations = useChatStore((state) => state.conversations);

  const titleByConversationId = useMemo(() => {
    const map = new Map<string, string>();
    for (const conversation of conversations) map.set(conversation.id, conversation.title);
    return map;
  }, [conversations]);

  const transport = useMemo<TasksTransport>(
    () => ({
      client,
      openConversation: (conversationId) => router.push(`/chat/${conversationId}`),
      conversationTitle: (conversationId) => titleByConversationId.get(conversationId),
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
    [client, router, titleByConversationId],
  );

  return <SharedTasksPage transport={transport} />;
}
