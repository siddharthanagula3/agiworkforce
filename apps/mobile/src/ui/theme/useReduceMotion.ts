import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, type EmitterSubscription } from 'react-native';

interface ReduceMotionStore {
  enabled: boolean;
  eventRevision: number;
  generation: number;
  listeners: Set<() => void>;
  nativeSubscription: EmitterSubscription | null;
}

const store: ReduceMotionStore = {
  enabled: false,
  eventRevision: 0,
  generation: 0,
  listeners: new Set(),
  nativeSubscription: null,
};

export async function readReduceMotion(): Promise<boolean> {
  try {
    return (await AccessibilityInfo.isReduceMotionEnabled()) === true;
  } catch {
    return false;
  }
}

export function subscribeReduceMotion(
  onChange: (enabled: boolean) => void,
): EmitterSubscription | null {
  try {
    return AccessibilityInfo.addEventListener('reduceMotionChanged', onChange);
  } catch {
    return null;
  }
}

function update(enabled: boolean): void {
  if (store.enabled === enabled) return;
  store.enabled = enabled;
  store.listeners.forEach((listener) => listener());
}

function start(): void {
  const generation = ++store.generation;
  const eventRevision = store.eventRevision;
  store.nativeSubscription = subscribeReduceMotion((enabled) => {
    store.eventRevision += 1;
    update(enabled === true);
  });
  void readReduceMotion().then((enabled) => {
    if (store.generation === generation && store.eventRevision === eventRevision) {
      update(enabled);
    }
  });
}

function stop(): void {
  store.generation += 1;
  store.nativeSubscription?.remove();
  store.nativeSubscription = null;
  // Keep the last known value: the next mount must not play a full animation
  // while the async re-read is still in flight.
}

function subscribe(listener: () => void): () => void {
  if (store.listeners.size === 0) start();
  store.listeners.add(listener);

  return () => {
    store.listeners.delete(listener);
    if (store.listeners.size === 0) stop();
  };
}

function getSnapshot(): boolean {
  return store.enabled;
}

export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
