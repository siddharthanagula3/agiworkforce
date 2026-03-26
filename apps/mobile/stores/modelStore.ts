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
  /** Whether extended thinking / reasoning mode is toggled on (legacy — kept for compat). */
  thinkingModeEnabled: boolean;
  /** Per-model thinking toggle state. Key = model id, value = enabled. */
  thinkingEnabledPerModel: Record<string, boolean>;

  // -- Actions --

  /** Select a model (or auto-mode). Also pushes it into recents. */
  setModel: (modelId: string) => void;
  /** Set the active provider filter in the picker UI. */
  setProvider: (providerId: string) => void;
  /** Toggle a model in / out of favorites. */
  toggleFavorite: (modelId: string) => void;
  /** Toggle thinking mode on / off (legacy). */
  setThinkingMode: (enabled: boolean) => void;
  /** Toggle thinking for a specific model. Only works if model supports thinking. */
  toggleThinkingForModel: (modelId: string) => void;
  /** Check if thinking is enabled for the currently selected model. */
  isThinkingEnabledForSelected: () => boolean;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      selectedModel: 'auto-balanced',
      selectedProvider: 'managed_cloud',
      favorites: [],
      recentModels: [],
      thinkingModeEnabled: false,
      thinkingEnabledPerModel: {},

      setModel: (modelId: string) => {
        const prev = get().recentModels.filter((id) => id !== modelId);
        const recentModels = [modelId, ...prev].slice(0, MAX_RECENT);

        // Sync legacy thinkingModeEnabled with per-model state.
        const perModel = get().thinkingEnabledPerModel;
        const thinkingModeEnabled = perModel[modelId] ?? false;

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

      toggleThinkingForModel: (modelId: string) => {
        // Auto modes don't have thinking state
        if (isAutoMode(modelId)) return;

        // Only toggle for models that support thinking.
        const model = getModelById(modelId);
        if (model && !model.supportsThinking) return;

        const current = get().thinkingEnabledPerModel;
        const next = { ...current, [modelId]: !current[modelId] };
        const updates: Partial<ModelState> = { thinkingEnabledPerModel: next };

        // If toggling the currently selected model, sync legacy field.
        if (get().selectedModel === modelId) {
          updates.thinkingModeEnabled = next[modelId] ?? false;
        }
        set(updates as Partial<ModelState>);
      },

      isThinkingEnabledForSelected: () => {
        const { selectedModel, thinkingEnabledPerModel } = get();
        return thinkingEnabledPerModel[selectedModel] ?? false;
      },
    }),
    {
      name: 'model-store',
      storage: createJSONStorage(() => mmkvStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[modelStore] Hydration failed:', error);
      },
    },
  ),
);
