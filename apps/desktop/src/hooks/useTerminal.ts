/**
 * useTerminal Hook
 *
 * A comprehensive hook for terminal operations that wraps Tauri backend commands
 * for creating sessions, sending input, managing history, and environment variables.
 */

import { useCallback, useEffect, useState } from 'react';
import { invoke, listen, type UnlistenFn } from '../lib/tauri-mock';
import type { ShellTypeLiteral, TerminalSession, ShellInfo } from '../stores/terminalStore';

// Types for terminal operations
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
  /** Auto-connect to output events when session is created */
  autoConnect?: boolean;
  /** Callback when output is received */
  onOutput?: (output: TerminalOutput) => void;
  /** Callback when session exits */
  onExit?: (sessionId: string) => void;
  /** Callback when error occurs */
  onError?: (error: Error) => void;
}

export interface UseTerminalReturn {
  // Session Management
  createSession: (shellType: ShellTypeLiteral, cwd?: string) => Promise<string>;
  closeSession: (sessionId: string) => Promise<void>;
  listSessions: () => Promise<TerminalSession[]>;

  // Input/Output
  sendInput: (sessionId: string, data: string) => Promise<void>;
  getOutput: (sessionId: string) => Promise<string>;
  resize: (sessionId: string, cols: number, rows: number) => Promise<void>;

  // History
  getHistory: (sessionId: string, limit?: number) => Promise<string[]>;
  searchHistory: (sessionId: string, query: string, limit?: number) => Promise<string[]>;
  clearHistory: (sessionId: string) => Promise<void>;

  // Environment Variables
  setEnv: (sessionId: string, key: string, value: string) => Promise<void>;
  getEnv: (sessionId: string, key: string) => Promise<string | null>;
  listEnv: (sessionId: string) => Promise<EnvironmentVariable[]>;
  unsetEnv: (sessionId: string, key: string) => Promise<void>;

  // Shell Detection
  detectShells: () => Promise<ShellInfo[]>;

  // State
  isLoading: boolean;
  error: Error | null;
  activeListeners: Map<string, UnlistenFn[]>;

  // Utilities
  connectToSession: (sessionId: string) => Promise<void>;
  disconnectFromSession: (sessionId: string) => void;
}

export function useTerminal(options: UseTerminalOptions = {}): UseTerminalReturn {
  const { autoConnect = true, onOutput, onExit, onError } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [activeListeners] = useState<Map<string, UnlistenFn[]>>(() => new Map());

  // Cleanup listeners on unmount
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
  }, [activeListeners]);

  const handleError = useCallback(
    (err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
      return error;
    },
    [onError],
  );

  // Connect to a session's output stream
  const connectToSession = useCallback(
    async (sessionId: string) => {
      // Remove existing listeners for this session
      const existingListeners = activeListeners.get(sessionId);
      if (existingListeners) {
        existingListeners.forEach((unlisten) => unlisten());
        activeListeners.delete(sessionId);
      }

      const outputEvent = `terminal-output-${sessionId}`;
      const exitEvent = `terminal-exit-${sessionId}`;

      // AUDIT-TERMINAL-031 fix: Handle both string and object payload formats
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
        // Cleanup listeners for this session
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

  // Disconnect from a session's output stream
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

  // Create a new terminal session
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

  // Close a terminal session
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

  // List all active terminal sessions
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

  // Send input to a terminal session
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

  // Get output from a terminal session
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

  // Resize terminal
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

  // Get command history
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

  // Search command history
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

  // Clear command history
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

  // Set environment variable
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

  // Get environment variable
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

  // List all environment variables
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

  // Unset environment variable
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

  // Detect available shells
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
    // Session Management
    createSession,
    closeSession,
    listSessions,

    // Input/Output
    sendInput,
    getOutput,
    resize,

    // History
    getHistory,
    searchHistory,
    clearHistory,

    // Environment Variables
    setEnv,
    getEnv,
    listEnv,
    unsetEnv,

    // Shell Detection
    detectShells,

    // State
    isLoading,
    error,
    activeListeners,

    // Utilities
    connectToSession,
    disconnectFromSession,
  };
}

export default useTerminal;
