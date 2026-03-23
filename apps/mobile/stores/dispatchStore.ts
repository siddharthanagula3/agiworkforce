import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';
import { useConnectionStore } from '@/stores/connectionStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DispatchMessageRole = 'user' | 'desktop';

export type TaskStatus = 'pending' | 'working' | 'completed' | 'failed';

/** A file or artifact produced by a completed desktop task */
export interface TaskResult {
  fileName?: string;
  location?: string;
  previewUrl?: string;
  summary?: string;
}

export interface DispatchMessage {
  id: string;
  role: DispatchMessageRole;
  text: string;
  timestamp: string;
  /** Only present on desktop messages that represent task updates */
  taskStatus?: TaskStatus;
  /** Detailed status text shown while working (e.g., "Searching contacts...") */
  statusDetail?: string;
  /** Result data attached to completed tasks */
  taskResult?: TaskResult;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface DispatchState {
  /** Persistent dispatch thread messages */
  messages: DispatchMessage[];

  /** Add a message to the thread */
  addMessage: (msg: DispatchMessage) => void;

  /** Update an existing message by ID (used for status transitions) */
  updateMessage: (id: string, patch: Partial<Omit<DispatchMessage, 'id'>>) => void;

  /** Send a dispatch task to the desktop via WebRTC */
  sendTask: (text: string) => void;

  /** Clear the entire dispatch thread */
  clearThread: () => void;
}

function generateMessageId(): string {
  return `dispatch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useDispatchStore = create<DispatchState>()(
  persist(
    (set) => ({
      messages: [],

      addMessage: (msg) =>
        set((state) => ({
          messages: [...state.messages, msg],
        })),

      updateMessage: (id, patch) =>
        set((state) => ({
          messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),

      sendTask: (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;

        const id = generateMessageId();
        const userMessage: DispatchMessage = {
          id,
          role: 'user',
          text: trimmed,
          timestamp: new Date().toISOString(),
        };

        // Add user message to thread
        set((state) => ({
          messages: [...state.messages, userMessage],
        }));

        // Send via WebRTC control channel
        const { sendControl, status, queueControl } = useConnectionStore.getState();
        const payload = {
          messageId: id,
          text: trimmed,
          sentAt: new Date().toISOString(),
        };

        try {
          if (status === 'connected') {
            sendControl('dispatch_task', payload);
          } else {
            // Queue for delivery when reconnected
            queueControl('dispatch_task', payload);
          }
        } catch {
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === id ? { ...m, taskStatus: 'failed' as TaskStatus } : m,
            ),
          }));
        }
      },

      clearThread: () => set({ messages: [] }),
    }),
    {
      name: 'dispatch-store',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        messages: state.messages.slice(-500),
      }),
    },
  ),
);
