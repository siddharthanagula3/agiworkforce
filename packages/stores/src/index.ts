/**
 * @agiworkforce/stores
 *
 * Shared Zustand stores for the AGI Workforce platform.
 * Consumed by desktop (Tauri), web (Next.js), and mobile (Expo). All IO is
 * injected via adapters so the stores stay pure (no next/, no tauri, no DOM).
 *
 * Stores are added incrementally as commands are wired in each wave.
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Chat store (platform-agnostic, transport-injected)
// ---------------------------------------------------------------------------
export { createChatStore } from './chat/chatStore';
export type {
  ChatStore,
  ChatStoreState,
  CreateChatStoreOptions,
  SendUserMessageParams,
} from './chat/chatStore';
export type {
  ChatMessage,
  ChatConversation,
  ChatToolEntry,
  ChatToolStatus,
  ChatSearchResult,
  ChatCodeExecutionResult,
  CreateConversationOptions,
  ChatStorePort,
  SendChatParams,
  SendChatCallbacks,
} from './chat/types';

// ---------------------------------------------------------------------------
// Artifact store (platform-agnostic; canonical SharedArtifact; Step 1b consolidation)
// ---------------------------------------------------------------------------
export { createArtifactStore } from './artifacts/artifactStore';
export type {
  ArtifactStore,
  ArtifactStoreState,
  CreateArtifactStoreOptions,
} from './artifacts/artifactStore';

// Additional stores will be exported here as they are created in subsequent waves.
// Example (Wave 1+):
// export { useSettingsStore } from './settingsStore';
// export { useModelStore } from './modelStore';
