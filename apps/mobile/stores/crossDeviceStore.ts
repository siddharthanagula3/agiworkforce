/**
 * Cross-Device Thread Store
 *
 * Manages persistent conversation threads that span desktop and mobile.
 * Threads persist across disconnections via AsyncStorage so users can
 * review completed or paused work even when the desktop is offline.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrossDeviceAttachment {
  type: string;
  name: string;
  url?: string;
}

export interface CrossDeviceMessage {
  id: string;
  threadId: string;
  deviceType: 'desktop' | 'mobile';
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: CrossDeviceAttachment[];
  timestamp: string;
}

export type ThreadStatus = 'active' | 'paused' | 'completed';

export interface CrossDeviceThread {
  id: string;
  title: string;
  deviceIds: string[];
  status: ThreadStatus;
  messages: CrossDeviceMessage[];
  lastMessageAt: string;
  createdAt: string;
  /** Unread message count — incremented when desktop sends messages and thread is not focused */
  unreadCount: number;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface CrossDeviceStore {
  threads: CrossDeviceThread[];
  activeThreadId: string | null;

  // Thread management
  createThread: (title: string) => string;
  addMessage: (threadId: string, message: Omit<CrossDeviceMessage, 'id' | 'timestamp'>) => void;
  setActiveThread: (id: string | null) => void;
  markThreadRead: (id: string) => void;

  // Sync
  syncFromDesktop: (threads: CrossDeviceThread[]) => void;
  markThreadCompleted: (id: string) => void;

  // Deletion
  deleteThread: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `cd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCrossDeviceStore = create<CrossDeviceStore>()(
  persist(
    (set, get) => ({
      threads: [],
      activeThreadId: null,

      createThread: (title: string) => {
        const id = generateId();
        const now = nowIso();
        const thread: CrossDeviceThread = {
          id,
          title,
          deviceIds: [],
          status: 'active',
          messages: [],
          lastMessageAt: now,
          createdAt: now,
          unreadCount: 0,
        };
        set((state) => ({ threads: [thread, ...state.threads] }));
        return id;
      },

      addMessage: (threadId, messageData) => {
        const message: CrossDeviceMessage = {
          ...messageData,
          id: generateId(),
          timestamp: nowIso(),
        };

        set((state) => {
          const activeId = state.activeThreadId;
          return {
            threads: state.threads.map((t) => {
              if (t.id !== threadId) return t;
              const isActive = activeId === threadId;
              return {
                ...t,
                messages: [...t.messages, message],
                lastMessageAt: message.timestamp,
                // Only bump unread if this thread is not currently focused
                unreadCount: isActive ? 0 : t.unreadCount + 1,
              };
            }),
          };
        });
      },

      setActiveThread: (id) => {
        set({ activeThreadId: id });
        // Clear unread when opening a thread
        if (id) {
          get().markThreadRead(id);
        }
      },

      markThreadRead: (id) => {
        set((state) => ({
          threads: state.threads.map((t) => (t.id === id ? { ...t, unreadCount: 0 } : t)),
        }));
      },

      syncFromDesktop: (incomingThreads) => {
        set((state) => {
          const existingMap = new Map(state.threads.map((t) => [t.id, t]));

          for (const incoming of incomingThreads) {
            const existing = existingMap.get(incoming.id);
            if (existing) {
              // Merge: keep local unread count, take desktop status/messages
              existingMap.set(incoming.id, {
                ...incoming,
                unreadCount: existing.unreadCount,
              });
            } else {
              existingMap.set(incoming.id, { ...incoming, unreadCount: 0 });
            }
          }

          // Sort descending by lastMessageAt
          const merged = Array.from(existingMap.values()).sort(
            (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
          );

          return { threads: merged };
        });
      },

      markThreadCompleted: (id) => {
        set((state) => ({
          threads: state.threads.map((t) => (t.id === id ? { ...t, status: 'completed' } : t)),
        }));
      },

      deleteThread: (id) => {
        set((state) => ({
          threads: state.threads.filter((t) => t.id !== id),
          activeThreadId: state.activeThreadId === id ? null : state.activeThreadId,
        }));
      },
    }),
    {
      name: 'cross-device-store',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        // Cap persisted data: keep newest 50 threads, 100 messages each
        threads: state.threads.slice(0, 50).map((t) => ({
          ...t,
          messages: t.messages.slice(-100),
        })),
        activeThreadId: state.activeThreadId,
      }),
    },
  ),
);
