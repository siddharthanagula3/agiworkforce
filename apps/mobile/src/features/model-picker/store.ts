import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { normalizeModelId } from '@agiworkforce/types';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import {
  DEFAULT_LOCAL_MODEL_ID,
  getDefaultSelectableModelId,
  getModelById,
  isAutoMode,
  isSelectableModelId,
} from './service';

/** Maximum number of entries kept in the recent-models list. */
const MAX_RECENT = 5;

function normalizeSelectableModelId(modelId: string): string | null {
  const resolvedModelId = normalizeModelId(modelId) ?? modelId;
  return isSelectableModelId(resolvedModelId) ? resolvedModelId : null;
}

function filterSelectableModelIds(ids: string[]): string[] {
  return ids.filter((id) => isSelectableModelId(id));
}

function filterThinkingState(
  thinkingEnabledPerModel: Record<string, boolean> | undefined,
): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(thinkingEnabledPerModel ?? {}).filter(([id]) => isSelectableModelId(id)),
  );
}

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
      selectedModel: DEFAULT_LOCAL_MODEL_ID,
      selectedProvider: 'local',
      favorites: [],
      recentModels: [],
      thinkingModeEnabled: false,
      thinkingEnabledPerModel: {},

      setModel: (modelId: string) => {
        const resolvedModelId = normalizeSelectableModelId(modelId);
        if (!resolvedModelId) return;

        const prev = get().recentModels.filter((id) => id !== resolvedModelId);
        const recentModels = [resolvedModelId, ...prev].slice(0, MAX_RECENT);

        // Sync legacy thinkingModeEnabled with per-model state.
        const perModel = get().thinkingEnabledPerModel;
        const thinkingModeEnabled = perModel[resolvedModelId] ?? false;

        set({
          selectedModel: resolvedModelId,
          selectedProvider: 'local',
          recentModels,
          thinkingModeEnabled,
        });
      },

      setProvider: (providerId: string) => {
        void providerId;
        set({ selectedProvider: 'local' });
      },

      toggleFavorite: (modelId: string) => {
        const resolvedModelId = normalizeSelectableModelId(modelId);
        if (!resolvedModelId || isAutoMode(resolvedModelId)) return;

        const current = get().favorites;
        const next = current.includes(resolvedModelId)
          ? current.filter((id) => id !== resolvedModelId)
          : [...current, resolvedModelId];
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
        const resolvedModelId = normalizeSelectableModelId(modelId);
        if (!resolvedModelId) return;

        // Auto modes don't have thinking state
        if (isAutoMode(resolvedModelId)) return;

        // Only toggle for models that support thinking.
        const model = getModelById(resolvedModelId);
        if (model && !model.supportsThinking) return;

        const current = get().thinkingEnabledPerModel;
        const next = { ...current, [resolvedModelId]: !current[resolvedModelId] };
        const updates: Partial<ModelState> = { thinkingEnabledPerModel: next };

        // If toggling the currently selected model, sync legacy field.
        if (get().selectedModel === resolvedModelId) {
          updates.thinkingModeEnabled = next[resolvedModelId] ?? false;
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
      merge: (persisted, current) => {
        const persistedState = (persisted ?? {}) as Partial<ModelState>;
        const selectedModel = getDefaultSelectableModelId(persistedState.selectedModel);
        const thinkingEnabledPerModel = filterThinkingState(persistedState.thinkingEnabledPerModel);

        return {
          ...current,
          ...persistedState,
          selectedModel,
          selectedProvider: 'local',
          favorites: filterSelectableModelIds(persistedState.favorites ?? []),
          recentModels: filterSelectableModelIds(persistedState.recentModels ?? []).slice(
            0,
            MAX_RECENT,
          ),
          thinkingEnabledPerModel,
          thinkingModeEnabled: thinkingEnabledPerModel[selectedModel] ?? false,
        };
      },
      // AUDIT-FIX: MMKV-RACE
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[modelStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useModelStore, 'model-store');
