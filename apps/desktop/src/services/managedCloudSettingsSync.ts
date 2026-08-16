import {
  CloudSafeSettingsSchema,
  createManagedCloudSettingsClient,
  type CloudSafeSettings,
  type ManagedCloudSettingsClient,
} from '@agiworkforce/cloud-contracts';
import {
  mergeCloudSafeSettings,
  rebaseCloudSafeSettings,
  selectNextCursor,
  shouldApplyPulledSettings,
  shouldPushSettings,
} from '@agiworkforce/sync';
import type { PrivacyMode } from '@agiworkforce/types';
import { WEB_APP_URL } from '../api/config';
import { storageFallback } from '../lib/storageFallback';
import { selectPrivacyMode, useAppModeStore } from '../stores/appModeStore';
import {
  useSettingsStore,
  type ChatFont,
  type Language,
  type Theme,
} from '../stores/settingsStore';
import { cloudAccountAuth } from './cloudAccountAuth';
import { configureMemoryInjection } from '../api/memory';
import { ErrorSeverity, errorTracking } from './errorTracking';
import { createManagedCloudRequestContext } from './managedCloudRequestContext';

const DEVICE_BACKUP_KEY = 'agi-desktop-managed-settings-device-backup-v1';
const USER_STATE_PREFIX = 'agi-desktop-managed-settings-sync-v1:';
const DEFAULT_DEBOUNCE_MS = 750;

export interface ManagedCloudSettingsSyncEvent {
  phase: 'active' | 'idle' | 'success' | 'error';
  operation?: 'pull' | 'push' | 'restore';
  error?: unknown;
}

interface ManagedIdentity {
  userId: string;
}

interface SubscriptionPort {
  subscribe(listener: () => void): () => void;
}

export interface ManagedCloudSettingsSyncPorts {
  client: ManagedCloudSettingsClient;
  mode: SubscriptionPort & { getPrivacyMode(): PrivacyMode };
  auth: SubscriptionPort & { getIdentity(): ManagedIdentity | null };
  settings: SubscriptionPort & {
    getProjection(): CloudSafeSettings;
    applyProjection(settings: CloudSafeSettings): void;
  };
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  now?: () => Date;
  debounceMs?: number;
  onEvent?: (event: ManagedCloudSettingsSyncEvent) => void;
}

export interface ManagedCloudSettingsSyncCoordinator {
  start(): void;
  stop(): void;
  syncNow(): Promise<void>;
}

interface PersistedSyncState {
  cursor: string;
  lastSyncedSnapshot: string;
  serverSnapshot: CloudSafeSettings;
  localSnapshot: CloudSafeSettings;
  updatedAt: string | null;
}

interface DeviceBackup {
  userId: string;
  settings: CloudSafeSettings;
}

function snapshot(settings: CloudSafeSettings): string {
  return JSON.stringify(settings);
}

function parseSettings(value: unknown): CloudSafeSettings | null {
  const parsed = CloudSafeSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function readJson(storage: ManagedCloudSettingsSyncPorts['storage'], key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readSyncState(
  storage: ManagedCloudSettingsSyncPorts['storage'],
  userId: string,
): PersistedSyncState {
  const raw = readJson(storage, `${USER_STATE_PREFIX}${userId}`);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      cursor: '0',
      lastSyncedSnapshot: '',
      serverSnapshot: {},
      localSnapshot: {},
      updatedAt: null,
    };
  }
  const record = raw as Record<string, unknown>;
  const legacySnapshot = parseSettings(record['cloudSnapshot']) ?? {};
  const serverSnapshot = parseSettings(record['serverSnapshot']) ?? legacySnapshot;
  const localSnapshot = parseSettings(record['localSnapshot']) ?? legacySnapshot;
  return {
    cursor:
      typeof record['cursor'] === 'string' && /^\d+$/.test(record['cursor'])
        ? record['cursor']
        : '0',
    lastSyncedSnapshot:
      typeof record['lastSyncedSnapshot'] === 'string' ? record['lastSyncedSnapshot'] : '',
    serverSnapshot,
    localSnapshot,
    updatedAt:
      typeof record['updatedAt'] === 'string' && !Number.isNaN(Date.parse(record['updatedAt']))
        ? record['updatedAt']
        : null,
  };
}

function readDeviceBackup(storage: ManagedCloudSettingsSyncPorts['storage']): DeviceBackup | null {
  const raw = readJson(storage, DEVICE_BACKUP_KEY);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const settings = parseSettings(record['settings']);
  if (typeof record['userId'] !== 'string' || !settings) return null;
  return { userId: record['userId'], settings };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function createManagedCloudSettingsSyncCoordinator(
  ports: ManagedCloudSettingsSyncPorts,
): ManagedCloudSettingsSyncCoordinator {
  const now = ports.now ?? (() => new Date());
  const debounceMs = ports.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  let started = false;
  let activeUserId: string | null = null;
  let syncState: PersistedSyncState | null = null;
  let deviceBackup: DeviceBackup | null = null;
  let suppressSettingsEvents = false;
  let debounceHandle: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;
  let inFlight: Promise<void> | null = null;
  let activationGeneration = 0;
  let queuedPush = false;
  const unsubscribers: Array<() => void> = [];

  interface ActiveContext {
    generation: number;
    userId: string;
    state: PersistedSyncState;
  }

  const emit = (event: ManagedCloudSettingsSyncEvent) => ports.onEvent?.(event);
  const isEligible = () =>
    ports.mode.getPrivacyMode() === 'managed' && ports.auth.getIdentity() !== null;

  const captureActiveContext = (): ActiveContext | null =>
    activeUserId && syncState
      ? { generation: activationGeneration, userId: activeUserId, state: syncState }
      : null;

  const isCurrentContext = (context: ActiveContext): boolean => {
    const identity = ports.auth.getIdentity();
    return (
      context.generation === activationGeneration &&
      context.userId === activeUserId &&
      context.state === syncState &&
      identity?.userId === context.userId &&
      ports.mode.getPrivacyMode() === 'managed'
    );
  };

  const persistSyncState = () => {
    if (!activeUserId || !syncState) return;
    ports.storage.setItem(`${USER_STATE_PREFIX}${activeUserId}`, JSON.stringify(syncState));
  };

  const apply = (settings: CloudSafeSettings) => {
    suppressSettingsEvents = true;
    try {
      ports.settings.applyProjection(settings);
    } finally {
      suppressSettingsEvents = false;
    }
  };

  const clearDebounce = () => {
    if (debounceHandle !== null) {
      clearTimeout(debounceHandle);
      debounceHandle = null;
    }
  };

  const deactivate = (restoreDeviceSettings: boolean) => {
    activationGeneration += 1;
    queuedPush = false;
    clearDebounce();
    abortController?.abort();
    abortController = null;
    const backup = deviceBackup;
    if (activeUserId && syncState) {
      syncState.localSnapshot = ports.settings.getProjection();
      persistSyncState();
    }
    activeUserId = null;
    syncState = null;
    deviceBackup = null;
    inFlight = null;
    if (restoreDeviceSettings && backup) {
      apply(backup.settings);
      ports.storage.removeItem(DEVICE_BACKUP_KEY);
      emit({ phase: 'idle', operation: 'restore' });
    }
  };

  const pull = async (
    context: ActiveContext,
    signal: AbortSignal,
    localRequestBase: CloudSafeSettings,
  ): Promise<void> => {
    const previousCursor = context.state.cursor;
    const response = await ports.client.pull(previousCursor, { signal });
    if (!isCurrentContext(context)) return;

    const advancedCursor = selectNextCursor(previousCursor, response.cursor);
    if (
      shouldApplyPulledSettings(
        advancedCursor,
        previousCursor,
        Object.keys(response.settings).length,
      )
    ) {
      const localCurrent = ports.settings.getProjection();
      const rebased = rebaseCloudSafeSettings(response.settings, localRequestBase, localCurrent);

      apply(response.settings);
      const serverLocalProjection = ports.settings.getProjection();
      apply(rebased.settings);
      const finalLocalProjection = ports.settings.getProjection();
      context.state.serverSnapshot = response.settings;
      context.state.localSnapshot = finalLocalProjection;
      context.state.lastSyncedSnapshot = snapshot(serverLocalProjection);
      context.state.updatedAt = rebased.hasLocalChanges
        ? (context.state.updatedAt ?? now().toISOString())
        : null;
      if (rebased.hasLocalChanges) queuedPush = true;
    }
    context.state.cursor = advancedCursor;
    persistSyncState();
    emit({ phase: 'success', operation: 'pull' });
  };

  interface PushResult {
    localRequestBase: CloudSafeSettings;
  }

  const push = async (context: ActiveContext, signal: AbortSignal): Promise<PushResult> => {
    const current = ports.settings.getProjection();
    const currentJson = snapshot(current);
    if (
      !shouldPushSettings(context.state.updatedAt, currentJson, context.state.lastSyncedSnapshot)
    ) {
      return { localRequestBase: current };
    }
    const dirtyAt = context.state.updatedAt;
    if (!dirtyAt) return { localRequestBase: current };
    const outgoing = mergeCloudSafeSettings(context.state.serverSnapshot, current);
    const response = await ports.client.push(
      { settings: outgoing, baseVersion: context.state.cursor },
      { signal },
    );
    if (!isCurrentContext(context)) return { localRequestBase: current };

    if (!response.applied) {
      context.state.lastSyncedSnapshot = currentJson;
      persistSyncState();
      return { localRequestBase: current };
    }

    context.state.cursor = selectNextCursor(context.state.cursor, response.cursor);
    context.state.lastSyncedSnapshot = currentJson;
    context.state.serverSnapshot = outgoing;
    context.state.localSnapshot = ports.settings.getProjection();
    if (snapshot(context.state.localSnapshot) === currentJson) {
      context.state.updatedAt = null;
    }
    persistSyncState();
    emit({ phase: 'success', operation: 'push' });
    return { localRequestBase: current };
  };

  const runSync = async (pullOnly = false): Promise<void> => {
    if (!isEligible() || !activeUserId || !syncState) return;
    if (inFlight) {
      if (!pullOnly) queuedPush = true;
      return inFlight;
    }
    const context = captureActiveContext();
    if (!context) return;
    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;
    emit({ phase: 'active' });
    const operation = (async () => {
      try {
        const pushResult = !pullOnly
          ? await push(context, controller.signal)
          : {
              localRequestBase: ports.settings.getProjection(),
            };
        await pull(context, controller.signal, pushResult.localRequestBase);
      } catch (error) {
        if (!isAbortError(error) && isCurrentContext(context)) emit({ phase: 'error', error });
      } finally {
        if (abortController === controller) abortController = null;
        if (isCurrentContext(context)) emit({ phase: 'idle' });
      }
    })();
    inFlight = operation;
    try {
      await operation;
    } finally {
      if (inFlight === operation) {
        inFlight = null;
        if (queuedPush && isCurrentContext(context)) {
          queuedPush = false;
          void runSync(false);
        }
      }
    }
  };

  const activate = () => {
    const identity = ports.auth.getIdentity();
    if (!identity || ports.mode.getPrivacyMode() !== 'managed') return;
    if (activeUserId === identity.userId) return;
    if (activeUserId) deactivate(true);

    activationGeneration += 1;
    activeUserId = identity.userId;
    syncState = readSyncState(ports.storage, identity.userId);
    const orphanedBackup = readDeviceBackup(ports.storage);
    if (orphanedBackup?.userId === identity.userId) {
      deviceBackup = orphanedBackup;
    } else {
      if (orphanedBackup) {
        apply(orphanedBackup.settings);
        ports.storage.removeItem(DEVICE_BACKUP_KEY);
      }
      deviceBackup = { userId: identity.userId, settings: ports.settings.getProjection() };
      ports.storage.setItem(DEVICE_BACKUP_KEY, JSON.stringify(deviceBackup));
    }

    const workingCopy =
      Object.keys(syncState.localSnapshot).length > 0
        ? syncState.localSnapshot
        : syncState.serverSnapshot;
    if (Object.keys(workingCopy).length > 0) {
      apply(workingCopy);
    }
    void runSync(true);
  };

  const reconcile = () => {
    if (isEligible()) activate();
    else if (activeUserId) deactivate(true);
  };

  const onSettingsChanged = () => {
    if (suppressSettingsEvents || !activeUserId || !syncState || !isEligible()) return;
    const current = ports.settings.getProjection();
    const currentJson = snapshot(current);
    if (currentJson === snapshot(syncState.localSnapshot)) return;
    syncState.localSnapshot = current;
    syncState.updatedAt = now().toISOString();
    persistSyncState();
    clearDebounce();
    debounceHandle = setTimeout(() => {
      debounceHandle = null;
      void runSync(false);
    }, debounceMs);
  };

  return {
    start() {
      if (started) return;
      started = true;
      const orphanedBackup = readDeviceBackup(ports.storage);
      if (orphanedBackup && ports.mode.getPrivacyMode() !== 'managed') {
        apply(orphanedBackup.settings);
        ports.storage.removeItem(DEVICE_BACKUP_KEY);
      }
      unsubscribers.push(
        ports.mode.subscribe(reconcile),
        ports.auth.subscribe(reconcile),
        ports.settings.subscribe(onSettingsChanged),
      );
      reconcile();
    },

    stop() {
      if (!started) return;
      started = false;
      deactivate(true);
      while (unsubscribers.length > 0) unsubscribers.pop()?.();
    },

    syncNow() {
      return runSync(false);
    },
  };
}

type DesktopSettingsSnapshot = ReturnType<typeof useSettingsStore.getState>;

function cloudTheme(theme: Theme): 'light' | 'dark' | 'system' | undefined {
  return theme === 'light' || theme === 'dark' || theme === 'system' ? theme : undefined;
}

function cloudFont(font: ChatFont | undefined): 'default' | 'system' | 'dyslexic' | undefined {
  if (font === 'default' || font === 'dyslexic') return font;
  if (font === 'sans') return 'system';
  return undefined;
}

export function projectDesktopCloudSafeSettings(
  state: Pick<DesktopSettingsSnapshot, 'windowPreferences' | 'chatPreferences' | 'personalization'>,
): CloudSafeSettings {
  const appearance: Record<string, unknown> = {};
  const theme = cloudTheme(state.windowPreferences.theme);
  const font = cloudFont(state.windowPreferences.chatFont);
  if (theme) appearance['theme'] = theme;
  if (font) appearance['font'] = font;
  return {
    appearance,
    personalization: {
      fullName: state.personalization.name,
      occupation: state.personalization.occupation,
      warmth: state.personalization.warmth * 20,
    },
    language: { locale: state.windowPreferences.language },
    capabilities: {
      memory: state.chatPreferences.memoryEnabled === true,
      allowToolAssistedGeneration: state.chatPreferences.allowToolAssistedMemoryGeneration === true,
    },
    chat: { compactMode: state.chatPreferences.compactMode },
    editor: { promptCompletionEnabled: state.chatPreferences.promptCompletionEnabled },
  };
}

const DESKTOP_LANGUAGES = new Set<Language>([
  'en',
  'es',
  'zh',
  'ja',
  'ko',
  'fr',
  'de',
  'pt',
  'it',
  'ru',
  'ar',
  'hi',
]);

export function applyDesktopCloudSafeSettings(settings: CloudSafeSettings): void {
  const store = useSettingsStore.getState();
  const theme = settings.appearance?.['theme'];
  if (theme === 'light' || theme === 'dark' || theme === 'system') store.setTheme(theme);
  const font = settings.appearance?.['font'];
  if (font === 'default' || font === 'dyslexic') store.setChatFont(font);
  if (font === 'system') store.setChatFont('sans');

  const personalization: Partial<DesktopSettingsSnapshot['personalization']> = {};
  const fullName = settings.personalization?.['fullName'];
  const occupation = settings.personalization?.['occupation'];
  const warmth = settings.personalization?.['warmth'];
  if (typeof fullName === 'string') personalization.name = fullName;
  if (typeof occupation === 'string') personalization.occupation = occupation;
  if (typeof warmth === 'number' && Number.isFinite(warmth)) {
    personalization.warmth = Math.max(1, Math.min(5, Math.round(warmth / 20)));
  }
  if (Object.keys(personalization).length > 0) store.setPersonalization(personalization);

  const locale = settings.language?.['locale'];
  if (typeof locale === 'string' && DESKTOP_LANGUAGES.has(locale as Language)) {
    store.setLanguage(locale as Language);
  }
  const compactMode = settings.chat?.['compactMode'];
  if (typeof compactMode === 'boolean') store.setCompactMode(compactMode);
  const promptCompletionEnabled = settings.editor?.['promptCompletionEnabled'];
  if (typeof promptCompletionEnabled === 'boolean') {
    store.setPromptCompletionEnabled(promptCompletionEnabled);
  }

  const memoryEnabled = settings.capabilities?.['memory'];
  const allowToolAssistedGeneration = settings.capabilities?.['allowToolAssistedGeneration'];
  if (typeof memoryEnabled === 'boolean' || typeof allowToolAssistedGeneration === 'boolean') {
    useSettingsStore.setState((state) => ({
      chatPreferences: {
        ...state.chatPreferences,
        ...(typeof memoryEnabled === 'boolean'
          ? { memoryEnabled, autoSaveMemories: memoryEnabled }
          : {}),
        ...(typeof allowToolAssistedGeneration === 'boolean'
          ? {
              allowToolAssistedMemoryGeneration: allowToolAssistedGeneration,
            }
          : {}),
      },
    }));
    const appliedPreferences = useSettingsStore.getState().chatPreferences;
    if (typeof memoryEnabled === 'boolean' || typeof allowToolAssistedGeneration === 'boolean') {
      void configureMemoryInjection(
        appliedPreferences.memoryEnabled === true,
        10,
        5,
        appliedPreferences.allowToolAssistedMemoryGeneration === true,
      ).catch((error) => {
        console.error('Failed to apply synced native memory policy:', error);
      });
    }
    void useSettingsStore
      .getState()
      .saveSettings()
      .catch((error) => {
        console.error('Failed to persist synced native memory policy:', error);
      });
  }
}

function createSettingsOperationClient(operation: 'pull' | 'push'): ManagedCloudSettingsClient {
  const request = createManagedCloudRequestContext(`Managed Cloud settings ${operation}`);
  return createManagedCloudSettingsClient({
    baseUrl: WEB_APP_URL,
    getHeaders: () => request.getHeaders(),
    fetchImpl: (input, init) =>
      request.fetch(input, {
        ...init,
        credentials: 'include',
      }),
  });
}

export function createDesktopManagedCloudSettingsClient(): ManagedCloudSettingsClient {
  return {
    pull: (cursor, options) => createSettingsOperationClient('pull').pull(cursor, options),
    push: (input, options) => createSettingsOperationClient('push').push(input, options),
  };
}

export function initManagedCloudSettingsSync(): () => void {
  const coordinator = createManagedCloudSettingsSyncCoordinator({
    client: createDesktopManagedCloudSettingsClient(),
    mode: {
      getPrivacyMode: () => selectPrivacyMode(useAppModeStore.getState()),
      subscribe: (listener) => useAppModeStore.subscribe(listener),
    },
    auth: {
      getIdentity: () => {
        const state = cloudAccountAuth.getState();
        return state.user && state.session?.access_token ? { userId: state.user.id } : null;
      },
      subscribe: (listener) => cloudAccountAuth.onAuthStateChange(listener),
    },
    settings: {
      getProjection: () => projectDesktopCloudSafeSettings(useSettingsStore.getState()),
      applyProjection: applyDesktopCloudSafeSettings,
      subscribe: (listener) =>
        useSettingsStore.subscribe(
          (state) => snapshot(projectDesktopCloudSafeSettings(state)),
          () => listener(),
        ),
    },
    storage: typeof window === 'undefined' ? storageFallback : window.localStorage,
    onEvent: (event) => {
      if (event.phase !== 'error') return;
      const error = event.error instanceof Error ? event.error : new Error(String(event.error));
      console.warn('[managedCloudSettingsSync] synchronization failed:', error);
      errorTracking.captureError(error, {
        component: 'managed-cloud-settings-sync',
        severity: ErrorSeverity.MEDIUM,
      });
    },
  });
  coordinator.start();
  return () => coordinator.stop();
}
