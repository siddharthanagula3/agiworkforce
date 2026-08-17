import { create } from 'zustand';

export type MediaKind = 'image' | 'video';
export type MediaMode = 'text' | MediaKind;

export interface MediaGenerationSupport {
  image: boolean;
  video: boolean;
}

interface MediaModeState {
  mediaMode: MediaMode;
  setMediaMode: (mode: MediaMode) => void;
  toggleMediaMode: (kind: MediaKind) => void;
  exitMediaMode: () => void;
}

export const useMediaModeStore = create<MediaModeState>()((set, get) => ({
  mediaMode: 'text',
  setMediaMode: (mode) => set({ mediaMode: mode }),
  toggleMediaMode: (kind) => set({ mediaMode: get().mediaMode === kind ? 'text' : kind }),
  exitMediaMode: () => set({ mediaMode: 'text' }),
}));

export const selectMediaMode = (state: MediaModeState): MediaMode => state.mediaMode;

export function supportedMediaKinds(support: MediaGenerationSupport): MediaKind[] {
  return (['image', 'video'] as const).filter((kind) => support[kind]);
}

export function resolveSendMediaKind(
  mode: MediaMode,
  support: MediaGenerationSupport,
): MediaKind | null {
  return mode !== 'text' && support[mode] ? mode : null;
}
