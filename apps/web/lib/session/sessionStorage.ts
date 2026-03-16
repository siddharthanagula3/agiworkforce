/**
 * Session Storage
 *
 * Handles persistent storage of chat sessions, messages, and user preferences
 * to localStorage. Enables app state recovery on reload.
 *
 * Features:
 * - Save/load chat history (messages, metadata)
 * - Persist current model selection
 * - Persist sidebar and theme preferences
 * - Session versioning for safe migrations
 * - Encryption support for sensitive data (future)
 */

import { safeGetJSON, safeSetJSON } from '@/utils/localStorage';
import type { EnhancedMessage } from '@/stores/unified/chat/types';
import type { StoredChatSession, StoredMessage, SessionStorageMetadata } from '@agiworkforce/types';

// Session storage schema version for migrations
const SESSION_STORAGE_VERSION = 1;

// Re-export for backward compatibility
export type { StoredChatSession, StoredMessage, SessionStorageMetadata };

// Storage keys
const SESSION_STORAGE_KEY = 'agi_chat_sessions';
const SESSION_METADATA_KEY = 'agi_chat_sessions_metadata';
const CURRENT_SESSION_KEY = 'agi_current_session_id';
const MODEL_SELECTION_KEY = 'agi_selected_model';
const SIDEBAR_STATE_KEY = 'agi_sidebar_collapsed';
const THEME_PREFERENCE_KEY = 'agi_theme_preference'; // May already exist

/**
 * Convert an EnhancedMessage to StoredMessage for serialization
 */
function messageToStored(msg: EnhancedMessage): StoredMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp,
    metadata: msg.metadata,
  };
}

/**
 * Convert a StoredMessage back to EnhancedMessage
 */
function storedToMessage(stored: StoredMessage): EnhancedMessage {
  return {
    id: stored.id,
    role: stored.role,
    content: stored.content,
    timestamp: typeof stored.timestamp === 'string' ? new Date(stored.timestamp) : stored.timestamp,
    metadata: stored.metadata,
  };
}

/**
 * Save a chat session to localStorage
 *
 * @param session - Session with messages, metadata, model selection
 */
export function saveSession(session: {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  messages: EnhancedMessage[];
  selectedModel?: string;
  selectedProvider?: string;
}): void {
  try {
    // Load existing sessions
    const sessions = loadAllSessions();

    // Find or create entry
    const existingIndex = sessions.findIndex((s) => s.id === session.id);
    const stored: StoredChatSession = {
      id: session.id,
      title: session.title,
      preview: session.preview,
      messageCount: session.messageCount,
      createdAt:
        session.createdAt instanceof Date ? session.createdAt.toISOString() : session.createdAt,
      updatedAt:
        session.updatedAt instanceof Date ? session.updatedAt.toISOString() : session.updatedAt,
      messages: session.messages.map(messageToStored),
      selectedModel: session.selectedModel,
      selectedProvider: session.selectedProvider,
    };

    if (existingIndex >= 0) {
      sessions[existingIndex] = stored;
    } else {
      sessions.push(stored);
    }

    // Cap session history to prevent unbounded growth (keep last 50)
    const trimmedSessions = sessions.slice(Math.max(0, sessions.length - 50));

    safeSetJSON(SESSION_STORAGE_KEY, trimmedSessions);

    // Update metadata
    updateSessionMetadata();
  } catch (error) {
    console.error('[SessionStorage] Failed to save session:', error);
  }
}

/**
 * Load a single session by ID with all messages
 */
export function loadSession(sessionId: string): StoredChatSession | null {
  try {
    const sessions = loadAllSessions();
    return sessions.find((s) => s.id === sessionId) ?? null;
  } catch (error) {
    console.error('[SessionStorage] Failed to load session:', error);
    return null;
  }
}

/**
 * Load all sessions from localStorage
 */
export function loadAllSessions(): StoredChatSession[] {
  try {
    const data = safeGetJSON<StoredChatSession[]>(SESSION_STORAGE_KEY, []);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('[SessionStorage] Failed to load sessions:', error);
    return [];
  }
}

/**
 * Delete a session by ID
 */
export function deleteSession(sessionId: string): void {
  try {
    let sessions = loadAllSessions();
    sessions = sessions.filter((s) => s.id !== sessionId);
    safeSetJSON(SESSION_STORAGE_KEY, sessions);

    // Clear current session if it was deleted
    const currentId = loadCurrentSessionId();
    if (currentId === sessionId) {
      clearCurrentSessionId();
    }

    updateSessionMetadata();
  } catch (error) {
    console.error('[SessionStorage] Failed to delete session:', error);
  }
}

/**
 * Clear all session history
 */
export function clearAllSessions(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(SESSION_METADATA_KEY);
    localStorage.removeItem(CURRENT_SESSION_KEY);
    // Don't call updateSessionMetadata() as we want to clear metadata too
  } catch (error) {
    console.error('[SessionStorage] Failed to clear sessions:', error);
  }
}

/**
 * Save the ID of the current active session
 */
export function saveCurrentSessionId(sessionId: string): void {
  try {
    safeSetJSON(CURRENT_SESSION_KEY, sessionId);
  } catch (error) {
    console.error('[SessionStorage] Failed to save current session ID:', error);
  }
}

/**
 * Load the ID of the current active session
 */
export function loadCurrentSessionId(): string | null {
  try {
    const id = safeGetJSON<string>(CURRENT_SESSION_KEY, '');
    return typeof id === 'string' && id ? id : null;
  } catch (error) {
    console.error('[SessionStorage] Failed to load current session ID:', error);
    return null;
  }
}

/**
 * Clear the current session ID
 */
export function clearCurrentSessionId(): void {
  try {
    localStorage.removeItem(CURRENT_SESSION_KEY);
  } catch (error) {
    console.error('[SessionStorage] Failed to clear current session ID:', error);
  }
}

/**
 * Save model selection (provider + model ID)
 */
export function saveModelSelection(model: { modelId: string; provider: string }): void {
  try {
    safeSetJSON(MODEL_SELECTION_KEY, model);
  } catch (error) {
    console.error('[SessionStorage] Failed to save model selection:', error);
  }
}

/**
 * Load model selection
 */
export function loadModelSelection(): { modelId: string; provider: string } | null {
  try {
    const data = safeGetJSON<{ modelId: string; provider: string }>(MODEL_SELECTION_KEY, {
      modelId: '',
      provider: '',
    });
    return data && data.modelId ? data : null;
  } catch (error) {
    console.error('[SessionStorage] Failed to load model selection:', error);
    return null;
  }
}

/**
 * Save sidebar collapsed state
 */
export function saveSidebarState(collapsed: boolean): void {
  try {
    safeSetJSON(SIDEBAR_STATE_KEY, collapsed);
  } catch (error) {
    console.error('[SessionStorage] Failed to save sidebar state:', error);
  }
}

/**
 * Load sidebar collapsed state
 */
export function loadSidebarState(): boolean | null {
  try {
    const data = safeGetJSON<boolean>(SIDEBAR_STATE_KEY, false);
    return typeof data === 'boolean' ? data : null;
  } catch (error) {
    console.error('[SessionStorage] Failed to load sidebar state:', error);
    return null;
  }
}

/**
 * Save theme preference (light, dark, system)
 */
export function saveThemePreference(theme: 'light' | 'dark' | 'system'): void {
  try {
    safeSetJSON(THEME_PREFERENCE_KEY, theme);
  } catch (error) {
    console.error('[SessionStorage] Failed to save theme preference:', error);
  }
}

/**
 * Load theme preference
 */
export function loadThemePreference(): 'light' | 'dark' | 'system' | null {
  try {
    const data = safeGetJSON<string>(THEME_PREFERENCE_KEY, '');
    if (data === 'light' || data === 'dark' || data === 'system') {
      return data;
    }
    return null;
  } catch (error) {
    console.error('[SessionStorage] Failed to load theme preference:', error);
    return null;
  }
}

/**
 * Update session storage metadata (version, last sync time)
 */
function updateSessionMetadata(): void {
  try {
    const metadata: SessionStorageMetadata = {
      version: SESSION_STORAGE_VERSION,
      lastSyncTime: new Date().toISOString(),
    };
    safeSetJSON(SESSION_METADATA_KEY, metadata);
  } catch (error) {
    console.error('[SessionStorage] Failed to update metadata:', error);
  }
}

/**
 * Get session storage metadata
 */
export function getSessionMetadata(): SessionStorageMetadata | null {
  try {
    const data = safeGetJSON<SessionStorageMetadata>(SESSION_METADATA_KEY, {
      version: 0,
      lastSyncTime: '',
    });
    return data && data.version ? data : null;
  } catch (error) {
    console.error('[SessionStorage] Failed to get metadata:', error);
    return null;
  }
}

/**
 * Calculate total size of session data (for debugging/monitoring)
 */
export function getSessionStorageSize(): number {
  try {
    const sessions = loadAllSessions();
    const currentId = loadCurrentSessionId();
    const modelSelection = loadModelSelection();
    const sidebarState = loadSidebarState();
    const theme = loadThemePreference();

    const data = {
      sessions,
      currentId,
      modelSelection,
      sidebarState,
      theme,
    };

    return JSON.stringify(data).length;
  } catch (error) {
    console.error('[SessionStorage] Failed to calculate size:', error);
    return 0;
  }
}

/**
 * Export sessions as JSON (for backup)
 */
export function exportSessions(): string {
  try {
    const sessions = loadAllSessions();
    const metadata = getSessionMetadata();
    const currentId = loadCurrentSessionId();
    const modelSelection = loadModelSelection();
    const sidebarState = loadSidebarState();
    const theme = loadThemePreference();

    const backup = {
      version: SESSION_STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      sessions,
      metadata,
      currentId,
      modelSelection,
      sidebarState,
      theme,
    };

    return JSON.stringify(backup, null, 2);
  } catch (error) {
    console.error('[SessionStorage] Failed to export sessions:', error);
    return '';
  }
}

/**
 * Import sessions from backup JSON
 */
export function importSessions(jsonString: string): boolean {
  try {
    const data = JSON.parse(jsonString);

    if (data.version !== SESSION_STORAGE_VERSION) {
      console.warn('[SessionStorage] Version mismatch on import, proceeding anyway');
    }

    if (Array.isArray(data.sessions)) {
      safeSetJSON(SESSION_STORAGE_KEY, data.sessions);
    }

    if (data.metadata) {
      safeSetJSON(SESSION_METADATA_KEY, data.metadata);
    }

    if (data.currentId) {
      safeSetJSON(CURRENT_SESSION_KEY, data.currentId);
    }

    if (data.modelSelection) {
      safeSetJSON(MODEL_SELECTION_KEY, data.modelSelection);
    }

    if (typeof data.sidebarState === 'boolean') {
      safeSetJSON(SIDEBAR_STATE_KEY, data.sidebarState);
    }

    if (data.theme) {
      safeSetJSON(THEME_PREFERENCE_KEY, data.theme);
    }

    return true;
  } catch (error) {
    console.error('[SessionStorage] Failed to import sessions:', error);
    return false;
  }
}
