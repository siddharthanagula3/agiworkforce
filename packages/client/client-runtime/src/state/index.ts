
export { createStore } from './createStore';
export type { Store, Listener, OnChange } from './createStore';

export {
  onChangeAppState,
  onFanOutError,
  registerApiCacheInvalidator,
  registerTelemetryHandler,
  registerPersistenceHandler,
  registerModelSwitchListener,
  MAX_FANOUT_DEPTH,
} from './onChangeAppState';
export type {
  FanOutError,
  CircularFanOutError,
  AppStateTelemetryEvent,
  ModelSwitchEvent,
} from './onChangeAppState';

export {
  initialAppState,
  initialAuthState,
  initialChatState,
  initialSettingsState,
  initialSubscriptionsState,
  initialMcpState,
  initialMemoryState,
} from './AppStateStore';
export type {
  AppState,
  AuthState,
  ChatState,
  SettingsState,
  SubscriptionsState,
  McpState,
  MemoryState,
  PlanTier,
} from './AppStateStore';

import { createStore } from './createStore';
import { onChangeAppState } from './onChangeAppState';
import { initialAppState } from './AppStateStore';
import type { AppState } from './AppStateStore';

export const appStateStore = createStore<AppState>(initialAppState, onChangeAppState);
