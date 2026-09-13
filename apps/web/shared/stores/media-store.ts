'use client';

import { create } from 'zustand';

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
}

/**
 * In-flight media jobs for the current tab only. The finished work lives in the
 * transcript and the Library, which are the surfaces that survive a reload;
 * this store answers one question, whether a media job is running right now.
 * It used to persist completed jobs to localStorage, but the only selector
 * reads pending and generating, which persistence deliberately dropped, so
 * every rehydrated entry was unreadable by construction.
 */
export const useMediaStore = create<MediaState>()((set) => ({
  jobs: [],

  addJob: (job) =>
    set((state) => ({
      jobs: [job, ...state.jobs].slice(0, 50),
    })),

  updateJob: (id, updates) =>
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...updates } : j)),
    })),
}));
