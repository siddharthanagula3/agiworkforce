export { validateAdvancedFeatureFlags, hasInlineCompletionCredential } from './advancedFeatures';
export { buildExtensionStatusBarText } from './statusBar';
export { setupChat, type ChatState } from './chatSetup';
export { setupCommands, type CommandDeps } from './commandSetup';
export { setupProviders, type ProviderState } from './providerSetup';
export { runInlineCommand, commandLabel, type InlineCommand } from './runInlineCommand';
export {
  IN_USE_REASONS,
  whenInUse,
  markInUse,
  inUseReason,
  __resetStartupWorkForTests,
  type InUseReason,
} from './startupWork';
export {
  initSubsystemHealth,
  runBoot,
  runBootAsync,
  recordFailure,
  getFailureCount,
  __resetSubsystemHealthForTests,
} from './subsystemHealth';
export {
  activate as activateTelemetry,
  logEvent,
  logError,
  redactSecrets,
  TelemetryEvents,
  __resetTelemetryForTests,
} from './telemetry';
