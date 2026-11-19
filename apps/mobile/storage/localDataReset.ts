import { create } from 'zustand';

function mmkv(): typeof import('@/lib/mmkv') {
  // Loaded on demand: lib/mmkv reports into this module, so a static import
  // would be a require cycle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/lib/mmkv') as typeof import('@/lib/mmkv');
}

/**
 * Local data that was set aside because this phone has no key for it, which is
 * what a backup restored from another phone looks like: the keys live in the
 * keychain as this-device-only and never travel with the backup.
 */
export type LocalDataResetKind = 'chats' | 'memory';

const KINDS: readonly LocalDataResetKind[] = ['chats', 'memory'];
const PENDING_KEY = 'agi-local-data-reset-pending-v1';

interface LocalDataResetState {
  pending: LocalDataResetKind[];
}

export const useLocalDataResetStore = create<LocalDataResetState>()(() => ({ pending: [] }));

function ordered(kinds: readonly LocalDataResetKind[]): LocalDataResetKind[] {
  return KINDS.filter((kind) => kinds.includes(kind));
}

function persistedKinds(): LocalDataResetKind[] {
  const raw = mmkv().storage.getString(PENDING_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? ordered(parsed as LocalDataResetKind[]) : [];
  } catch {
    return [];
  }
}

function publish(kinds: readonly LocalDataResetKind[]): void {
  const pending = ordered(kinds);
  const { storage } = mmkv();
  if (pending.length > 0) storage.set(PENDING_KEY, JSON.stringify(pending));
  else storage.delete(PENDING_KEY);
  useLocalDataResetStore.setState({ pending });
}

function mergePersisted(): void {
  mmkv().whenMmkvReady(() => {
    publish([...persistedKinds(), ...useLocalDataResetStore.getState().pending]);
  });
}

export function reportLocalDataReset(kind: LocalDataResetKind): void {
  useLocalDataResetStore.setState((state) => ({ pending: ordered([...state.pending, kind]) }));
  mergePersisted();
}

export function loadPendingLocalDataReset(): void {
  mergePersisted();
}

export function acknowledgeLocalDataReset(kinds: readonly LocalDataResetKind[]): void {
  const pending = [...persistedKinds(), ...useLocalDataResetStore.getState().pending];
  publish(pending.filter((kind) => !kinds.includes(kind)));
}
