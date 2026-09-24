'use client';

import { create } from 'zustand';

export interface ActiveUpload {
  id: string;
  label: string;
}

interface ActiveUploadState {
  uploads: ActiveUpload[];
  begin: (upload: ActiveUpload) => void;
  end: (id: string) => void;
}

// An upload lives in the panel that started it, so nothing outside that panel
// could tell it was running. Scope changes and sign-out both discard it.
export const useActiveUploadStore = create<ActiveUploadState>((set) => ({
  uploads: [],
  begin: (upload) =>
    set((state) => ({
      uploads: state.uploads.some((entry) => entry.id === upload.id)
        ? state.uploads
        : [...state.uploads, upload],
    })),
  end: (id) =>
    set((state) => {
      const uploads = state.uploads.filter((entry) => entry.id !== id);
      return uploads.length === state.uploads.length ? state : { uploads };
    }),
}));

let uploadSequence = 0;

export function beginActiveUpload(label: string): () => void {
  uploadSequence += 1;
  const id = `upload-${uploadSequence}`;
  useActiveUploadStore.getState().begin({ id, label });
  return () => useActiveUploadStore.getState().end(id);
}

export function useActiveUploads(): ActiveUpload[] {
  return useActiveUploadStore((state) => state.uploads);
}
