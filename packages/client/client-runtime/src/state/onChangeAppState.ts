import type { AppState } from './AppStateStore';

export const MAX_FANOUT_DEPTH = 2;

export interface FanOutError {
  channel: string;
  error: unknown;
  depth: number;
}

export interface CircularFanOutError {
  kind: 'circular_fanout';
  depth: number;
  newState: AppState;
}

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

const apiCacheInvalidators = new Set<(prev: AppState, next: AppState) => void>();

export function registerApiCacheInvalidator(
  fn: (prev: AppState, next: AppState) => void,
): () => void {
  apiCacheInvalidators.add(fn);
  return () => apiCacheInvalidators.delete(fn);
}

function channelApiCacheInvalidation(prev: AppState, next: AppState): void {
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

export interface AppStateTelemetryEvent {
  kind: 'app_state_changed';
  changedFields: string[];
  ts: number;
}

const telemetryHandlers = new Set<(event: AppStateTelemetryEvent) => void>();

export function registerTelemetryHandler(fn: (event: AppStateTelemetryEvent) => void): () => void {
  telemetryHandlers.add(fn);
  return () => telemetryHandlers.delete(fn);
}

function channelTelemetry(prev: AppState, next: AppState): void {
  const changedFields: string[] = [];

  if (prev.auth.userId !== next.auth.userId) changedFields.push('auth.userId');
  if (prev.auth.planTier !== next.auth.planTier) changedFields.push('auth.planTier');
  if (prev.auth.isAuthenticated !== next.auth.isAuthenticated)
    changedFields.push('auth.isAuthenticated');

  if (prev.chat.activeModelId !== next.chat.activeModelId) changedFields.push('chat.activeModelId');
  if (prev.chat.activeConversationId !== next.chat.activeConversationId)
    changedFields.push('chat.activeConversationId');
  if (prev.chat.isStreaming !== next.chat.isStreaming) changedFields.push('chat.isStreaming');

  if (prev.settings.theme !== next.settings.theme) changedFields.push('settings.theme');
  if (prev.settings.language !== next.settings.language) changedFields.push('settings.language');

  if (prev.subscriptions.planTier !== next.subscriptions.planTier)
    changedFields.push('subscriptions.planTier');

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

const persistenceHandlers = new Set<(settings: AppState['settings']) => void>();

export function registerPersistenceHandler(
  fn: (settings: AppState['settings']) => void,
): () => void {
  persistenceHandlers.add(fn);
  return () => persistenceHandlers.delete(fn);
}

function channelSettingsPersistence(prev: AppState, next: AppState): void {
  if (prev.settings === next.settings) return;

  for (const handler of persistenceHandlers) {
    handler(next.settings);
  }
}

export interface ModelSwitchEvent {
  prevModelId: string | null;
  nextModelId: string | null;
  source: 'app_state';
}

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
  if (depth > MAX_FANOUT_DEPTH) {
    emitError({ kind: 'circular_fanout', depth, newState });
    return;
  }

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
