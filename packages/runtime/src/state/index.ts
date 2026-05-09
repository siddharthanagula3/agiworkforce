/**
 * @agiworkforce/runtime/state
 *
 * Central state architecture — createStore + onChangeAppState choke-point.
 *
 * Usage (React):
 * ```ts
 * import { useSyncExternalStore } from 'react';
 * import { appStateStore } from '@agiworkforce/runtime/state';
 *
 * function useAppState<T>(selector: (s: AppState) => T): T {
 *   return useSyncExternalStore(
 *     appStateStore.subscribe,
 *     () => selector(appStateStore.getState()),
 *   );
 * }
 * ```
 *
 * Usage (non-React):
 * ```ts
 * import { appStateStore } from '@agiworkforce/runtime/state';
 * appStateStore.setState(prev => ({ ...prev, chat: { ...prev.chat, isStreaming: true } }));
 * ```
 */

// Core primitives
export { createStore } from './createStore';
export type { Store, Listener, OnChange } from './createStore';

// Single choke-point + fan-out channels
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

// Canonical state shape
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

// Singleton store — wired with onChangeAppState as the onChange handler.
import { createStore } from './createStore';
import { onChangeAppState } from './onChangeAppState';
import { initialAppState } from './AppStateStore';
import type { AppState } from './AppStateStore';

/**
 * Singleton AppState store for the current surface.
 * Import this directly to read/write canonical application state.
 */
export const appStateStore = createStore<AppState>(initialAppState, onChangeAppState);
