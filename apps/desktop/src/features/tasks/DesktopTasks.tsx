/**
 * Desktop adapter for the shared Tasks surface.
 *
 * The view lives in `@agiworkforce/unified-chat` and is shared with web, so
 * both list Cloud agent runs from one implementation. Only the host parts are
 * here: the desktop run client (bearer token + guarded egress), opening a
 * conversation inside the shell rather than pushing a route, and toasts.
 *
 * Tasks are durable Managed Cloud runs, so this is a Cloud-only surface.
 */
import { useMemo } from 'react';
import { toast } from 'sonner';
import { TasksPage, type TasksTransport } from '@agiworkforce/unified-chat';
import { createDesktopCloudAgentRunClient } from '@/api/cloudApi';
import { selectHasCloudAccountSession, useAuthStore } from '@/stores/auth';

export interface DesktopTasksProps {
  /** Switch the shell to a conversation. Desktop has no router to push to. */
  onOpenConversation: (conversationId: string) => void;
  /** Start a new chat from the empty state — the shell owns conversation
   *  creation, so it supplies the action. */
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
