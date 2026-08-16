import { useMemo } from 'react';
import { toast } from 'sonner';
import { TasksPage, type TasksTransport } from '@agiworkforce/unified-chat';
import { createDesktopCloudAgentRunClient } from '@/api/cloudApi';
import { selectHasCloudAccountSession, useAuthStore } from '@/stores/auth';

export interface DesktopTasksProps {
  onOpenConversation: (conversationId: string) => void;
  onStartChat?: () => void;
}

export function DesktopTasks({ onOpenConversation, onStartChat }: DesktopTasksProps) {
  const isSignedIn = useAuthStore(selectHasCloudAccountSession);

  const transport = useMemo<TasksTransport>(
    () => ({
      client: createDesktopCloudAgentRunClient(),
      openConversation: onOpenConversation,
      notifyError: (message) => toast.error(message),
      startWork: onStartChat,
    }),
    [onOpenConversation, onStartChat],
  );

  if (!isSignedIn) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 py-20 text-center">
        <p className="text-base font-semibold text-[var(--chat-text-primary)]">
          Sign in to see your tasks
        </p>
        <p className="mx-auto max-w-md text-sm text-[var(--chat-text-muted)]">
          Tasks are durable runs executed in AGI Cloud, so they continue with this app closed. Local
          sessions run on this device and are not listed here.
        </p>
      </div>
    );
  }

  return <TasksPage transport={transport} />;
}

export default DesktopTasks;
