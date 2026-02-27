import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';
import { isAutoMode, getModelById } from '@/lib/models';

/** Maximum number of entries kept in the recent-models list. */
const MAX_RECENT = 5;

interface ModelState {
  /** Currently selected model or auto-mode id. */
  selectedModel: string;
  /** Current provider filter (used by UI for display context). */
  selectedProvider: string;
  /** User-favorited model ids. */
  favorites: string[];
  /** Most recently used model ids (newest first, de-duped). */
  recentModels: string[];
  /** Whether extended thinking / reasoning mode is toggled on. */
  thinkingModeEnabled: boolean;

  // -- Actions --

  /** Select a model (or auto-mode). Also pushes it into recents. */
  setModel: (modelId: string) => void;
  /** Set the active provider filter in the picker UI. */
  setProvider: (providerId: string) => void;
  /** Toggle a model in / out of favorites. */
  toggleFavorite: (modelId: string) => void;
  /** Toggle thinking mode on / off. */
  setThinkingMode: (enabled: boolean) => void;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      selectedModel: 'auto-balanced',
      selectedProvider: 'managed_cloud',
      favorites: [],
      recentModels: [],
      thinkingModeEnabled: false,

      setModel: (modelId: string) => {
        const prev = get().recentModels.filter((id) => id !== modelId);
        const recentModels = [modelId, ...prev].slice(0, MAX_RECENT);

        // When selecting a model that does not support thinking, turn it off.
        const model = getModelById(modelId);
        const thinkingModeEnabled =
          model?.supportsThinking === false ? false : get().thinkingModeEnabled;

        set({ selectedModel: modelId, recentModels, thinkingModeEnabled });
      },

      setProvider: (providerId: string) => {
        set({ selectedProvider: providerId });
      },

      toggleFavorite: (modelId: string) => {
        const current = get().favorites;
        const next = current.includes(modelId)
          ? current.filter((id) => id !== modelId)
          : [...current, modelId];
        set({ favorites: next });
      },

      setThinkingMode: (enabled: boolean) => {
        // Only allow enabling if the current model supports thinking.
        const { selectedModel } = get();
        if (enabled && !isAutoMode(selectedModel)) {
          const model = getModelById(selectedModel);
          if (model && !model.supportsThinking) return;
        }
        set({ thinkingModeEnabled: enabled });
      },
    }),
    {
      name: 'model-store',
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
