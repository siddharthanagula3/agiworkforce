/**
 * useSessionPersistence Hook (Desktop)
 *
 * React hook for managing session persistence in chat store.
 * Handles loading, saving, and syncing session data with localStorage.
 *
 * Adapted from apps/web/lib/hooks/useSessionPersistence.ts for the desktop
 * app's chat types (MessageUI instead of EnhancedMessage).
 */

import { useCallback, useEffect, useState } from 'react';
import { safeGetJSON, safeSetJSON, safeRemoveItem } from '@/utils/localStorage';

// Storage keys
const SESSION_STORAGE_KEY = 'agi_desktop_sessions';
const CURRENT_SESSION_KEY = 'agi_desktop_current_session_id';
const MODEL_SELECTION_KEY = 'agi_desktop_selected_model';

/**
 * Persisted session data structure for the desktop app
 */
export interface PersistedSession {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  messages: StoredDesktopMessage[];
  selectedModel?: string;
  selectedProvider?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Serializable message format for localStorage
 */
interface StoredDesktopMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  model?: string;
  provider?: string;
  cost?: number;
  tokens?: number;
}

export interface UseSessionPersistenceOptions {
  autoSaveInterval?: number;
  debug?: boolean;
}

export interface UseSessionPersistenceReturn {
  restoreSession: () => PersistedSession | null;
  saveSession: (session: PersistedSession) => void;
  deleteSession: (sessionId: string) => void;
  loadSession: (sessionId: string) => PersistedSession | null;
  getAllSessions: () => Array<{
    id: string;
    title: string;
    messageCount: number;
    updatedAt: string;
  }>;
  clearAll: () => void;
  exportSessions: () => string;
  importSessions: (jsonString: string) => boolean;
  isLoading: boolean;
  error: Error | null;
  getStorageSize: () => number;
}

function loadAllSessions(): PersistedSession[] {
  try {
    const data = safeGetJSON<PersistedSession[]>(SESSION_STORAGE_KEY, []);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveAllSessions(sessions: PersistedSession[]): void {
  // Sort by updatedAt (newest first) and cap to 50 sessions to prevent unbounded growth
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const trimmed = sorted.slice(0, 50);
  safeSetJSON(SESSION_STORAGE_KEY, trimmed);
}

/**
 * Hook for managing session persistence in the desktop app
 */
export function useSessionPersistence(
  options: UseSessionPersistenceOptions = {},
): UseSessionPersistenceReturn {
  const { autoSaveInterval = 0 } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const log = useCallback((_message: string, _data?: unknown) => {
    // Debug logging removed for production
  }, []);

  const restoreSession = useCallback((): PersistedSession | null => {
    try {
      setIsLoading(true);
      setError(null);

      const currentId = safeGetJSON<string>(CURRENT_SESSION_KEY, '');
      if (!currentId) {
        log('No current session ID saved');
        return null;
      }

      const sessions = loadAllSessions();
      const stored = sessions.find((s) => s.id === currentId);
      if (!stored) {
        log('Current session not found in storage', currentId);
        return null;
      }

      log('Restored session', stored.id);
      return stored;
    } catch (err) {
      const sessionError = err instanceof Error ? err : new Error(String(err));
      setError(sessionError);
      log('Error restoring session', sessionError);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [log]);

  const saveSessionFn = useCallback(
    (session: PersistedSession) => {
      try {
        setError(null);

        const sessions = loadAllSessions();
        const existingIndex = sessions.findIndex((s) => s.id === session.id);

        const updated = [...sessions];
        if (existingIndex >= 0) {
          updated[existingIndex] = session;
        } else {
          updated.push(session);
        }

        saveAllSessions(updated);
        safeSetJSON(CURRENT_SESSION_KEY, session.id);

        if (session.selectedModel && session.selectedProvider) {
          safeSetJSON(MODEL_SELECTION_KEY, {
            modelId: session.selectedModel,
            provider: session.selectedProvider,
          });
        }

        log('Saved session', session.id);
      } catch (err) {
        const sessionError = err instanceof Error ? err : new Error(String(err));
        setError(sessionError);
        log('Error saving session', sessionError);
      }
    },
    [log],
  );

  const deleteSessionFn = useCallback(
    (sessionId: string) => {
      try {
        setError(null);
        const sessions = loadAllSessions();
        const filtered = sessions.filter((s) => s.id !== sessionId);
        saveAllSessions(filtered);

        const currentId = safeGetJSON<string>(CURRENT_SESSION_KEY, '');
        if (currentId === sessionId) {
          safeRemoveItem(CURRENT_SESSION_KEY);
        }

        log('Deleted session', sessionId);
      } catch (err) {
        const sessionError = err instanceof Error ? err : new Error(String(err));
        setError(sessionError);
        log('Error deleting session', sessionError);
      }
    },
    [log],
  );

  const loadSessionFn = useCallback(
    (sessionId: string): PersistedSession | null => {
      try {
        setError(null);
        const sessions = loadAllSessions();
        return sessions.find((s) => s.id === sessionId) ?? null;
      } catch (err) {
        const sessionError = err instanceof Error ? err : new Error(String(err));
        setError(sessionError);
        log('Error loading session', sessionError);
        return null;
      }
    },
    [log],
  );

  const getAllSessionsFn = useCallback(() => {
    try {
      setError(null);
      const all = loadAllSessions();
      return all.map((session) => ({
        id: session.id,
        title: session.title,
        messageCount: session.messageCount,
        updatedAt: session.updatedAt,
      }));
    } catch (err) {
      const sessionError = err instanceof Error ? err : new Error(String(err));
      setError(sessionError);
      log('Error getting all sessions', sessionError);
      return [];
    }
  }, [log]);

  const clearAllFn = useCallback(() => {
    try {
      setError(null);
      safeRemoveItem(SESSION_STORAGE_KEY);
      safeRemoveItem(CURRENT_SESSION_KEY);
      safeRemoveItem(MODEL_SELECTION_KEY);
      log('Cleared all sessions');
    } catch (err) {
      const sessionError = err instanceof Error ? err : new Error(String(err));
      setError(sessionError);
      log('Error clearing sessions', sessionError);
    }
  }, [log]);

  const exportSessionsFn = useCallback(() => {
    try {
      setError(null);
      const sessions = loadAllSessions();
      const currentId = safeGetJSON<string>(CURRENT_SESSION_KEY, '');
      const modelSelection = safeGetJSON<{ modelId: string; provider: string } | null>(
        MODEL_SELECTION_KEY,
        null,
      );

      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        sessions,
        currentId,
        modelSelection,
      };

      log('Exported sessions');
      return JSON.stringify(backup, null, 2);
    } catch (err) {
      const sessionError = err instanceof Error ? err : new Error(String(err));
      setError(sessionError);
      log('Error exporting sessions', sessionError);
      return '';
    }
  }, [log]);

  const importSessionsFn = useCallback(
    (jsonString: string) => {
      try {
        setError(null);
        const data = JSON.parse(jsonString) as {
          sessions?: PersistedSession[];
          currentId?: string;
          modelSelection?: { modelId: string; provider: string };
        };

        if (Array.isArray(data.sessions)) {
          saveAllSessions(data.sessions);
        }

        if (data.currentId) {
          safeSetJSON(CURRENT_SESSION_KEY, data.currentId);
        }

        if (data.modelSelection) {
          safeSetJSON(MODEL_SELECTION_KEY, data.modelSelection);
        }

        log('Imported sessions');
        return true;
      } catch (err) {
        const sessionError = err instanceof Error ? err : new Error(String(err));
        setError(sessionError);
        log('Error importing sessions', sessionError);
        return false;
      }
    },
    [log],
  );

  const getStorageSizeFn = useCallback(() => {
    try {
      const sessions = loadAllSessions();
      return JSON.stringify(sessions).length;
    } catch {
      return 0;
    }
  }, []);

  // Auto-save placeholder: the hook does not hold session state internally,
  // so auto-save must be driven by the consumer. This interval is reserved
  // for future use when session state tracking is integrated.
  useEffect(() => {
    if (!autoSaveInterval || autoSaveInterval <= 0) {
      return;
    }

    log('Auto-save interval configured but no session state available to auto-save');

    return undefined;
  }, [autoSaveInterval, log]);

  return {
    restoreSession,
    saveSession: saveSessionFn,
    deleteSession: deleteSessionFn,
    loadSession: loadSessionFn,
    getAllSessions: getAllSessionsFn,
    clearAll: clearAllFn,
    exportSessions: exportSessionsFn,
    importSessions: importSessionsFn,
    isLoading,
    error,
    getStorageSize: getStorageSizeFn,
  };
}
