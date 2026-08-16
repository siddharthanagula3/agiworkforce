
export enum SyncState {
  IDLE = 'idle',
  SYNCING = 'syncing',
  ONLINE = 'online',
  OFFLINE = 'offline',
  ERROR = 'error',
}

export interface SyncSummary {
  messagesSynced: number;
  messagesFailed: number;
  toolsSynced: number;
  toolsFailed: number;
  totalTime: number;
}

export interface SyncManagerState {
  state: SyncState;
  isOnline: boolean;
  queuedCount: number;
  lastSyncTime?: Date;
  lastSyncSummary?: SyncSummary;
  error?: Error;
}

export interface QueuedMessage {
  id: string;
  sessionId: string;
  content: string;
  timestamp: string;
  retryCount: number;
  addedAt: string;
}

export interface QueuedToolExecution {
  id: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  timestamp: string;
  retryCount: number;
  addedAt: string;
}

export interface OfflineQueueState {
  messages: QueuedMessage[];
  toolExecutions: QueuedToolExecution[];
  lastSyncTime?: string;
}

export interface SyncCallbacks {
  onMessageSync?: (message: QueuedMessage) => Promise<void>;
  onToolSync?: (tool: QueuedToolExecution) => Promise<void>;
  onSyncComplete?: (success: boolean, summary: SyncSummary) => void;
}

export interface StoredChatSession {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
  selectedModel?: string;
  selectedProvider?: string;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    model?: string;
    provider?: string;
    cost?: number;
    tokenCount?: number;
  };
}

export interface SessionStorageMetadata {
  version: number;
  lastSyncTime: string;
}

export interface StateSnapshot {
  timestamp: number;
  data: Record<string, unknown>;
  version: number;
}
