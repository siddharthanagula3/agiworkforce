/**
 * VIBE Feature Index
 * Central export for the entire VIBE multi-agent interface
 */

// Pages
export { default as VibeDashboard } from './pages/VibeDashboard';

// Components
export * from './components';

// Stores
export * from './stores';

// Hooks
export * from './hooks';

// Services (FileSyncState already exported from stores, so exclude from services)
export {
  vibeAgentRouter,
  vibeComplexityAnalyzer,
  vibeExecutionCoordinator,
  messagePool,
  AgentCollaborationManager,
  createCollaborationManager,
  vibeToolOrchestrator,
  vibeFileManager,
  vibeFileSyncService,
  useFileSyncStatus,
  useHasUnsavedChanges,
  type SyncStatus,
  type FileSyncConfig,
} from './services';

// Types - import from ./types directly to avoid name conflicts with component exports
export type { VibeMessage as VibeMessageType, ActiveAgent, AgentStatus } from './types';
