import { create } from 'zustand';
import type { DispatchTaskLifecycleStatus, DispatchTaskStatusEvent } from '@agiworkforce/types';

export interface MobileDispatchTask {
  requestId: string;
  prompt: string;
  title: string;
  taskId?: string;
  status: DispatchTaskLifecycleStatus | 'sending';
  message?: string;
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface DispatchTaskState {
  tasks: MobileDispatchTask[];
  addOutgoingTask: (task: {
    requestId: string;
    prompt: string;
    title: string;
    sentAt: string;
  }) => void;
  applyStatus: (event: DispatchTaskStatusEvent) => void;
  markTransportFailure: (requestId: string, message: string, terminal?: boolean) => void;
  markAcknowledgementTimeout: (requestId: string) => void;
  clearFinished: () => void;
  reset: () => void;
}

const MAX_SESSION_TASKS = 25;
const TERMINAL_STATUSES = new Set<DispatchTaskLifecycleStatus>([
  'ready_for_review',
  'completed',
  'failed',
  'cancelled',
  'rejected',
]);

export const useDispatchTaskStore = create<DispatchTaskState>((set) => ({
  tasks: [],
  addOutgoingTask: (task) =>
    set((state) => ({
      tasks: [
        {
          requestId: task.requestId,
          prompt: task.prompt,
          title: task.title,
          status: 'sending' as const,
          createdAt: task.sentAt,
          updatedAt: task.sentAt,
        },
        ...state.tasks.filter((item) => item.requestId !== task.requestId),
      ].slice(0, MAX_SESSION_TASKS),
    })),
  applyStatus: (event) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.requestId === event.requestId
          ? {
              ...task,
              ...(event.taskId ? { taskId: event.taskId } : {}),
              status: event.status,
              message: event.message,
              result: event.result,
              error: event.error,
              updatedAt: event.updatedAt,
            }
          : task,
      ),
    })),
  markTransportFailure: (requestId, message, terminal = false) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.requestId === requestId
          ? {
              ...task,
              ...(terminal ? { status: 'failed' as const } : {}),
              error: message,
              updatedAt: new Date().toISOString(),
            }
          : task,
      ),
    })),
  markAcknowledgementTimeout: (requestId) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.requestId === requestId && task.status === 'sending'
          ? {
              ...task,
              status: 'failed' as const,
              error: 'Desktop did not acknowledge this task. Check Desktop before trying again.',
              updatedAt: new Date().toISOString(),
            }
          : task,
      ),
    })),
  clearFinished: () =>
    set((state) => ({
      tasks: state.tasks.filter(
        (task) =>
          task.status === 'sending' ||
          !TERMINAL_STATUSES.has(task.status as DispatchTaskLifecycleStatus),
      ),
    })),
  reset: () => set({ tasks: [] }),
}));
