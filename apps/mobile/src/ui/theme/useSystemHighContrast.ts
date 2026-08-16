import { useCallback, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform, type EmitterSubscription } from 'react-native';

type NativePlatform = 'android' | 'ios' | 'other';

interface HighContrastStore {
  enabled: boolean;
  eventRevision: number;
  generation: number;
  listeners: Set<() => void>;
  nativeSubscription: EmitterSubscription | null;
}

const stores = new Map<NativePlatform, HighContrastStore>();

function normalizePlatform(platform: string): NativePlatform {
  if (platform === 'android' || platform === 'ios') return platform;
  return 'other';
}

function getStore(platform: NativePlatform): HighContrastStore {
  const existing = stores.get(platform);
  if (existing) return existing;

  const created: HighContrastStore = {
    enabled: false,
    eventRevision: 0,
    generation: 0,
    listeners: new Set(),
    nativeSubscription: null,
  };
  stores.set(platform, created);
  return created;
}

export async function readSystemHighContrast(platform: string = Platform.OS): Promise<boolean> {
  try {
    switch (normalizePlatform(platform)) {
      case 'android':
        return (await AccessibilityInfo.isHighTextContrastEnabled()) === true;
      case 'ios':
        return (await AccessibilityInfo.isDarkerSystemColorsEnabled()) === true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

export function subscribeSystemHighContrast(
  onChange: (enabled: boolean) => void,
  platform: string = Platform.OS,
): EmitterSubscription | null {
  try {
    switch (normalizePlatform(platform)) {
      case 'android':
        return AccessibilityInfo.addEventListener('highTextContrastChanged', onChange);
      case 'ios':
        return AccessibilityInfo.addEventListener('darkerSystemColorsChanged', onChange);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function updateStore(store: HighContrastStore, enabled: boolean): void {
  if (store.enabled === enabled) return;
  store.enabled = enabled;
  store.listeners.forEach((listener) => listener());
}

function startStore(store: HighContrastStore, platform: NativePlatform): void {
  const generation = ++store.generation;
  const eventRevision = store.eventRevision;
  store.nativeSubscription = subscribeSystemHighContrast((enabled) => {
    store.eventRevision += 1;
    updateStore(store, enabled);
  }, platform);
  void readSystemHighContrast(platform).then((enabled) => {
    if (store.generation === generation && store.eventRevision === eventRevision) {
      updateStore(store, enabled);
    }
  });
}

function stopStore(store: HighContrastStore): void {
  store.generation += 1;
  store.nativeSubscription?.remove();
  store.nativeSubscription = null;
  store.enabled = false;
}

function subscribeStore(platform: NativePlatform, listener: () => void): () => void {
  const store = getStore(platform);
  if (store.listeners.size === 0) startStore(store, platform);
  store.listeners.add(listener);

  return () => {
    store.listeners.delete(listener);
    if (store.listeners.size === 0) stopStore(store);
  };
}

export function useSystemHighContrast(platform: string = Platform.OS): boolean {
  const normalizedPlatform = normalizePlatform(platform);
  const subscribe = useCallback(
    (listener: () => void) => subscribeStore(normalizedPlatform, listener),
    [normalizedPlatform],
  );
  const getSnapshot = useCallback(() => getStore(normalizedPlatform).enabled, [normalizedPlatform]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
