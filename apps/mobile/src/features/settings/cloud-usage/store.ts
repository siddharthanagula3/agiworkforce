import { create } from 'zustand';
import { fetchUsageSnapshot, type UsageSnapshot } from '@/services/usage';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';

interface CloudUsageState {
  ownerId: string | null;
  snapshot: UsageSnapshot | null;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
  refresh: () => Promise<void>;
  clear: () => void;
}

let requestGeneration = 0;
let pendingRequest: { account: CloudAccountEpoch; promise: Promise<void> } | null = null;

export const useCloudUsageStore = create<CloudUsageState>()((set, get) => ({
  ownerId: null,
  snapshot: null,
  loading: false,
  error: null,
  updatedAt: null,

  refresh: () => {
    const account = captureCloudAccountEpoch();
    if (!account) {
      get().clear();
      return Promise.resolve();
    }
    if (
      pendingRequest?.account.ownerId === account.ownerId &&
      pendingRequest.account.epoch === account.epoch
    ) {
      return pendingRequest.promise;
    }

    const generation = ++requestGeneration;
    set((state) => ({
      ownerId: account.ownerId,
      snapshot: state.ownerId === account.ownerId ? state.snapshot : null,
      updatedAt: state.ownerId === account.ownerId ? state.updatedAt : null,
      loading: true,
      error: null,
    }));
    const promise = (async () => {
      try {
        const snapshot = await fetchUsageSnapshot();
        if (!isCloudAccountEpochCurrent(account) || generation !== requestGeneration) return;
        set({ snapshot, loading: false, error: null, updatedAt: Date.now() });
      } catch {
        if (!isCloudAccountEpochCurrent(account) || generation !== requestGeneration) return;
        set({
          loading: false,
          error: 'Could not load usage. Retry to see your current plan and limits.',
        });
      } finally {
        if (generation === requestGeneration) pendingRequest = null;
      }
    })();
    pendingRequest = { account, promise };
    return promise;
  },

  clear: () => {
    requestGeneration += 1;
    pendingRequest = null;
    set({ ownerId: null, snapshot: null, loading: false, error: null, updatedAt: null });
  },
}));
