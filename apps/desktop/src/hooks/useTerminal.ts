
import { useCallback, useEffect, useState } from 'react';
import { invoke, listen, type UnlistenFn } from '../lib/tauri-mock';
import type { ShellTypeLiteral, TerminalSession, ShellInfo } from '../stores/terminalStore';

export interface TerminalOutput {
  sessionId: string;
  data: string;
  timestamp: number;
}

export interface TerminalHistoryEntry {
  command: string;
  timestamp: number;
  exitCode?: number;
}

export interface EnvironmentVariable {
  key: string;
  value: string;
}

export interface UseTerminalOptions {
  autoConnect?: boolean;
  onOutput?: (output: TerminalOutput) => void;
  onExit?: (sessionId: string) => void;
  onError?: (error: Error) => void;
}

export interface UseTerminalReturn {
  createSession: (shellType: ShellTypeLiteral, cwd?: string) => Promise<string>;
  closeSession: (sessionId: string) => Promise<void>;
  listSessions: () => Promise<TerminalSession[]>;

  sendInput: (sessionId: string, data: string) => Promise<void>;
  getOutput: (sessionId: string) => Promise<string>;
  resize: (sessionId: string, cols: number, rows: number) => Promise<void>;

  getHistory: (sessionId: string, limit?: number) => Promise<string[]>;
  searchHistory: (sessionId: string, query: string, limit?: number) => Promise<string[]>;
  clearHistory: (sessionId: string) => Promise<void>;

  setEnv: (sessionId: string, key: string, value: string) => Promise<void>;
  getEnv: (sessionId: string, key: string) => Promise<string | null>;
  listEnv: (sessionId: string) => Promise<EnvironmentVariable[]>;
  unsetEnv: (sessionId: string, key: string) => Promise<void>;

  detectShells: () => Promise<ShellInfo[]>;

  isLoading: boolean;
  error: Error | null;
  activeListeners: Map<string, UnlistenFn[]>;

  connectToSession: (sessionId: string) => Promise<void>;
  disconnectFromSession: (sessionId: string) => void;
}

export function useTerminal(options: UseTerminalOptions = {}): UseTerminalReturn {
  const { autoConnect = true, onOutput, onExit, onError } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [activeListeners] = useState<Map<string, UnlistenFn[]>>(() => new Map());

  useEffect(() => {
    return () => {
      activeListeners.forEach((unlisteners) => {
        unlisteners.forEach((unlisten) => {
          try {
            unlisten();
          } catch (e) {
            console.warn('Failed to cleanup terminal listener:', e);
          }
        });
      });
      activeListeners.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleError = useCallback(
    (err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
      return error;
    },
    [onError],
  );

  const connectToSession = useCallback(
    async (sessionId: string) => {
      const existingListeners = activeListeners.get(sessionId);
      if (existingListeners) {
        existingListeners.forEach((unlisten) => unlisten());
        activeListeners.delete(sessionId);
      }

      const outputEvent = `terminal-output-${sessionId}`;
      const exitEvent = `terminal-exit-${sessionId}`;

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
          onOutput?.({
            sessionId,
            data,
            timestamp: Date.now(),
          });
        },
      );

      const exitUnlisten = await listen(exitEvent, () => {
        const listeners = activeListeners.get(sessionId);
        if (listeners) {
          listeners.forEach((unlisten) => unlisten());
          activeListeners.delete(sessionId);
        }
        onExit?.(sessionId);
      });

      activeListeners.set(sessionId, [outputUnlisten, exitUnlisten]);
    },
    [activeListeners, onOutput, onExit],
  );

  const disconnectFromSession = useCallback(
    (sessionId: string) => {
      const listeners = activeListeners.get(sessionId);
      if (listeners) {
        listeners.forEach((unlisten) => unlisten());
        activeListeners.delete(sessionId);
      }
    },
    [activeListeners],
  );

  const createSession = useCallback(
    async (shellType: ShellTypeLiteral, cwd?: string): Promise<string> => {
      setIsLoading(true);
      setError(null);

      try {
        const sessionId = await invoke<string>('terminal_create_session', {
          shellType,
          cwd: cwd || undefined,
        });

        if (autoConnect) {
          await connectToSession(sessionId);
        }

        return sessionId;
      } catch (err) {
        throw handleError(err);
      } finally {
        setIsLoading(false);
      }
    },
    [autoConnect, connectToSession, handleError],
  );

  const closeSession = useCallback(
    async (sessionId: string): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        disconnectFromSession(sessionId);
        await invoke('terminal_kill', { sessionId });
      } catch (err) {
        throw handleError(err);
      } finally {
        setIsLoading(false);
      }
    },
    [disconnectFromSession, handleError],
  );

  const listSessions = useCallback(async (): Promise<TerminalSession[]> => {
    setIsLoading(true);
    setError(null);

    try {
      const sessionIds = await invoke<string[]>('terminal_list_sessions');
      return sessionIds.map((id) => ({
        id,
        shellType: 'default',
        title: `Terminal ${id.slice(0, 8)}`,
        active: true,
        createdAt: Date.now(),
      }));
    } catch (err) {
      throw handleError(err);
    } finally {
      setIsLoading(false);
    }
  }, [handleError]);

  const sendInput = useCallback(
    async (sessionId: string, data: string): Promise<void> => {
      setError(null);

      try {
        await invoke('terminal_send_input', { sessionId, data });
      } catch (err) {
        throw handleError(err);
      }
    },
    [handleError],
  );

  const getOutput = useCallback(
    async (sessionId: string): Promise<string> => {
      setError(null);

      try {
        const history = await invoke<string[]>('terminal_get_history', {
          sessionId,
          limit: 1,
        });
        return history.join('\n');
      } catch (err) {
        throw handleError(err);
      }
    },
    [handleError],
  );

  const resize = useCallback(
    async (sessionId: string, cols: number, rows: number): Promise<void> => {
      setError(null);

      try {
        await invoke('terminal_resize', { sessionId, cols, rows });
      } catch (err) {
        throw handleError(err);
      }
    },
    [handleError],
  );

  const getHistory = useCallback(
    async (sessionId: string, limit: number = 100): Promise<string[]> => {
      setError(null);

      try {
        const history = await invoke<string[]>('terminal_get_history', {
          sessionId,
          limit,
        });
        return history;
      } catch (err) {
        throw handleError(err);
      }
    },
    [handleError],
  );

  const searchHistory = useCallback(
    async (sessionId: string, query: string, limit: number = 50): Promise<string[]> => {
      setError(null);

      try {
        const history = await invoke<string[]>('terminal_get_history', {
          sessionId,
          limit: Math.max(limit * 2, 100),
        });
        const normalizedQuery = query.trim().toLowerCase();
        const results = history
          .filter((entry) => entry.toLowerCase().includes(normalizedQuery))
          .slice(0, limit);
        return results;
      } catch (err) {
        throw handleError(err);
      }
    },
    [handleError],
  );

  const clearHistory = useCallback(
    async (sessionId: string): Promise<void> => {
      setError(null);
      try {
        await invoke('terminal_clear_history', { sessionId });
      } catch (err) {
        throw handleError(err);
      }
    },
    [handleError],
  );

  const setEnv = useCallback(
    async (sessionId: string, key: string, value: string): Promise<void> => {
      setError(null);
      try {
        await invoke('terminal_set_env', { sessionId, key, value });
      } catch (err) {
        throw handleError(err);
      }
    },
    [handleError],
  );

  const getEnv = useCallback(
    async (sessionId: string, key: string): Promise<string | null> => {
      setError(null);
      try {
        return await invoke<string | null>('terminal_get_env', { sessionId, key });
      } catch (err) {
        throw handleError(err);
      }
    },
    [handleError],
  );

  const listEnv = useCallback(
    async (sessionId: string): Promise<EnvironmentVariable[]> => {
      setError(null);
      try {
        const envVars = await invoke<[string, string][]>('terminal_list_env', {
          sessionId,
        });
        return envVars.map(([key, value]) => ({ key, value }));
      } catch (err) {
        throw handleError(err);
      }
    },
    [handleError],
  );

  const unsetEnv = useCallback(
    async (sessionId: string, key: string): Promise<void> => {
      setError(null);
      try {
        await invoke('terminal_unset_env', { sessionId, key });
      } catch (err) {
        throw handleError(err);
      }
    },
    [handleError],
  );

  const detectShells = useCallback(async (): Promise<ShellInfo[]> => {
    setIsLoading(true);
    setError(null);

    try {
      const shells = await invoke<ShellInfo[]>('terminal_detect_shells');
      return shells;
    } catch (err) {
      throw handleError(err);
    } finally {
      setIsLoading(false);
    }
  }, [handleError]);

  return {
    createSession,
    closeSession,
    listSessions,

    sendInput,
    getOutput,
    resize,

    getHistory,
    searchHistory,
    clearHistory,

    setEnv,
    getEnv,
    listEnv,
    unsetEnv,

    detectShells,

    isLoading,
    error,
    activeListeners,

    connectToSession,
    disconnectFromSession,
  };
}

export default useTerminal;
