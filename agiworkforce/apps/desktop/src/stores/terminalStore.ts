import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface TerminalSession {
  id: string;
  shellType: 'PowerShell' | 'Cmd' | 'Wsl' | 'GitBash';
  title: string;
  cwd?: string;
  active: boolean;
  createdAt: number;
}

export interface ShellInfo {
  name: string;
  path: string;
  available: boolean;
  shell_type: string;
}

interface TerminalState {
  // Session management
  sessions: TerminalSession[];
  activeSessionId: string | null;
  availableShells: ShellInfo[];

  // Event listeners
  listeners: Map<string, UnlistenFn>;

  // Actions
  loadAvailableShells: () => Promise<void>;
  createSession: (shellType: string, cwd?: string, title?: string) => Promise<string>;
  closeSession: (sessionId: string) => Promise<void>;
  setActiveSession: (sessionId: string) => void;
  sendInput: (sessionId: string, data: string) => Promise<void>;
  resizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>;
  getHistory: (sessionId: string, limit?: number) => Promise<string[]>;
  setupOutputListener: (sessionId: string, callback: (data: string) => void) => Promise<void>;
  removeOutputListener: (sessionId: string) => void;
  getSessionById: (sessionId: string) => TerminalSession | undefined;
}

export const useTerminalStore = create<TerminalState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      availableShells: [],
      listeners: new Map(),

      loadAvailableShells: async () => {
        try {
          const shells = await invoke<ShellInfo[]>('terminal_detect_shells');
          set({ availableShells: shells });
        } catch (error) {
          console.error('Failed to detect shells:', error);
          throw error;
        }
      },

      createSession: async (shellType: string, cwd?: string, title?: string) => {
        try {
          const sessionId = await invoke<string>('terminal_create_session', {
            shellType,
            cwd: cwd || undefined,
          });

          const newSession: TerminalSession = {
            id: sessionId,
            shellType: shellType as any,
            title: title || `${shellType} - ${sessionId.slice(0, 8)}`,
            cwd,
            active: true,
            createdAt: Date.now(),
          };

          set((state) => ({
            sessions: [...state.sessions, newSession],
            activeSessionId: sessionId,
          }));

          return sessionId;
        } catch (error) {
          console.error('Failed to create terminal session:', error);
          throw error;
        }
      },

      closeSession: async (sessionId: string) => {
        try {
          // Remove listener if exists
          get().removeOutputListener(sessionId);

          // Kill the terminal session
          await invoke('terminal_kill', { sessionId });

          set((state) => {
            const newSessions = state.sessions.filter((s) => s.id !== sessionId);
            let newActiveId = state.activeSessionId;

            // If closing the active session, switch to another one
            if (state.activeSessionId === sessionId) {
              newActiveId = newSessions.length > 0 ? newSessions[0].id : null;
            }

            return {
              sessions: newSessions,
              activeSessionId: newActiveId,
            };
          });
        } catch (error) {
          console.error('Failed to close terminal session:', error);
          throw error;
        }
      },

      setActiveSession: (sessionId: string) => {
        const state = get();
        const session = state.sessions.find((s) => s.id === sessionId);
        if (session) {
          set({ activeSessionId: sessionId });
        }
      },

      sendInput: async (sessionId: string, data: string) => {
        try {
          await invoke('terminal_send_input', { sessionId, data });
        } catch (error) {
          console.error('Failed to send input to terminal:', error);
          throw error;
        }
      },

      resizeTerminal: async (sessionId: string, cols: number, rows: number) => {
        try {
          await invoke('terminal_resize', { sessionId, cols, rows });
        } catch (error) {
          console.error('Failed to resize terminal:', error);
          throw error;
        }
      },

      getHistory: async (sessionId: string, limit: number = 50) => {
        try {
          const history = await invoke<string[]>('terminal_get_history', {
            sessionId,
            limit,
          });
          return history;
        } catch (error) {
          console.error('Failed to get terminal history:', error);
          throw error;
        }
      },

      setupOutputListener: async (sessionId: string, callback: (data: string) => void) => {
        const eventName = `terminal:output:${sessionId}`;

        // Remove existing listener if any
        get().removeOutputListener(sessionId);

        // Create new listener
        const unlisten = await listen<string>(eventName, (event) => {
          callback(event.payload);
        });

        set((state) => {
          const newListeners = new Map(state.listeners);
          newListeners.set(sessionId, unlisten);
          return { listeners: newListeners };
        });
      },

      removeOutputListener: (sessionId: string) => {
        const state = get();
        const unlisten = state.listeners.get(sessionId);

        if (unlisten) {
          unlisten();
          set((state) => {
            const newListeners = new Map(state.listeners);
            newListeners.delete(sessionId);
            return { listeners: newListeners };
          });
        }
      },

      getSessionById: (sessionId: string) => {
        const state = get();
        return state.sessions.find((s) => s.id === sessionId);
      },
    }),
    {
      name: 'terminal-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Don't persist listeners or sessions (they're runtime-only)
        // Only persist shell preferences if needed
        availableShells: state.availableShells,
      }),
    }
  )
);
