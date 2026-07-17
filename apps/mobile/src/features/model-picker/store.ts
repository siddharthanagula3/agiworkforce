import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getModelReasoning, normalizeModelId } from '@agiworkforce/types';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import {
  DEFAULT_LOCAL_MODEL_ID,
  canAccessCloudModelForTier,
  getDefaultCloudModelIdForTier,
  getDefaultSelectableModelId,
  getModelByIdForCloudAccess,
  isAutoMode,
  isCloudManagedModelId,
  isSelectableModelId,
  isSelectableModelIdForCloudAccess,
} from './service';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTierStore } from '@/src/features/billing/store';

/** Maximum number of entries kept in the recent-models list. */
const MAX_RECENT = 5;
const CLOUD_PROVIDER_ID = 'cloud_managed';

function isCloudUnlocked(): boolean {
  return useWaitlistStore.getState().cloudUnlocked;
}

function normalizeSelectableModelId(modelId: string): string | null {
  const resolvedModelId = normalizeModelId(modelId) ?? modelId;
  return isSelectableModelIdForCloudAccess(resolvedModelId, isCloudUnlocked())
    ? resolvedModelId
    : null;
}

function filterSelectableModelIds(ids: string[]): string[] {
  const cloudUnlocked = isCloudUnlocked();
  return ids.filter((id) => isSelectableModelIdForCloudAccess(id, cloudUnlocked));
}

function filterThinkingState(
  thinkingEnabledPerModel: Record<string, boolean> | undefined,
): Record<string, boolean> {
  const cloudUnlocked = isCloudUnlocked();
  return Object.fromEntries(
    Object.entries(thinkingEnabledPerModel ?? {}).filter(([id]) =>
      isSelectableModelIdForCloudAccess(id, cloudUnlocked),
    ),
  );
}

function providerForModelId(modelId: string): string {
  return isCloudManagedModelId(modelId) ? CLOUD_PROVIDER_ID : 'local';
}

function normalizeProvider(providerId: string): string {
  if (providerId === CLOUD_PROVIDER_ID && isCloudUnlocked()) return CLOUD_PROVIDER_ID;
  return 'local';
}

function modelRequiresThinking(modelId: string): boolean {
  const reasoning = getModelReasoning(modelId);
  return reasoning.capable && reasoning.canDisableThinking === false;
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
        const requiresThinking = modelRequiresThinking(resolvedModelId);
        const thinkingEnabledPerModel = requiresThinking
          ? { ...perModel, [resolvedModelId]: true }
          : perModel;
        const thinkingModeEnabled = requiresThinking || (perModel[resolvedModelId] ?? false);

        set({
          selectedModel: resolvedModelId,
          selectedProvider: providerForModelId(resolvedModelId),
          recentModels,
          thinkingModeEnabled,
          thinkingEnabledPerModel,
        });
      },

      setProvider: (providerId: string) => {
        set({ selectedProvider: normalizeProvider(providerId) });
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
        const { selectedModel } = get();
        if (modelRequiresThinking(selectedModel)) {
          set((state) => ({
            thinkingModeEnabled: true,
            thinkingEnabledPerModel: {
              ...state.thinkingEnabledPerModel,
              [selectedModel]: true,
            },
          }));
          return;
        }
        // Only allow enabling if the current model supports thinking.
        if (enabled && !isAutoMode(selectedModel)) {
          const model = getModelByIdForCloudAccess(selectedModel, isCloudUnlocked());
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
        const model = getModelByIdForCloudAccess(resolvedModelId, isCloudUnlocked());
        if (model && !model.supportsThinking) return;
        if (modelRequiresThinking(resolvedModelId)) {
          set((state) => ({
            thinkingModeEnabled:
              state.selectedModel === resolvedModelId ? true : state.thinkingModeEnabled,
            thinkingEnabledPerModel: {
              ...state.thinkingEnabledPerModel,
              [resolvedModelId]: true,
            },
          }));
          return;
        }

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
        return (
          modelRequiresThinking(selectedModel) || (thinkingEnabledPerModel[selectedModel] ?? false)
        );
      },
    }),
    {
      name: 'model-store',
      storage: createJSONStorage(() => mmkvStorage),
      merge: (persisted, current) => {
        const persistedState = (persisted ?? {}) as Partial<ModelState>;
        const cloudUnlocked = isCloudUnlocked();
        const selectedModel =
          persistedState.selectedModel &&
          isSelectableModelIdForCloudAccess(persistedState.selectedModel, cloudUnlocked)
            ? persistedState.selectedModel
            : getDefaultSelectableModelId(persistedState.selectedModel);
        const filteredThinkingState = filterThinkingState(persistedState.thinkingEnabledPerModel);
        const thinkingEnabledPerModel = modelRequiresThinking(selectedModel)
          ? { ...filteredThinkingState, [selectedModel]: true }
          : filteredThinkingState;
        const selectedProvider = providerForModelId(selectedModel);

        return {
          ...current,
          ...persistedState,
          selectedModel,
          selectedProvider,
          favorites: filterSelectableModelIds(persistedState.favorites ?? []),
          recentModels: filterSelectableModelIds(persistedState.recentModels ?? []).slice(
            0,
            MAX_RECENT,
          ),
          thinkingEnabledPerModel,
          thinkingModeEnabled:
            modelRequiresThinking(selectedModel) ||
            (thinkingEnabledPerModel[selectedModel] ?? false),
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

/**
 * A tier downgrade (e.g. Max → Pro) must not leave a now-locked flagship model
 * selected and check-marked. Re-check tier access whenever the billing tier
 * changes and fall back to the tier's registry-owned default cloud model.
 */
function revalidateSelectedModelForTier(tier: string): void {
  const { selectedModel, thinkingEnabledPerModel } = useModelStore.getState();
  if (!isCloudManagedModelId(selectedModel)) return;
  if (canAccessCloudModelForTier(selectedModel, tier)) return;

  const preferredDefault = getDefaultCloudModelIdForTier(tier);
  const fallbackId =
    preferredDefault && canAccessCloudModelForTier(preferredDefault, tier)
      ? preferredDefault
      : DEFAULT_LOCAL_MODEL_ID;
  useModelStore.setState({
    selectedModel: fallbackId,
    selectedProvider: providerForModelId(fallbackId),
    thinkingModeEnabled: thinkingEnabledPerModel[fallbackId] ?? false,
  });
}

useTierStore.subscribe((state, prevState) => {
  if (state.tier === prevState.tier) return;
  revalidateSelectedModelForTier(state.tier);
});
