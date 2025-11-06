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

export type ShellTypeLiteral = TerminalSession['shellType'];

export interface ShellInfo {
  name: string;
  path: string;
  available: boolean;
  shell_type: ShellTypeLiteral;
}

interface TerminalState {
  // Session management
  sessions: TerminalSession[];
  activeSessionId: string | null;
  availableShells: ShellInfo[];

  // Event listeners
  listeners: Map<string, UnlistenFn[]>;

  // Actions
  loadAvailableShells: () => Promise<void>;
  createSession: (shellType: ShellTypeLiteral, cwd?: string, title?: string) => Promise<string>;
  closeSession: (sessionId: string) => Promise<void>;
  setActiveSession: (sessionId: string) => void;
  sendInput: (sessionId: string, data: string) => Promise<void>;
  resizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>;
  getHistory: (sessionId: string, limit?: number) => Promise<string[]>;
  setupOutputListener: (
    sessionId: string,
    callback: (data: string) => void,
    onExit?: () => void,
  ) => Promise<void>;
  removeOutputListener: (sessionId: string) => void;
  getSessionById: (sessionId: string) => TerminalSession | undefined;
  reset: () => void;
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

      createSession: async (shellType: ShellTypeLiteral, cwd?: string, title?: string) => {
        try {
          const sessionId = await invoke<string>('terminal_create_session', {
            shellType,
            cwd: cwd || undefined,
          });

          const newSession: TerminalSession = {
            id: sessionId,
            shellType,
            title: title || `${shellType} - ${sessionId.slice(0, 8)}`,
            ...(cwd ? { cwd } : {}),
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
              const nextSession = newSessions[0];
              newActiveId = nextSession ? nextSession.id : null;
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

      setupOutputListener: async (
        sessionId: string,
        callback: (data: string) => void,
        onExit?: () => void,
      ) => {
        const outputEvent = `terminal-output-${sessionId}`;
        const exitEvent = `terminal-exit-${sessionId}`;

        // Remove existing listener if any
        get().removeOutputListener(sessionId);

        // Create new listener
        const outputUnlisten = await listen<string>(outputEvent, (event) => {
          callback(event.payload);
        });

        const exitUnlisten = await listen(exitEvent, () => {
          get().removeOutputListener(sessionId);

          set((state) => {
            const newSessions = state.sessions.filter((s) => s.id !== sessionId);
            let newActiveId = state.activeSessionId;
            if (state.activeSessionId === sessionId) {
              const nextSession = newSessions[0];
              newActiveId = nextSession ? nextSession.id : null;
            }
            return {
              sessions: newSessions,
              activeSessionId: newActiveId,
            };
          });

          onExit?.();
        });

        set((state) => {
          const newListeners = new Map(state.listeners);
          newListeners.set(sessionId, [outputUnlisten, exitUnlisten]);
          return { listeners: newListeners };
        });
      },

      removeOutputListener: (sessionId: string) => {
        const state = get();
        const unlisteners = state.listeners.get(sessionId);

        if (!unlisteners || unlisteners.length === 0) {
          return;
        }

        unlisteners.forEach((fn) => {
          try {
            fn();
          } catch (error) {
            console.warn('Failed to remove terminal listener', error);
          }
        });

        set((state) => {
          if (!state.listeners.has(sessionId)) {
            return state;
          }
          const newListeners = new Map(state.listeners);
          newListeners.delete(sessionId);
          return { listeners: newListeners };
        });
      },

      getSessionById: (sessionId: string) => {
        const state = get();
        return state.sessions.find((s) => s.id === sessionId);
      },

      reset: () => {
        set({
          sessions: [],
          activeSessionId: null,
          availableShells: [],
          listeners: new Map(),
        });
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
    },
  ),
);
