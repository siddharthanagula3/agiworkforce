
export interface UseErrorRecoveryReturn {
  error: Error | null;
  isRecovering: boolean;
  retryCount: number;
  handleError: (err: Error | string) => void;
  retry: (fn: () => Promise<void>) => Promise<void>;
  reset: () => void;
}

export interface UseErrorRecoveryOptions {
  onError?: (error: Error) => void;
  maxRetries?: number;
  retryDelay?: number;
  showToast?: boolean;
  toastMessage?: string;
}

export interface FeatureFlags {
  voice: boolean;
  darkMode: boolean;
  modelSelection: boolean;
  streaming: boolean;
  webSearch: boolean;
  imageGeneration: boolean;
}

export interface UseFeatureAvailabilityOptions {
  onFeatureUnavailable?: (feature: keyof FeatureFlags) => void;
}

export interface UseFeatureAvailabilityReturn {
  features: FeatureFlags;
  isAvailable: (feature: keyof FeatureFlags) => boolean;
  getFallback: (feature: keyof FeatureFlags, value: unknown) => unknown;
}

export interface PersistedSession {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  messages: unknown[];
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
