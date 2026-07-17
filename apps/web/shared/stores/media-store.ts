'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type MediaJobStatus = 'pending' | 'generating' | 'completed' | 'failed';
export type MediaJobType = 'image' | 'video';

export interface MediaJob {
  id: string;
  type: MediaJobType;
  prompt: string;
  status: MediaJobStatus;
  resultUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
  provider?: string;
  size?: string;
  createdAt: string;
  completedAt?: string;
}

interface MediaState {
  jobs: MediaJob[];
  addJob: (job: MediaJob) => void;
  updateJob: (id: string, updates: Partial<MediaJob>) => void;
  removeJob: (id: string) => void;
  clearCompleted: () => void;
}

export const useMediaStore = create<MediaState>()(
  persist(
    (set) => ({
      jobs: [],

      addJob: (job) =>
        set((state) => ({
          // Keep at most 50 jobs
          jobs: [job, ...state.jobs].slice(0, 50),
        })),

      updateJob: (id, updates) =>
        set((state) => ({
          jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...updates } : j)),
        })),

      removeJob: (id) => set((state) => ({ jobs: state.jobs.filter((j) => j.id !== id) })),

      clearCompleted: () =>
        set((state) => ({ jobs: state.jobs.filter((j) => j.status !== 'completed') })),
    }),
    {
      name: 'agiworkforce-web-media',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist completed jobs — not in-flight ones
        jobs: state.jobs.filter((j) => j.status === 'completed').slice(0, 20),
      }),
    },
  ),
);
