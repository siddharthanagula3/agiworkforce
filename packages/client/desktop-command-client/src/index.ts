/**
 * @agiworkforce/desktop-command-client
 *
 * Typed wrappers for the Tauri commands the desktop renderer calls.
 * Each module maps to a Rust command domain.
 *
 * @packageDocumentation
 */

// re-exported directly for ergonomic consumption (e.g. BridgeStatusCard
export type { ExtensionStatusDiagnostics } from './browserExtension';
export type { PairRequestPrompt } from './realtime';
export type {
  AutomationCapabilitySupport,
  AutomationPermissions,
  DiscardedRecording,
  PlatformAutomationSupport,
  RecordedAction,
  RecordedActionType,
  Recording,
  RecordingSession,
  RecordingStatus,
} from './automation';

export * as settings from './settings';
export * as window from './window';
export * as shortcuts from './shortcuts';
export * as autostart from './autostart';

export * as mcp from './mcp';

export * as automation from './automation';
export * as browserExtension from './browserExtension';

export * as onboarding from './onboarding';
export * as codeEditing from './codeEditing';

export * as realtime from './realtime';

export * as notifications from './notifications';
export * as skills from './skills';
export * as hooks from './hooks';
export * as dotfiles from './dotfiles';
