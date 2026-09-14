'use client';

import { create } from 'zustand';

interface CloudSettingsSyncStatus {
  error: string | null;
  retry: (() => void) | null;
  setStatus: (error: string | null, retry: (() => void) | null) => void;
}

export const useCloudSettingsSyncStatusStore = create<CloudSettingsSyncStatus>()((set) => ({
  error: null,
  retry: null,
  setStatus: (error, retry) => set({ error, retry }),
}));

export function useCloudSettingsSyncStatus(): Pick<CloudSettingsSyncStatus, 'error' | 'retry'> {
  const error = useCloudSettingsSyncStatusStore((state) => state.error);
  const retry = useCloudSettingsSyncStatusStore((state) => state.retry);
  return { error, retry };
}
