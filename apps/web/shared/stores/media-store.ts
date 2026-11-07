'use client';

import type { LifecycleStatus } from '@agiworkforce/types';
import { create } from 'zustand';
import type { SessionAuthority } from '@/lib/identity/request-authority';

export type MediaJobStatus =
  Extract<LifecycleStatus, 'pending' | 'completed' | 'failed'> | 'generating';
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

export interface OwnedMediaJob extends MediaJob {
  readonly owner: SessionAuthority;
}

interface MediaState {
  jobs: OwnedMediaJob[];
  addJob: (job: MediaJob, owner: SessionAuthority) => void;
  updateJob: (id: string, updates: Partial<MediaJob>) => void;
  retireStaleJobs: () => void;
  reset: () => void;
}

/**
 * In-flight media jobs for the current tab only. The finished work lives in the
 * transcript and the Library, which are the surfaces that survive a reload;
 * this store answers one question, whether a media job is running right now,
 * so it is not persisted.
 */
export const useMediaStore = create<MediaState>()((set) => ({
  jobs: [],

  reset: () => set({ jobs: [] }),

  addJob: (job, owner) =>
    set((state) => owner.isCurrent()
      ? { jobs: [{ ...job, owner }, ...state.jobs].slice(0, 50) }
      : state),

  retireStaleJobs: () =>
    set((state) => {
      const jobs = state.jobs.filter((job) => job.owner.isCurrent());
      return jobs.length === state.jobs.length ? state : { jobs };
    }),

  updateJob: (id, updates) =>
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...updates } : j)),
    })),
}));
