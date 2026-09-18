import { create } from 'zustand';

export type UploadPhase = 'uploading' | 'canceled' | 'failed' | 'done';

export interface UploadLifecycleEntry {
  phase: UploadPhase;
  /** 0 to 1. Stays at its last reading while a retry waits to start. */
  progress: number;
  attempt: number;
  error?: string;
  /** The app was backgrounded while this upload was still in flight. */
  interrupted: boolean;
}

export interface UploadLifecycleState {
  uploads: Record<string, UploadLifecycleEntry>;
  begin: (id: string) => AbortSignal;
  reportProgress: (id: string, sentBytes: number, totalBytes: number) => void;
  settle: (id: string, phase: Exclude<UploadPhase, 'uploading'>, error?: string) => void;
  cancel: (id: string) => void;
  markBackgrounded: () => void;
  clear: (id: string) => void;
  reset: () => void;
}

const controllers = new Map<string, AbortController>();

export const RESUMABLE_UPLOAD_PHASES: ReadonlySet<UploadPhase> = new Set(['failed', 'canceled']);

export function isResumable(entry: UploadLifecycleEntry | undefined): boolean {
  return entry !== undefined && RESUMABLE_UPLOAD_PHASES.has(entry.phase);
}

export function uploadStatusLabel(entry: UploadLifecycleEntry | undefined): string | null {
  if (!entry) return null;
  switch (entry.phase) {
    case 'uploading':
      return `Uploading ${Math.round(entry.progress * 100)}%`;
    case 'canceled':
      return 'Upload canceled';
    case 'failed':
      return entry.interrupted ? 'Upload stopped in the background' : 'Upload failed';
    case 'done':
      return 'Uploaded';
  }
}

export const useUploadLifecycleStore = create<UploadLifecycleState>()((set, get) => ({
  uploads: {},

  begin: (id) => {
    controllers.get(id)?.abort();
    const controller = new AbortController();
    controllers.set(id, controller);
    const attempt = (get().uploads[id]?.attempt ?? 0) + 1;
    set((state) => ({
      uploads: {
        ...state.uploads,
        [id]: { phase: 'uploading', progress: 0, attempt, interrupted: false },
      },
    }));
    return controller.signal;
  },

  reportProgress: (id, sentBytes, totalBytes) => {
    const entry = get().uploads[id];
    if (!entry || entry.phase !== 'uploading') return;
    const ratio = totalBytes > 0 ? sentBytes / totalBytes : 0;
    const progress = Math.min(1, Math.max(0, ratio));
    if (progress <= entry.progress) return;
    set((state) => ({ uploads: { ...state.uploads, [id]: { ...entry, progress } } }));
  },

  settle: (id, phase, error) => {
    controllers.delete(id);
    const entry = get().uploads[id];
    if (!entry) return;
    set((state) => ({
      uploads: {
        ...state.uploads,
        [id]: {
          ...entry,
          phase,
          progress: phase === 'done' ? 1 : entry.progress,
          ...(error ? { error } : {}),
        },
      },
    }));
  },

  cancel: (id) => {
    controllers.get(id)?.abort();
    controllers.delete(id);
    const entry = get().uploads[id];
    if (!entry || entry.phase !== 'uploading') return;
    set((state) => ({
      uploads: { ...state.uploads, [id]: { ...entry, phase: 'canceled' } },
    }));
  },

  markBackgrounded: () => {
    const { uploads } = get();
    const interrupted = Object.entries(uploads).filter(([, entry]) => entry.phase === 'uploading');
    if (interrupted.length === 0) return;
    set((state) => ({
      uploads: {
        ...state.uploads,
        ...Object.fromEntries(
          interrupted.map(([id, entry]) => [id, { ...entry, interrupted: true }]),
        ),
      },
    }));
  },

  clear: (id) => {
    controllers.get(id)?.abort();
    controllers.delete(id);
    set((state) => {
      if (!(id in state.uploads)) return state;
      const next = { ...state.uploads };
      delete next[id];
      return { uploads: next };
    });
  },

  reset: () => {
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
    set({ uploads: {} });
  },
}));
