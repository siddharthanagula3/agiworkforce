import { create } from 'zustand';
import { createJSONStorage, devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { invoke, listen, type UnlistenFn } from '../lib/tauri-mock';

export interface TerminalSession {
  id: string;
  shellType: 'powershell' | 'cmd' | 'wsl' | 'gitbash' | 'zsh' | 'bash' | 'fish' | 'sh' | 'default';
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
  sessions: TerminalSession[];
  activeSessionId: string | null;
  availableShells: ShellInfo[];

  listeners: Map<string, UnlistenFn[]>;

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
  reset: () => void;

  aiSuggestCommand: (intent: string, shellType: ShellTypeLiteral, cwd?: string) => Promise<string>;
  smartCommit: (sessionId: string) => Promise<string>;
  aiSuggestImprovements: (command: string, shellType: ShellTypeLiteral) => Promise<string | null>;

  clearHistory: (sessionId: string) => Promise<void>;
}

export const useTerminalStore = create<TerminalState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        sessions: [],
        activeSessionId: null,
        availableShells: [],
        listeners: new Map(),

        loadAvailableShells: async () => {
          try {
            const shells = await invoke<ShellInfo[]>('terminal_detect_shells');
            set({ availableShells: shells }, undefined, 'terminal/loadAvailableShells');
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

            set(
              (state) => {
                const newSessions = [...state.sessions, newSession];
                if (newSessions.length > 20) {
                  const oldestInactive = newSessions.find((s) => s.id !== sessionId && !s.active);
                  if (oldestInactive) {
                    return {
                      sessions: newSessions.filter((s) => s.id !== oldestInactive.id),
                      activeSessionId: sessionId,
                    };
                  }
                  return {
                    sessions: newSessions.slice(-20),
                    activeSessionId: sessionId,
                  };
                }
                return {
                  sessions: newSessions,
                  activeSessionId: sessionId,
                };
              },
              undefined,
              'terminal/createSession',
            );

            return sessionId;
          } catch (error) {
            console.error('Failed to create terminal session:', error);
            throw error;
          }
        },

        closeSession: async (sessionId: string) => {
          try {
            get().removeOutputListener(sessionId);

            await invoke('terminal_kill', { sessionId });

            set(
              (state) => {
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
              },
              undefined,
              'terminal/closeSession',
            );
          } catch (error) {
            console.error('Failed to close terminal session:', error);
            throw error;
          }
        },

        setActiveSession: (sessionId: string) => {
          const state = get();
          const session = state.sessions.find((s) => s.id === sessionId);
          if (session) {
            set({ activeSessionId: sessionId }, undefined, 'terminal/setActiveSession');
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

          get().removeOutputListener(sessionId);

          const outputUnlisten = await listen<string | { stream: string; data: string }>(
            outputEvent,
            (event) => {
              let data: string;
              if (typeof event.payload === 'string') {
                data = event.payload;
              } else if (
                event.payload &&
                typeof event.payload === 'object' &&
                'data' in event.payload
              ) {
                data = event.payload.data;
              } else {
                data = String(event.payload);
              }
              callback(data);
            },
          );

          const exitUnlisten = await listen(exitEvent, () => {
            get().removeOutputListener(sessionId);

            set(
              (state) => {
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
              },
              undefined,
              'terminal/sessionExited',
            );

            onExit?.();
          });

          set(
            (state) => {
              const newListeners = new Map(state.listeners);
              newListeners.set(sessionId, [outputUnlisten, exitUnlisten]);
              return { listeners: newListeners };
            },
            undefined,
            'terminal/setupOutputListener',
          );
        },

        removeOutputListener: (sessionId: string) => {
          let unlisteners: UnlistenFn[] | undefined;

          set(
            (state) => {
              unlisteners = state.listeners.get(sessionId);
              if (!unlisteners || unlisteners.length === 0) {
                return state;
              }
              const newListeners = new Map(state.listeners);
              newListeners.delete(sessionId);
              return { listeners: newListeners };
            },
            undefined,
            'terminal/removeOutputListener',
          );

          if (unlisteners && unlisteners.length > 0) {
            unlisteners.forEach((fn) => {
              try {
                fn();
              } catch (error) {
                console.warn('Failed to remove terminal listener', error);
              }
            });
          }
        },

        reset: () => {
          const currentListeners = get().listeners;
          currentListeners.forEach((unlisteners) => {
            unlisteners.forEach((fn) => {
              try {
                fn();
              } catch (error) {
                console.warn('Failed to remove terminal listener during reset', error);
              }
            });
          });

          set(
            {
              sessions: [],
              activeSessionId: null,
              availableShells: [],
              listeners: new Map(),
            },
            undefined,
            'terminal/reset',
          );
        },

        aiSuggestCommand: async (intent: string, shellType: ShellTypeLiteral, cwd?: string) => {
          try {
            const command = await invoke<string>('terminal_ai_suggest_command', {
              intent,
              shellType,
              cwd,
            });
            return command;
          } catch (error) {
            console.error('Failed to get AI command suggestion:', error);
            throw error;
          }
        },

        smartCommit: async (sessionId: string) => {
          try {
            const result = await invoke<string>('terminal_smart_commit', {
              sessionId,
            });
            return result;
          } catch (error) {
            console.error('Smart commit failed:', error);
            throw error;
          }
        },

        aiSuggestImprovements: async (command: string, shellType: ShellTypeLiteral) => {
          try {
            const suggestions = await invoke<string | null>('terminal_ai_suggest_improvements', {
              command,
              shellType,
            });
            return suggestions;
          } catch (error) {
            console.error('Failed to get AI command improvements:', error);
            throw error;
          }
        },

        clearHistory: async (sessionId: string) => {
          try {
            await invoke('terminal_clear_history', { sessionId });
          } catch (error) {
            console.error('Failed to clear terminal history:', error);
            throw error;
          }
        },
      })),
      {
        name: 'terminal-storage',
        version: 1,
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          availableShells: state.availableShells,
        }),
        migrate: (persistedState: unknown, _version: number) => {
          return persistedState as TerminalState;
        },
      },
    ),
    { name: 'TerminalStore', enabled: import.meta.env.DEV },
  ),
);
