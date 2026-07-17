/**
 * onChangeAppState — single choke-point for all AppState side effects.
 *
 * WHY A CHOKE-POINT (from Anthropic reference, misc1-skills-tasks-state-memdir.md §8.5):
 * "Every other path — Shift+Tab cycling, ExitPlanModePermissionRequest dialog options,
 *  the /plan slash command, rewind, the REPL bridge's onSetPermissionMode — mutated AppState
 *  without telling CCR, leaving external_metadata.permission_mode stale."
 *
 * We face the same problem: 102 stores each notifying the API client, telemetry, and
 * persistence independently leads to missed notifications and race conditions.
 * Hooking the diff HERE means ANY setState call that changes relevant fields fans out
 * correctly, with zero changes to the callsites.
 *
 * Fan-out channels (≥4 required per acceptance criteria):
 *   1. API client cache invalidation  — auth/model changes bust the in-flight cache
 *   2. Telemetry                      — structured event emitted on every state change
 *   3. Settings persistence           — theme/lang/preference changes written to storage
 *   4. Model-switch broadcast         — model field changes announced to all surfaces
 *
 * Circular re-entrancy guard:
 *   Each call to onChangeAppState passes a depth counter. If depth > MAX_FANOUT_DEPTH
 *   (2) the call is rejected with a structured error, preventing Store A→B→A infinite loops.
 *
 * Fan-out failure isolation:
 *   Each channel is wrapped in try/catch. One failing channel cannot break others.
 *   Errors are emitted as structured objects rather than thrown.
 */

import type { AppState } from './AppStateStore';

/** Maximum recursive fan-out depth before we reject the call. */
export const MAX_FANOUT_DEPTH = 2;

/** Structured error emitted when a fan-out channel throws. */
export interface FanOutError {
  channel: string;
  error: unknown;
  depth: number;
}

/** Structured error emitted when circular re-entrancy is detected. */
export interface CircularFanOutError {
  kind: 'circular_fanout';
  depth: number;
  newState: AppState;
}

/** Consumers can register listeners on fan-out errors for observability. */
const fanOutErrorListeners = new Set<(err: FanOutError | CircularFanOutError) => void>();

export function onFanOutError(
  listener: (err: FanOutError | CircularFanOutError) => void,
): () => void {
  fanOutErrorListeners.add(listener);
  return () => fanOutErrorListeners.delete(listener);
}

function emitError(err: FanOutError | CircularFanOutError): void {
  for (const listener of fanOutErrorListeners) {
    try {
      listener(err);
    } catch {
      // Error listeners must not throw
    }
  }
}

// ---------------------------------------------------------------------------
// Channel 1: API client cache invalidation
// ---------------------------------------------------------------------------

/** Registry of cache-invalidation callbacks registered by API client adapters. */
const apiCacheInvalidators = new Set<(prev: AppState, next: AppState) => void>();

export function registerApiCacheInvalidator(
  fn: (prev: AppState, next: AppState) => void,
): () => void {
  apiCacheInvalidators.add(fn);
  return () => apiCacheInvalidators.delete(fn);
}

function channelApiCacheInvalidation(prev: AppState, next: AppState): void {
  // Invalidate on any auth/model change
  const authChanged =
    prev.auth.userId !== next.auth.userId ||
    prev.auth.accessToken !== next.auth.accessToken ||
    prev.auth.planTier !== next.auth.planTier;
  const modelChanged = prev.chat.activeModelId !== next.chat.activeModelId;

  if (authChanged || modelChanged) {
    for (const invalidator of apiCacheInvalidators) {
      invalidator(prev, next);
    }
  }
}

// ---------------------------------------------------------------------------
// Channel 2: Telemetry
// ---------------------------------------------------------------------------

/** Telemetry event emitted after each state change. */
export interface AppStateTelemetryEvent {
  kind: 'app_state_changed';
  changedFields: string[];
  ts: number;
}

/** Registry of telemetry handlers. */
const telemetryHandlers = new Set<(event: AppStateTelemetryEvent) => void>();

export function registerTelemetryHandler(fn: (event: AppStateTelemetryEvent) => void): () => void {
  telemetryHandlers.add(fn);
  return () => telemetryHandlers.delete(fn);
}

function channelTelemetry(prev: AppState, next: AppState): void {
  const changedFields: string[] = [];

  // Auth domain
  if (prev.auth.userId !== next.auth.userId) changedFields.push('auth.userId');
  if (prev.auth.planTier !== next.auth.planTier) changedFields.push('auth.planTier');
  if (prev.auth.isAuthenticated !== next.auth.isAuthenticated)
    changedFields.push('auth.isAuthenticated');

  // Chat domain
  if (prev.chat.activeModelId !== next.chat.activeModelId) changedFields.push('chat.activeModelId');
  if (prev.chat.activeConversationId !== next.chat.activeConversationId)
    changedFields.push('chat.activeConversationId');
  if (prev.chat.isStreaming !== next.chat.isStreaming) changedFields.push('chat.isStreaming');

  // Settings domain
  if (prev.settings.theme !== next.settings.theme) changedFields.push('settings.theme');
  if (prev.settings.language !== next.settings.language) changedFields.push('settings.language');

  // Subscriptions domain
  if (prev.subscriptions.planTier !== next.subscriptions.planTier)
    changedFields.push('subscriptions.planTier');

  // MCP domain
  if (prev.mcp.connectedCount !== next.mcp.connectedCount) changedFields.push('mcp.connectedCount');

  if (changedFields.length === 0) return;

  const event: AppStateTelemetryEvent = {
    kind: 'app_state_changed',
    changedFields,
    ts: Date.now(),
  };

  for (const handler of telemetryHandlers) {
    handler(event);
  }
}

// ---------------------------------------------------------------------------
// Channel 3: Settings persistence
// ---------------------------------------------------------------------------

/** Registry of persistence callbacks. Called when persisted settings fields change. */
const persistenceHandlers = new Set<(settings: AppState['settings']) => void>();

export function registerPersistenceHandler(
  fn: (settings: AppState['settings']) => void,
): () => void {
  persistenceHandlers.add(fn);
  return () => persistenceHandlers.delete(fn);
}

function channelSettingsPersistence(prev: AppState, next: AppState): void {
  // Only write to storage when settings domain actually changes
  if (prev.settings === next.settings) return;

  for (const handler of persistenceHandlers) {
    handler(next.settings);
  }
}

// ---------------------------------------------------------------------------
// Channel 4: Model-switch broadcast
// ---------------------------------------------------------------------------

/** Broadcast emitted when the active model changes. */
export interface ModelSwitchEvent {
  prevModelId: string | null;
  nextModelId: string | null;
  source: 'app_state';
}

/** Registry of model-switch listeners (cross-surface broadcast targets). */
const modelSwitchListeners = new Set<(event: ModelSwitchEvent) => void>();

export function registerModelSwitchListener(fn: (event: ModelSwitchEvent) => void): () => void {
  modelSwitchListeners.add(fn);
  return () => modelSwitchListeners.delete(fn);
}

function channelModelSwitchBroadcast(prev: AppState, next: AppState): void {
  if (prev.chat.activeModelId === next.chat.activeModelId) return;

  const event: ModelSwitchEvent = {
    prevModelId: prev.chat.activeModelId,
    nextModelId: next.chat.activeModelId,
    source: 'app_state',
  };

  for (const listener of modelSwitchListeners) {
    listener(event);
  }
}

// ---------------------------------------------------------------------------
// Main choke-point
// ---------------------------------------------------------------------------

/**
 * onChangeAppState — call this as the `onChange` argument to createStore.
 *
 * @param newState — next state snapshot after the mutation.
 * @param oldState — previous state snapshot before the mutation.
 * @param depth    — re-entrancy depth (default 0, incremented by recursive calls).
 *                   Calls with depth > MAX_FANOUT_DEPTH are rejected.
 */
export function onChangeAppState(
  {
    newState,
    oldState,
  }: {
    newState: AppState;
    oldState: AppState;
  },
  depth = 0,
): void {
  // Circular re-entrancy guard
  if (depth > MAX_FANOUT_DEPTH) {
    emitError({ kind: 'circular_fanout', depth, newState });
    return;
  }

  // Each channel is isolated — one failure must not break others.

  try {
    channelApiCacheInvalidation(oldState, newState);
  } catch (error) {
    emitError({ channel: 'api_cache_invalidation', error, depth });
  }

  try {
    channelTelemetry(oldState, newState);
  } catch (error) {
    emitError({ channel: 'telemetry', error, depth });
  }

  try {
    channelSettingsPersistence(oldState, newState);
  } catch (error) {
    emitError({ channel: 'settings_persistence', error, depth });
  }

  try {
    channelModelSwitchBroadcast(oldState, newState);
  } catch (error) {
    emitError({ channel: 'model_switch_broadcast', error, depth });
  }
}
