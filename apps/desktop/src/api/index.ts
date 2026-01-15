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

// Re-export other API modules for convenience
export * from './automation';
export * from './embeddings';
export * from './media';
export * from './migration';
export * from './orchestrator';
export * from './reflection';
export * from './teamsApi';
export * from './accountApi';
