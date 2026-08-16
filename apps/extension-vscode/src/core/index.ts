export { validateAdvancedFeatureFlags, hasInlineCompletionCredential } from './advancedFeatures';
export { buildExtensionStatusBarText } from './statusBar';
export { setupChat, type ChatState } from './chatSetup';
export { setupCommands, type CommandDeps } from './commandSetup';
export {
  registerCommands,
  type Command,
  type CommandDeps as RegistryCommandDeps,
  REGISTRY_COMMANDS,
} from './commands';
export { setupProviders, type ProviderState } from './providerSetup';
export { runInlineCommand, commandLabel, type InlineCommand } from './runInlineCommand';
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
