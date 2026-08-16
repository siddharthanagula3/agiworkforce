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
 *
 * STB-26: every function in this module used to end in a comment-only
 * `catch (error) { // Silently handle localStorage failure }`. The damaging one
 * was `saveSession`: a `QuotaExceededError` returned normally, so the user kept
 * chatting believing their history was being persisted and lost it on reload.
 *
 * Contract now:
 *   - WRITE paths throw {@link SessionStorageWriteError} when the write does not
 *     land. Callers must surface that to the user (`useSessionPersistence`
 *     already catches and exposes it via its `error` field).
 *   - READ paths still fall back to a default — an unreadable store legitimately
 *     means "no saved sessions" — but they log instead of failing silently, so a
 *     corrupt store is visible in diagnostics rather than invisible.
 */

export class SessionStorageWriteError extends Error {
  readonly code = 'SESSION_STORAGE_WRITE_FAILED';

  constructor(
    readonly key: string,
    options?: { cause?: unknown },
  ) {
    super(
      `Could not save "${key}" to browser storage. Your chat history was not persisted — ` +
        `browser storage may be full or disabled.`,
    );
    this.name = 'SessionStorageWriteError';
    if (options && 'cause' in options) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** Write-or-throw wrapper around {@link safeSetJSON}. */
function persist<T>(key: string, value: T): void {
  let ok: boolean;
  try {
    ok = safeSetJSON(key, value);
  } catch (error) {
    throw new SessionStorageWriteError(key, { cause: error });
  }
  if (!ok) throw new SessionStorageWriteError(key);
}

function warnReadFailure(operation: string, error: unknown): void {
  console.warn(`[sessionStorage] ${operation} failed; falling back to default.`, error);
}

import { safeGetJSON, safeSetJSON } from '@shared/utils/localStorage';
import type { EnhancedMessage } from '@shared/stores/unified-chat-types';
import type { StoredChatSession, StoredMessage, SessionStorageMetadata } from '@agiworkforce/types';

const SESSION_STORAGE_VERSION = 1;

export type { StoredChatSession, StoredMessage, SessionStorageMetadata };

const SESSION_STORAGE_KEY = 'agi_chat_sessions';
const SESSION_METADATA_KEY = 'agi_chat_sessions_metadata';
const CURRENT_SESSION_KEY = 'agi_current_session_id';
const MODEL_SELECTION_KEY = 'agi_selected_model';
const SIDEBAR_STATE_KEY = 'agi_sidebar_collapsed';
const THEME_PREFERENCE_KEY = 'agi_theme_preference';

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
    const sessions = loadAllSessions();

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

    const trimmedSessions = sessions.slice(Math.max(0, sessions.length - 50));

    persist(SESSION_STORAGE_KEY, trimmedSessions);

    updateSessionMetadata();
  } catch (error) {
    if (error instanceof SessionStorageWriteError) throw error;
    throw new SessionStorageWriteError(SESSION_STORAGE_KEY, { cause: error });
  }
}

export function loadSession(sessionId: string): StoredChatSession | null {
  try {
    const sessions = loadAllSessions();
    return sessions.find((s) => s.id === sessionId) ?? null;
  } catch (error) {
    warnReadFailure('loadSession', error);
    return null;
  }
}

export function loadAllSessions(): StoredChatSession[] {
  try {
    const data = safeGetJSON<StoredChatSession[]>(SESSION_STORAGE_KEY, []);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    warnReadFailure('loadAllSessions', error);
    return [];
  }
}

export function deleteSession(sessionId: string): void {
  try {
    let sessions = loadAllSessions();
    sessions = sessions.filter((s) => s.id !== sessionId);
    persist(SESSION_STORAGE_KEY, sessions);

    const currentId = loadCurrentSessionId();
    if (currentId === sessionId) {
      clearCurrentSessionId();
    }

    updateSessionMetadata();
  } catch (error) {
    if (error instanceof SessionStorageWriteError) throw error;
    throw new SessionStorageWriteError(SESSION_STORAGE_KEY, { cause: error });
  }
}

export function clearAllSessions(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(SESSION_METADATA_KEY);
    localStorage.removeItem(CURRENT_SESSION_KEY);
    // Don't call updateSessionMetadata() as we want to clear metadata too
  } catch (error) {
    throw new SessionStorageWriteError(SESSION_STORAGE_KEY, { cause: error });
  }
}

export function saveCurrentSessionId(sessionId: string): void {
  try {
    persist(CURRENT_SESSION_KEY, sessionId);
  } catch (error) {
    if (error instanceof SessionStorageWriteError) throw error;
    throw new SessionStorageWriteError(CURRENT_SESSION_KEY, { cause: error });
  }
}

export function loadCurrentSessionId(): string | null {
  try {
    const id = safeGetJSON<string>(CURRENT_SESSION_KEY, '');
    return typeof id === 'string' && id ? id : null;
  } catch (error) {
    warnReadFailure('loadCurrentSessionId', error);
    return null;
  }
}

export function clearCurrentSessionId(): void {
  try {
    localStorage.removeItem(CURRENT_SESSION_KEY);
  } catch (error) {
    throw new SessionStorageWriteError(CURRENT_SESSION_KEY, { cause: error });
  }
}

export function saveModelSelection(model: { modelId: string; provider: string }): void {
  try {
    persist(MODEL_SELECTION_KEY, model);
  } catch (error) {
    if (error instanceof SessionStorageWriteError) throw error;
    throw new SessionStorageWriteError(MODEL_SELECTION_KEY, { cause: error });
  }
}

export function loadModelSelection(): { modelId: string; provider: string } | null {
  try {
    const data = safeGetJSON<{ modelId: string; provider: string }>(MODEL_SELECTION_KEY, {
      modelId: '',
      provider: '',
    });
    return data && data.modelId ? data : null;
  } catch (error) {
    warnReadFailure('loadModelSelection', error);
    return null;
  }
}

export function saveSidebarState(collapsed: boolean): void {
  try {
    persist(SIDEBAR_STATE_KEY, collapsed);
  } catch (error) {
    if (error instanceof SessionStorageWriteError) throw error;
    throw new SessionStorageWriteError(SIDEBAR_STATE_KEY, { cause: error });
  }
}

export function loadSidebarState(): boolean | null {
  try {
    const data = safeGetJSON<boolean>(SIDEBAR_STATE_KEY, false);
    return typeof data === 'boolean' ? data : null;
  } catch (error) {
    warnReadFailure('loadSidebarState', error);
    return null;
  }
}

export function saveThemePreference(theme: 'light' | 'dark' | 'system'): void {
  try {
    persist(THEME_PREFERENCE_KEY, theme);
  } catch (error) {
    if (error instanceof SessionStorageWriteError) throw error;
    throw new SessionStorageWriteError(THEME_PREFERENCE_KEY, { cause: error });
  }
}

export function loadThemePreference(): 'light' | 'dark' | 'system' | null {
  try {
    const data = safeGetJSON<string>(THEME_PREFERENCE_KEY, '');
    if (data === 'light' || data === 'dark' || data === 'system') {
      return data;
    }
    return null;
  } catch (error) {
    warnReadFailure('loadThemePreference', error);
    return null;
  }
}

function updateSessionMetadata(): void {
  try {
    const metadata: SessionStorageMetadata = {
      version: SESSION_STORAGE_VERSION,
      lastSyncTime: new Date().toISOString(),
    };
    persist(SESSION_METADATA_KEY, metadata);
  } catch (error) {
    if (error instanceof SessionStorageWriteError) throw error;
    throw new SessionStorageWriteError(SESSION_METADATA_KEY, { cause: error });
  }
}

export function getSessionMetadata(): SessionStorageMetadata | null {
  try {
    const data = safeGetJSON<SessionStorageMetadata>(SESSION_METADATA_KEY, {
      version: 0,
      lastSyncTime: '',
    });
    return data && data.version ? data : null;
  } catch (error) {
    warnReadFailure('getSessionMetadata', error);
    return null;
  }
}

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
    warnReadFailure('getSessionStorageSize', error);
    return 0;
  }
}

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
    throw new SessionStorageWriteError('export', { cause: error });
  }
}

export function importSessions(jsonString: string): boolean {
  try {
    const data = JSON.parse(jsonString);

    if (data.version !== SESSION_STORAGE_VERSION) {
      // Version mismatch on import - proceed with best-effort migration
    }

    if (Array.isArray(data.sessions)) {
      persist(SESSION_STORAGE_KEY, data.sessions);
    }

    if (data.metadata) {
      persist(SESSION_METADATA_KEY, data.metadata);
    }

    if (data.currentId) {
      persist(CURRENT_SESSION_KEY, data.currentId);
    }

    if (data.modelSelection) {
      persist(MODEL_SELECTION_KEY, data.modelSelection);
    }

    if (typeof data.sidebarState === 'boolean') {
      persist(SIDEBAR_STATE_KEY, data.sidebarState);
    }

    if (data.theme) {
      persist(THEME_PREFERENCE_KEY, data.theme);
    }

    return true;
  } catch (error) {
    if (error instanceof SessionStorageWriteError) throw error;
    warnReadFailure('importSessions', error);
    return false;
  }
}
