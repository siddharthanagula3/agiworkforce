/**
 * @agiworkforce/runtime
 *
 * Runtime detection, capability-aware command dispatch, and event bus abstraction.
 * Works across Tauri (desktop), cloud web, and test environments.
 *
 * @packageDocumentation
 */

// Runtime environment detection
export { RuntimeEnv, isTauri, isCloudWeb, isTest, getRuntimeEnv } from './detect';

// Capability-aware command dispatch
export { command, commandWithWarning } from './command';
export type { CommandResult } from './command';

// Error types for capability gating
export { DesktopRequiredError, createDesktopPreferredWarning } from './errors';
export type { DesktopPreferredWarning } from './errors';

// Command capability registry
export { resolveCommandCapability } from './registry';

// Event bus abstraction
export { listen, once, emit } from './events';
export type { EventCallback, UnlistenFn } from './events';

// HTTP transport (typically not used directly — command() handles routing)
export { routeToCloud } from './http';

// Central state architecture — createStore + onChangeAppState choke-point
export {
  createStore,
  appStateStore,
  onChangeAppState,
  onFanOutError,
  registerApiCacheInvalidator,
  registerTelemetryHandler,
  registerPersistenceHandler,
  registerModelSwitchListener,
  MAX_FANOUT_DEPTH,
  initialAppState,
  initialAuthState,
  initialChatState,
  initialSettingsState,
  initialSubscriptionsState,
  initialMcpState,
  initialMemoryState,
} from './state';
export type {
  Store,
  Listener,
  OnChange,
  FanOutError,
  CircularFanOutError,
  AppStateTelemetryEvent,
  ModelSwitchEvent,
  AppState,
  AuthState,
  ChatState,
  SettingsState,
  SubscriptionsState,
  McpState,
  MemoryState,
  PlanTier,
} from './state';
