/**
 * Web App Offline & Session Management Types
 *
 * Shared types for offline synchronization, session persistence,
 * and state recovery functionality in the web app.
 */

/**
 * Offline sync state enumeration
 * Represents the current state of the offline sync manager
 */
export enum SyncState {
  /** Ready to sync, no active operations */
  IDLE = 'idle',
  /** Currently syncing queued items */
  SYNCING = 'syncing',
  /** Online and ready */
  ONLINE = 'online',
  /** Offline, queuing operations */
  OFFLINE = 'offline',
  /** Error occurred during sync */
  ERROR = 'error',
}

/**
 * Summary of a sync operation
 * Contains metrics about what was synced
 *
 * @property messagesSynced - Number of messages successfully synced
 * @property messagesFailed - Number of messages that failed to sync
 * @property toolsSynced - Number of tool executions successfully synced
 * @property toolsFailed - Number of tool executions that failed
 * @property totalTime - Total time in milliseconds for the sync operation
 */
export interface SyncSummary {
  messagesSynced: number;
  messagesFailed: number;
  toolsSynced: number;
  toolsFailed: number;
  totalTime: number;
}

/**
 * Global sync manager state
 * Represents the complete state of the offline sync manager
 *
 * @property state - Current sync state
 * @property isOnline - Whether the app is currently online
 * @property queuedCount - Number of items waiting to sync
 * @property lastSyncTime - Timestamp of the last successful sync
 * @property lastSyncSummary - Results from the last sync operation
 * @property error - Error object if sync failed, undefined otherwise
 */
export interface SyncManagerState {
  state: SyncState;
  isOnline: boolean;
  queuedCount: number;
  lastSyncTime?: Date;
  lastSyncSummary?: SyncSummary;
  error?: Error;
}

/**
 * Queued message sent while offline
 * Represents a chat message waiting to be synced
 *
 * @property id - Unique identifier for this queued message
 * @property sessionId - Associated session ID
 * @property content - Message content
 * @property timestamp - ISO string timestamp when message was sent
 * @property retryCount - Number of sync attempts
 * @property addedAt - ISO string timestamp when added to queue
 */
export interface QueuedMessage {
  id: string;
  sessionId: string;
  content: string;
  timestamp: string;
  retryCount: number;
  addedAt: string;
}

/**
 * Queued tool execution request
 * Represents a tool call waiting to be synced
 *
 * @property id - Unique identifier for this queued execution
 * @property sessionId - Associated session ID
 * @property toolName - Name of the tool to execute
 * @property toolInput - Input parameters for the tool
 * @property timestamp - ISO string timestamp when execution was requested
 * @property retryCount - Number of sync attempts
 * @property addedAt - ISO string timestamp when added to queue
 */
export interface QueuedToolExecution {
  id: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  timestamp: string;
  retryCount: number;
  addedAt: string;
}

/**
 * Offline queue state
 * Represents the complete state of the offline queue
 *
 * @property messages - Array of queued messages
 * @property toolExecutions - Array of queued tool executions
 * @property lastSyncTime - ISO string of last successful sync
 */
export interface OfflineQueueState {
  messages: QueuedMessage[];
  toolExecutions: QueuedToolExecution[];
  lastSyncTime?: string;
}

/**
 * Callbacks for sync operations
 * Allows custom handling of message and tool syncing
 *
 * @property onMessageSync - Callback for each message being synced
 * @property onToolSync - Callback for each tool execution being synced
 * @property onSyncComplete - Called when sync completes (success or failure)
 */
export interface SyncCallbacks {
  onMessageSync?: (message: QueuedMessage) => Promise<void>;
  onToolSync?: (tool: QueuedToolExecution) => Promise<void>;
  onSyncComplete?: (success: boolean, summary: SyncSummary) => void;
}

/**
 * Serializable chat session structure
 * Maps to UI/Zustand state but in localStorage-friendly format
 *
 * @property id - Unique session identifier
 * @property title - Display name for the session
 * @property preview - Short preview of session content
 * @property messageCount - Number of messages in session
 * @property createdAt - ISO string creation timestamp
 * @property updatedAt - ISO string last update timestamp
 * @property messages - Array of stored messages
 * @property selectedModel - Currently selected model ID
 * @property selectedProvider - Currently selected provider name
 */
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

/**
 * Serializable message structure
 * Converts Date objects to ISO strings for JSON serialization
 *
 * @property id - Unique message identifier
 * @property role - Message role (user, assistant, or system)
 * @property content - Message content
 * @property timestamp - ISO string timestamp
 * @property metadata - Optional message metadata (model, cost, tokens, etc.)
 */
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

/**
 * Session storage metadata
 * Tracks storage version for migrations
 *
 * @property version - Schema version for migrations
 * @property lastSyncTime - ISO string of last sync to server
 */
export interface SessionStorageMetadata {
  version: number;
  lastSyncTime: string;
}

/**
 * Snapshot of application state
 * Used for state recovery and rollback capabilities
 *
 * @property timestamp - Millisecond timestamp when snapshot was taken
 * @property data - The snapshot data
 * @property version - Schema version for migrations
 */
export interface StateSnapshot {
  timestamp: number;
  data: Record<string, unknown>;
  version: number;
}
