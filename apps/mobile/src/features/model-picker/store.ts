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
  isSelectableModelIdForAccess,
  isAutoMode,
  isCloudManagedModelId,
} from './service';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTierStore } from '@/src/features/billing/store';

const MAX_RECENT = 5;
const CLOUD_PROVIDER_ID = 'cloud_managed';

function isCloudUnlocked(): boolean {
  return useWaitlistStore.getState().cloudUnlocked;
}

function normalizeSelectableModelId(modelId: string): string | null {
  const resolvedModelId = normalizeModelId(modelId) ?? modelId;
  return isSelectableModelIdForAccess(
    resolvedModelId,
    isCloudUnlocked(),
    useTierStore.getState().tier,
  )
    ? resolvedModelId
    : null;
}

function filterSelectableModelIds(ids: string[]): string[] {
  const cloudUnlocked = isCloudUnlocked();
  const tier = useTierStore.getState().tier;
  return ids.filter((id) => isSelectableModelIdForAccess(id, cloudUnlocked, tier));
}

function filterThinkingState(
  thinkingEnabledPerModel: Record<string, boolean> | undefined,
): Record<string, boolean> {
  const cloudUnlocked = isCloudUnlocked();
  const tier = useTierStore.getState().tier;
  return Object.fromEntries(
    Object.entries(thinkingEnabledPerModel ?? {}).filter(([id]) =>
      isSelectableModelIdForAccess(id, cloudUnlocked, tier),
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
  selectedModel: string;
  selectedProvider: string;
  favorites: string[];
  recentModels: string[];
  thinkingModeEnabled: boolean;
  thinkingEnabledPerModel: Record<string, boolean>;

  setModel: (modelId: string) => void;
  setProvider: (providerId: string) => void;
  toggleFavorite: (modelId: string) => void;
  setThinkingMode: (enabled: boolean) => void;
  toggleThinkingForModel: (modelId: string) => void;
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
        if (enabled && !isAutoMode(selectedModel)) {
          const model = getModelByIdForCloudAccess(selectedModel, isCloudUnlocked());
          if (model && !model.supportsThinking) return;
        }
        set({ thinkingModeEnabled: enabled });
      },

      toggleThinkingForModel: (modelId: string) => {
        const resolvedModelId = normalizeSelectableModelId(modelId);
        if (!resolvedModelId) return;

        if (isAutoMode(resolvedModelId)) return;

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
        const tier = useTierStore.getState().tier;
        const persistedModelId = persistedState.selectedModel
          ? (normalizeModelId(persistedState.selectedModel) ?? persistedState.selectedModel)
          : null;
        const tierDefault = getDefaultCloudModelIdForTier(tier);
        const selectedModel =
          persistedModelId && isSelectableModelIdForAccess(persistedModelId, cloudUnlocked, tier)
            ? persistedModelId
            : persistedModelId && isCloudManagedModelId(persistedModelId) && tierDefault
              ? tierDefault
              : getDefaultSelectableModelId(persistedModelId);
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
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[modelStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useModelStore, 'model-store');

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
