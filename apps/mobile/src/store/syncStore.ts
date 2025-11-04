import { create } from 'zustand';
import { syncService, type SyncRecord } from '../services/sync';
import { useAuthStore } from './authStore';

interface SyncState {
  records: SyncRecord[];
  lastPulledAt: number;
  syncing: boolean;
  error: string | null;
  appendRecord: (record: SyncRecord) => void;
  push: (type: string, data: Record<string, unknown>) => Promise<void>;
  pull: () => Promise<void>;
  clear: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  records: [],
  lastPulledAt: 0,
  syncing: false,
  error: null,
  appendRecord(record) {
    set((state) => ({
      records: [...state.records, record].sort((a, b) => a.timestamp - b.timestamp),
    }));
  },
  async push(type, data) {
    const token = useAuthStore.getState().token;
    const deviceId = useAuthStore.getState().deviceId ?? 'mobile';
    if (!token) {
      throw new Error('Not authenticated');
    }
    await syncService.push(token, { type, data, deviceId });
  },
  async pull() {
    const token = useAuthStore.getState().token;
    const deviceId = useAuthStore.getState().deviceId ?? 'mobile';
    if (!token) {
      return;
    }
    set({ syncing: true, error: null });
    try {
      const { data, timestamp } = await syncService.pull(token, get().lastPulledAt, deviceId);
      if (data.length > 0) {
        set((state) => ({
          records: [...state.records, ...data].sort((a, b) => a.timestamp - b.timestamp),
          lastPulledAt: timestamp,
          syncing: false,
          error: null,
        }));
      } else {
        set({ lastPulledAt: timestamp, syncing: false, error: null });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync data';
      set({ syncing: false, error: message });
    }
  },
  async clear() {
    const token = useAuthStore.getState().token;
    if (!token) {
      return;
    }
    await syncService.clear(token);
    set({ records: [], lastPulledAt: 0, error: null });
  },
}));
