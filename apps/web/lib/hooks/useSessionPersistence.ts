
import { useCallback, useEffect, useState } from 'react';
import * as sessionStorage from '@/lib/session/sessionStorage';
import type { EnhancedMessage } from '@shared/stores/unified-chat-types';

export interface PersistedSession {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  messages: EnhancedMessage[];
  selectedModel?: string;
  selectedProvider?: string;
  createdAt: Date;
  updatedAt: Date;
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
    updatedAt: Date;
  }>;

  clearAll: () => void;

  exportSessions: () => string;

  importSessions: (jsonString: string) => boolean;

  isLoading: boolean;

  error: Error | null;

  getStorageSize: () => number;
}

export function useSessionPersistence(
  options: UseSessionPersistenceOptions = {},
): UseSessionPersistenceReturn {
  const { autoSaveInterval = 0, debug = false } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const log = useCallback(
    (message: string, data?: unknown) => {
      if (debug) {
        console.debug(`[useSessionPersistence] ${message}`, data);
      }
    },
    [debug],
  );

  const restoreSession = useCallback((): PersistedSession | null => {
    try {
      setIsLoading(true);
      setError(null);

      const currentId = sessionStorage.loadCurrentSessionId();
      if (!currentId) {
        log('No current session ID saved');
        return null;
      }

      const stored = sessionStorage.loadSession(currentId);
      if (!stored) {
        log('Current session not found in storage', currentId);
        return null;
      }

      const persisted: PersistedSession = {
        id: stored.id,
        title: stored.title,
        preview: stored.preview,
        messageCount: stored.messageCount,
        messages: stored.messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: typeof msg.timestamp === 'string' ? new Date(msg.timestamp) : msg.timestamp,
          metadata: msg.metadata,
        })),
        selectedModel: stored.selectedModel,
        selectedProvider: stored.selectedProvider,
        createdAt: new Date(stored.createdAt),
        updatedAt: new Date(stored.updatedAt),
      };

      log('Restored session', persisted.id);
      return persisted;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      log('Error restoring session', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [log]);

  const saveSessionFn = useCallback(
    (session: PersistedSession) => {
      try {
        setError(null);

        sessionStorage.saveSession({
          id: session.id,
          title: session.title,
          preview: session.preview,
          messageCount: session.messageCount,
          messages: session.messages,
          selectedModel: session.selectedModel,
          selectedProvider: session.selectedProvider,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        });

        sessionStorage.saveCurrentSessionId(session.id);

        if (session.selectedModel && session.selectedProvider) {
          sessionStorage.saveModelSelection({
            modelId: session.selectedModel,
            provider: session.selectedProvider,
          });
        }

        log('Saved session', session.id);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        log('Error saving session', error);
      }
    },
    [log],
  );

  const deleteSessionFn = useCallback(
    (sessionId: string) => {
      try {
        setError(null);
        sessionStorage.deleteSession(sessionId);
        log('Deleted session', sessionId);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        log('Error deleting session', error);
      }
    },
    [log],
  );

  const loadSessionFn = useCallback(
    (sessionId: string): PersistedSession | null => {
      try {
        setError(null);

        const stored = sessionStorage.loadSession(sessionId);
        if (!stored) {
          return null;
        }

        const persisted: PersistedSession = {
          id: stored.id,
          title: stored.title,
          preview: stored.preview,
          messageCount: stored.messageCount,
          messages: stored.messages.map((msg) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: typeof msg.timestamp === 'string' ? new Date(msg.timestamp) : msg.timestamp,
            metadata: msg.metadata,
          })),
          selectedModel: stored.selectedModel,
          selectedProvider: stored.selectedProvider,
          createdAt: new Date(stored.createdAt),
          updatedAt: new Date(stored.updatedAt),
        };

        log('Loaded session', sessionId);
        return persisted;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        log('Error loading session', error);
        return null;
      }
    },
    [log],
  );

  const getAllSessionsFn = useCallback(() => {
    try {
      setError(null);

      const all = sessionStorage.loadAllSessions();
      return all.map((session) => ({
        id: session.id,
        title: session.title,
        messageCount: session.messageCount,
        updatedAt: new Date(session.updatedAt),
      }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      log('Error getting all sessions', error);
      return [];
    }
  }, [log]);

  const clearAllFn = useCallback(() => {
    try {
      setError(null);
      sessionStorage.clearAllSessions();
      log('Cleared all sessions');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      log('Error clearing sessions', error);
    }
  }, [log]);

  const exportSessionsFn = useCallback(() => {
    try {
      setError(null);
      const exported = sessionStorage.exportSessions();
      log('Exported sessions');
      return exported;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      log('Error exporting sessions', error);
      return '';
    }
  }, [log]);

  const importSessionsFn = useCallback(
    (jsonString: string) => {
      try {
        setError(null);
        const success = sessionStorage.importSessions(jsonString);
        log('Imported sessions', success);
        return success;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        log('Error importing sessions', error);
        return false;
      }
    },
    [log],
  );

  const getStorageSizeFn = useCallback(() => {
    try {
      return sessionStorage.getSessionStorageSize();
    } catch (err) {
      console.error('[useSessionPersistence] Error getting storage size:', err);
      return 0;
    }
  }, []);

  useEffect(() => {
    if (!autoSaveInterval || autoSaveInterval <= 0) {
      return;
    }

    const interval = setInterval(() => {
      log('Auto-saving sessions');
      // Note: Actual auto-save would be triggered by store changes
      // This is just a structure placeholder
    }, autoSaveInterval);

    return () => clearInterval(interval);
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
