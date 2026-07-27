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
import { createWebCloudTasksClient } from '../services/cloud-tasks-client';

export function TasksPage() {
  const router = useRouter();

  const transport = useMemo<TasksTransport>(
    () => ({
      client: createWebCloudTasksClient(),
      openConversation: (conversationId) => router.push(`/chat/${conversationId}`),
      notifyError: (message) => toast.error(message),
    }),
    [router],
  );

  return <SharedTasksPage transport={transport} />;
}
