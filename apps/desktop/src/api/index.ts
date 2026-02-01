/**
 * API Module Exports
 *
 * Centralized exports for all Tauri command API wrappers.
 * Import from '@/api' for clean access to all APIs.
 */

// Ollama - Local AI model management
export {
  OllamaClient,
  ollamaCheckStatus,
  ollamaListModels,
  ollamaGetModelInfo,
  ollamaPullModel,
  ollamaDeleteModel,
  formatModelSize,
  type OllamaModel,
  type OllamaModelDetails,
} from './ollama';

// Privacy - GDPR-compliant data management
export {
  PrivacyClient,
  updatePrivacyPreferences,
  exportUserData,
  exportUserDataParsed,
  downloadUserData,
  deleteUserAccount,
  type PrivacyPreferences,
  type ExportedData,
  type ExportMetadata,
} from './privacy';

// MCP - Model Context Protocol
export {
  McpClient,
  mcpInitialize,
  mcpListServers,
  mcpConnectServer,
  mcpDisconnectServer,
  mcpEnableServer,
  mcpDisableServer,
  mcpListTools,
  mcpSearchTools,
  mcpCallTool,
  mcpGetConfig,
  mcpUpdateConfig,
  mcpGetStats,
  mcpStoreCredential,
  mcpGetToolSchemas,
} from './mcp';

// Chat - Intent Detection and Stop Handling
export {
  ChatClient,
  detectIntent,
  isStopCommand,
  handleStop,
  stopGeneration,
  type UserIntent,
  type IntentResult,
} from './chat';

// Screen Watcher - Continuous Screen Monitoring
export {
  ScreenWatcherClient,
  startScreenWatcher,
  stopScreenWatcher,
  pauseScreenWatcher,
  resumeScreenWatcher,
  getScreenWatcherStatus,
  getLatestScreenshot,
  getRecentScreenshots,
  captureScreenNow,
  onScreenCapture,
  type ScreenCapture,
  type ScreenWatcherConfig,
  type WatcherStatus,
} from './screenWatcher';

// Timeout Management - Extended task execution
export {
  getTimeoutConfig,
  setTimeoutConfig,
  getRecommendedTimeout,
  formatDuration,
  minutesToSeconds,
  secondsToMinutes,
  type TimeoutConfig,
  type TimeoutWarning,
  type TimeoutResponse,
} from './timeout';

// Background Tasks - Persistent task management
export {
  listBackgroundTasks,
  getBackgroundTask,
  getTaskProgress,
  createBackgroundTask,
  pauseBackgroundTask,
  resumeBackgroundTask,
  cancelBackgroundTask,
  extendTaskTimeout,
  getTaskHistory,
  deleteBackgroundTask,
  getResumableTasks,
  resumeAllTasks,
  type PersistentTask,
  type TaskProgress,
} from './backgroundTasks';

// Re-export other API modules for convenience
export * from './automation';
export * from './codeEditing';
export * from './embeddings';
export * from './media';
export * from './migration';
export * from './orchestrator';
export * from './reflection';
export * from './teamsApi';
export * from './accountApi';
