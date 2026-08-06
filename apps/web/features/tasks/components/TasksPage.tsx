'use client';

/**
 * Web adapter for the shared Tasks surface.
 *
 * The view lives in `@agiworkforce/unified-chat` so Desktop shows the same
 * Tasks list rather than a second implementation. Only the host-specific parts
 * are here: the authenticated run client (Clerk token + CSRF on mutations),
 * Next.js routing to a conversation, and toast notifications.
 */

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
      // CAP-048 gap-4: re-run an AGI Work task from its original goal. This opens
      // a FRESH new-chat surface pre-loaded with the objective and switched into
      // AGI Work mode; sending from there goes through the normal billed path and
      // mints its own idempotency key, so it is a new run, never a replay of the
      // old reservation. The optional scope fields the run used are shown in the
      // task detail for the user to re-add — the durable journal records them as
      // free text, not as separately restorable inputs (deferred refinement).
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
