/**
 * useSessionPersistence Hook
 *
 * React hook for managing session persistence in chat store.
 * Handles loading, saving, and syncing session data with localStorage.
 *
 * Usage:
 * ```tsx
 * const { restoreSession, saveSession, isLoading } = useSessionPersistence();
 *
 * useEffect(() => {
 *   restoreSession();
 * }, []);
 * ```
 */

import { useCallback, useEffect, useState } from 'react';
import * as sessionStorage from '@/lib/session/sessionStorage';
import type { EnhancedMessage } from '@/stores/unified/chat/types';

/**
 * Persisted session data structure
 */
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

/**
 * useSessionPersistence hook configuration
 */
export interface UseSessionPersistenceOptions {
  /**
   * Auto-save interval in milliseconds (0 to disable)
   */
  autoSaveInterval?: number;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Return type for useSessionPersistence hook
 */
export interface UseSessionPersistenceReturn {
  /**
   * Restore the last active session from localStorage
   */
  restoreSession: () => PersistedSession | null;

  /**
   * Save a session to localStorage
   */
  saveSession: (session: PersistedSession) => void;

  /**
   * Delete a session from localStorage
   */
  deleteSession: (sessionId: string) => void;

  /**
   * Load a specific session by ID
   */
  loadSession: (sessionId: string) => PersistedSession | null;

  /**
   * Get all saved sessions (summary only)
   */
  getAllSessions: () => Array<{
    id: string;
    title: string;
    messageCount: number;
    updatedAt: Date;
  }>;

  /**
   * Clear all session data
   */
  clearAll: () => void;

  /**
   * Export all sessions as JSON string
   */
  exportSessions: () => string;

  /**
   * Import sessions from JSON string
   */
  importSessions: (jsonString: string) => boolean;

  /**
   * Check if data is being loaded
   */
  isLoading: boolean;

  /**
   * Any error that occurred during operations
   */
  error: Error | null;

  /**
   * Get storage size in bytes
   */
  getStorageSize: () => number;
}

/**
 * Hook for managing session persistence
 */
export function useSessionPersistence(
  options: UseSessionPersistenceOptions = {},
): UseSessionPersistenceReturn {
  const { autoSaveInterval = 0, debug = false } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Helper to log if debug enabled
  const log = useCallback(
    (message: string, data?: unknown) => {
      if (debug) {
        console.debug(`[useSessionPersistence] ${message}`, data);
      }
    },
    [debug],
  );

  // Restore the last active session
  const restoreSession = useCallback((): PersistedSession | null => {
    try {
      setIsLoading(true);
      setError(null);

      // Get current session ID
      const currentId = sessionStorage.loadCurrentSessionId();
      if (!currentId) {
        log('No current session ID saved');
        return null;
      }

      // Load session
      const stored = sessionStorage.loadSession(currentId);
      if (!stored) {
        log('Current session not found in storage', currentId);
        return null;
      }

      // Convert to PersistedSession
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

  // Save a session
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

  // Delete a session
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

  // Load specific session
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

  // Get all sessions summary
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

  // Clear all
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

  // Export
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

  // Import
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

  // Get storage size
  const getStorageSizeFn = useCallback(() => {
    try {
      return sessionStorage.getSessionStorageSize();
    } catch (err) {
      console.error('[useSessionPersistence] Error getting storage size:', err);
      return 0;
    }
  }, []);

  // Auto-save effect
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
