/**
 * Web App Custom Hook Types
 *
 * Type definitions for return values and options of custom React hooks
 * used throughout the web app for session management, error recovery,
 * and feature availability detection.
 */

/**
 * Return type for useErrorRecovery hook
 * Provides error handling, retry logic, and recovery state management
 *
 * @property error - Current error object, or null if no error
 * @property isRecovering - Whether recovery is in progress
 * @property retryCount - Number of retry attempts made
 * @property handleError - Function to handle errors
 * @property retry - Function to retry a failed operation
 * @property reset - Function to reset error state
 */
export interface UseErrorRecoveryReturn {
  error: Error | null;
  isRecovering: boolean;
  retryCount: number;
  handleError: (err: Error | string) => void;
  retry: (fn: () => Promise<void>) => Promise<void>;
  reset: () => void;
}

/**
 * Options for useErrorRecovery hook
 * Configures error handling behavior
 *
 * @property onError - Callback fired when error occurs
 * @property maxRetries - Maximum retry attempts (default: 3)
 * @property retryDelay - Delay between retries in ms (default: 1000)
 * @property showToast - Whether to show toast notifications (default: true)
 * @property toastMessage - Custom error message for toast
 */
export interface UseErrorRecoveryOptions {
  onError?: (error: Error) => void;
  maxRetries?: number;
  retryDelay?: number;
  showToast?: boolean;
  toastMessage?: string;
}

/**
 * Feature flags available in the app
 * Tracks which features are available in the current environment
 */
export interface FeatureFlags {
  voice: boolean;
  darkMode: boolean;
  modelSelection: boolean;
  streaming: boolean;
  webSearch: boolean;
  imageGeneration: boolean;
}

/**
 * Options for useFeatureAvailability hook
 * Configures feature availability checking
 *
 * @property onFeatureUnavailable - Callback fired when a feature is unavailable
 */
export interface UseFeatureAvailabilityOptions {
  onFeatureUnavailable?: (feature: keyof FeatureFlags) => void;
}

/**
 * Return type for useFeatureAvailability hook
 * Provides feature availability detection and fallback values
 *
 * @property features - Current feature flags
 * @property isAvailable - Function to check if a feature is available
 * @property getFallback - Function to get fallback value for a feature
 */
export interface UseFeatureAvailabilityReturn {
  features: FeatureFlags;
  isAvailable: (feature: keyof FeatureFlags) => boolean;
  getFallback: (feature: keyof FeatureFlags, value: any) => any;
}

/**
 * Persisted session data structure for useSessionPersistence
 * Used by the hook to work with session storage
 */
export interface PersistedSession {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  messages: any[]; // EnhancedMessage[]
  selectedModel?: string;
  selectedProvider?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Options for useSessionPersistence hook
 * Configures session persistence behavior
 *
 * @property autoSaveInterval - Auto-save interval in ms (0 to disable)
 * @property debug - Enable debug logging
 */
export interface UseSessionPersistenceOptions {
  autoSaveInterval?: number;
  debug?: boolean;
}

/**
 * Return type for useSessionPersistence hook
 * Provides session loading, saving, and management functions
 *
 * @property restoreSession - Load last active session
 * @property saveSession - Save a session to storage
 * @property deleteSession - Delete a session by ID
 * @property loadSession - Load specific session by ID
 * @property getAllSessions - Get all saved sessions (summary)
 * @property clearAll - Clear all session data
 * @property exportSessions - Export sessions as JSON
 * @property importSessions - Import sessions from JSON
 * @property isLoading - Whether data is loading
 * @property error - Last error that occurred
 * @property getStorageSize - Get storage size in bytes
 */
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
