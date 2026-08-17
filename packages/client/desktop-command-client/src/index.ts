/**
 * @agiworkforce/desktop-command-client
 *
 * Shared typed API wrappers for all 1,062+ Tauri commands.
 * Each module maps 1:1 to a Rust command domain.
 *
 * @packageDocumentation
 */

// re-exported directly for ergonomic consumption (e.g. BridgeStatusCard
export type { ExtensionStatusDiagnostics } from './browserExtension';
export type { PairRequestPrompt } from './realtime';
export type {
  AutomationPermissions,
  DiscardedRecording,
  RecordedAction,
  RecordedActionType,
  Recording,
  RecordingSession,
  RecordingStatus,
} from './automation';

export * as settings from './settings';
export * as auth from './auth';
export * as security from './security';
export * as window from './window';
export * as shortcuts from './shortcuts';
export * as models from './models';
export * as ollama from './ollama';
export * as completion from './completion';
export * as capabilities from './capabilities';
export * as customAgents from './customAgents';
export * as customInstructions from './customInstructions';

export * as chat from './chat';
export * as mcp from './mcp';
export * as knowledge from './knowledge';
export * as embeddings from './embeddings';
export * as fileOps from './fileOps';
export * as database from './database';
export * as cache from './cache';
export * as errorReporting from './errorReporting';

export * as agent from './agent';
export * as automation from './automation';
export * as voice from './voice';
export * as intent from './intent';
export * as toolConfirmation from './toolConfirmation';
export * as thinking from './thinking';
export * as browserExtension from './browserExtension';

export * as research from './research';
export * as document from './document';
export * as projects from './projects';
export * as onboarding from './onboarding';
export * as templates from './templates';
export * as artifacts from './artifacts';
export * as lsp from './lsp';
export * as codeEditing from './codeEditing';
export * as media from './media';

export * as email from './email';
export * as calendar from './calendar';
export * as messaging from './messaging';
export * as productivity from './productivity';
export * as realtime from './realtime';
export * as cloudStorage from './cloudStorage';
export * as teams from './teams';
export * as governance from './governance';

export * as analytics from './analytics';
export * as notifications from './notifications';
export * as canvas from './canvas';
export * as skills from './skills';
export * as hooks from './hooks';
export * as promptEnhancement from './promptEnhancement';
export * as scheduler from './scheduler';
export * as dotfiles from './dotfiles';
export * as feedback from './feedback';
