import { Alert } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getModelReasoning, normalizeModelId } from '@agiworkforce/types';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import {
  DEFAULT_LOCAL_MODEL_ID,
  canAccessCloudModelForTier,
  getDisplayName,
  getDefaultCloudModelIdForTier,
  getDefaultSelectableModelId,
  getModelByIdForCloudAccess,
  isSelectableModelIdForAccess,
  isAutoMode,
  isCloudManagedModelId,
  isSelectableModelId,
  DEFAULT_CLOUD_MODEL_ID,
} from './service';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTierStore } from '@/src/features/billing/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { captureCloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';
import { startFavouritesSync, type FavouriteChanges } from './useFavouritesSync';

const MAX_RECENT = 5;
const CLOUD_PROVIDER_ID = 'cloud_managed';

function isCloudUnlocked(): boolean {
  return useWaitlistStore.getState().cloudUnlocked;
}

function cloudAccountOwnerId(): string | null {
  return captureCloudAccountEpoch()?.ownerId ?? null;
}

function isPlanConfirmed(): boolean {
  return useTierStore.getState().lastRefreshedAt !== null;
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

function filterFavouriteChanges(changes: unknown): FavouriteChanges {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return {};
  return Object.fromEntries(
    Object.entries(changes).filter(
      (entry): entry is [string, boolean] =>
        typeof entry[1] === 'boolean' && isCloudManagedModelId(entry[0]),
    ),
  );
}

function providerForModelId(modelId: string): string {
  return isCloudManagedModelId(modelId) ? CLOUD_PROVIDER_ID : 'local';
}

function modelRequiresThinking(modelId: string): boolean {
  const reasoning = getModelReasoning(modelId);
  return reasoning.capable && reasoning.canDisableThinking === false;
}

type NewChatMode = 'local' | 'cloud';
type NewChatModels = Record<NewChatMode, string | null>;

const NO_NEW_CHAT_MODELS: NewChatModels = { local: null, cloud: null };

function newChatModeFor(modelId: string): NewChatMode {
  if (isAutoMode(modelId)) return useChatAppModeStore.getState().appMode;
  return isCloudManagedModelId(modelId) ? 'cloud' : 'local';
}

function readNewChatModel(stored: unknown, mode: NewChatMode): string | null {
  if (typeof stored !== 'string') return null;
  const modelId = normalizeModelId(stored) ?? stored;
  if (isAutoMode(modelId)) return modelId;
  return newChatModeFor(modelId) === mode && (mode === 'cloud' || isSelectableModelId(modelId))
    ? modelId
    : null;
}

function readNewChatModels(stored: unknown, legacySelectedModel: string | null): NewChatModels {
  const record =
    stored && typeof stored === 'object' && !Array.isArray(stored)
      ? (stored as Partial<Record<NewChatMode, unknown>>)
      : null;
  const models: NewChatModels = {
    local: readNewChatModel(record?.local, 'local'),
    cloud: readNewChatModel(record?.cloud, 'cloud'),
  };
  if (record || !legacySelectedModel) return models;
  const legacyMode = newChatModeFor(legacySelectedModel);
  return { ...models, [legacyMode]: readNewChatModel(legacySelectedModel, legacyMode) };
}

function withMostRecent(recentModels: string[], modelId: string): string[] {
  return [modelId, ...recentModels.filter((id) => id !== modelId)].slice(0, MAX_RECENT);
}

function activeSelectionPatch(
  perModel: Record<string, boolean>,
  modelId: string,
): Pick<
  ModelState,
  'selectedModel' | 'selectedProvider' | 'thinkingModeEnabled' | 'thinkingEnabledPerModel'
> {
  const requiresThinking = modelRequiresThinking(modelId);
  return {
    selectedModel: modelId,
    selectedProvider: providerForModelId(modelId),
    thinkingModeEnabled: requiresThinking || (perModel[modelId] ?? false),
    thinkingEnabledPerModel: requiresThinking ? { ...perModel, [modelId]: true } : perModel,
  };
}

interface ModelState {
  selectedModel: string;
  selectedProvider: string;
  newChatModels: NewChatModels;
  newChatModelOwner: string | null;
  conversationModelShown: boolean;
  favorites: string[];
  favoriteChanges: FavouriteChanges;
  favoritesSyncedAccountId: string | null;
  recentModels: string[];
  thinkingModeEnabled: boolean;
  thinkingEnabledPerModel: Record<string, boolean>;

  setModel: (modelId: string) => void;
  showConversationModel: (modelId: string) => void;
  restoreNewChatModel: () => void;
  endConversationModel: () => void;
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
      newChatModels: NO_NEW_CHAT_MODELS,
      newChatModelOwner: null,
      conversationModelShown: false,
      favorites: [],
      favoriteChanges: {},
      favoritesSyncedAccountId: null,
      recentModels: [],
      thinkingModeEnabled: false,
      thinkingEnabledPerModel: {},

      setModel: (modelId: string) => {
        const resolvedModelId = normalizeSelectableModelId(modelId);
        if (!resolvedModelId) return;

        const recentModels = withMostRecent(get().recentModels, resolvedModelId);
        const mode = newChatModeFor(resolvedModelId);

        set({
          ...activeSelectionPatch(get().thinkingEnabledPerModel, resolvedModelId),
          newChatModels: { ...get().newChatModels, [mode]: resolvedModelId },
          ...(mode === 'cloud' ? { newChatModelOwner: cloudAccountOwnerId() } : {}),
          conversationModelShown: false,
          recentModels,
        });
      },

      showConversationModel: (modelId: string) => {
        const resolvedModelId = normalizeSelectableModelId(modelId);
        if (!resolvedModelId) return;
        set({
          ...activeSelectionPatch(get().thinkingEnabledPerModel, resolvedModelId),
          conversationModelShown: true,
          recentModels: withMostRecent(get().recentModels, resolvedModelId),
        });
      },

      restoreNewChatModel: () => {
        const mode = useChatAppModeStore.getState().appMode;
        const cloudUnlocked = isCloudUnlocked();
        if (mode === 'cloud' && !cloudUnlocked) return;
        const tier = useTierStore.getState().tier;
        const remembered = get().newChatModels[mode];
        const chosen =
          mode === 'cloud' && get().newChatModelOwner !== cloudAccountOwnerId() ? null : remembered;
        const usable =
          chosen !== null &&
          isSelectableModelIdForAccess(chosen, cloudUnlocked, tier) &&
          (isAutoMode(chosen) || newChatModeFor(chosen) === mode);
        const target = usable
          ? chosen
          : mode === 'cloud'
            ? (getDefaultCloudModelIdForTier(tier) ?? DEFAULT_CLOUD_MODEL_ID)
            : DEFAULT_LOCAL_MODEL_ID;
        if (!target) return;
        const keepsRememberedChoice = mode === 'cloud' && !usable && !isPlanConfirmed();
        set({
          ...activeSelectionPatch(get().thinkingEnabledPerModel, target),
          ...(keepsRememberedChoice
            ? {}
            : {
                newChatModels: { ...get().newChatModels, [mode]: target },
                ...(mode === 'cloud' ? { newChatModelOwner: cloudAccountOwnerId() } : {}),
              }),
          conversationModelShown: false,
        });
      },

      endConversationModel: () => {
        if (get().conversationModelShown) get().restoreNewChatModel();
      },

      toggleFavorite: (modelId: string) => {
        const resolvedModelId = normalizeSelectableModelId(modelId);
        if (!resolvedModelId || isAutoMode(resolvedModelId)) return;

        const current = get().favorites;
        const isFavourite = !current.includes(resolvedModelId);
        const next = isFavourite
          ? [...current, resolvedModelId]
          : current.filter((id) => id !== resolvedModelId);
        if (!isCloudManagedModelId(resolvedModelId)) {
          set({ favorites: next });
          return;
        }
        set((state) => ({
          favorites: next,
          favoriteChanges: { ...state.favoriteChanges, [resolvedModelId]: isFavourite },
        }));
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
        set(updates);
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
        const persistedSelectedId = persistedState.selectedModel
          ? (normalizeModelId(persistedState.selectedModel) ?? persistedState.selectedModel)
          : null;
        const shownOnlyForConversation = persistedState.conversationModelShown === true;
        const newChatModels = readNewChatModels(
          persistedState.newChatModels,
          shownOnlyForConversation ? null : persistedSelectedId,
        );
        const tierDefault = getDefaultCloudModelIdForTier(tier);
        const shownMode = persistedSelectedId ? newChatModeFor(persistedSelectedId) : null;
        const persistedModelId =
          shownOnlyForConversation && shownMode
            ? (newChatModels[shownMode] ??
              (shownMode === 'cloud' ? (tierDefault ?? DEFAULT_CLOUD_MODEL_ID) : null))
            : persistedSelectedId;
        const accountAccessUnknown = !cloudUnlocked;
        const selectedModel =
          persistedModelId && isSelectableModelIdForAccess(persistedModelId, cloudUnlocked, tier)
            ? persistedModelId
            : persistedModelId && isCloudManagedModelId(persistedModelId) && accountAccessUnknown
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
          newChatModels,
          newChatModelOwner:
            typeof persistedState.newChatModelOwner === 'string'
              ? persistedState.newChatModelOwner
              : null,
          conversationModelShown: false,
          favorites: filterSelectableModelIds(persistedState.favorites ?? []),
          favoriteChanges: filterFavouriteChanges(persistedState.favoriteChanges),
          favoritesSyncedAccountId:
            typeof persistedState.favoritesSyncedAccountId === 'string'
              ? persistedState.favoritesSyncedAccountId
              : null,
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

startFavouritesSync({
  getState: () => useModelStore.getState(),
  setState: (patch) => useModelStore.setState(patch),
  subscribe: (listener) => useModelStore.subscribe(listener),
  hasHydrated: () => useModelStore.persist.hasHydrated(),
  onFinishHydration: (listener) => useModelStore.persist.onFinishHydration(listener),
  isAccountModelId: isCloudManagedModelId,
  isSelectable: (modelId) => normalizeSelectableModelId(modelId) === modelId,
});

function revalidateSelectedModelForTier(tier: string): void {
  const { selectedModel, thinkingEnabledPerModel, newChatModels } = useModelStore.getState();
  const unavailable = (modelId: string | null): modelId is string =>
    modelId !== null &&
    isCloudManagedModelId(modelId) &&
    !canAccessCloudModelForTier(modelId, tier);
  const selectedUnavailable = unavailable(selectedModel);
  const chosenUnavailable = unavailable(newChatModels.cloud);
  if (!selectedUnavailable && !chosenUnavailable) return;

  const preferredDefault = getDefaultCloudModelIdForTier(tier);
  const cloudFallbackId =
    preferredDefault && canAccessCloudModelForTier(preferredDefault, tier)
      ? preferredDefault
      : null;
  const fallbackId = cloudFallbackId ?? DEFAULT_LOCAL_MODEL_ID;
  useModelStore.setState({
    ...(chosenUnavailable ? { newChatModels: { ...newChatModels, cloud: cloudFallbackId } } : {}),
    ...(selectedUnavailable
      ? {
          selectedModel: fallbackId,
          selectedProvider: providerForModelId(fallbackId),
          thinkingModeEnabled: thinkingEnabledPerModel[fallbackId] ?? false,
        }
      : {}),
  });
  if (!selectedUnavailable) return;
  // The next message would otherwise run on a model the user never chose
  // (MOBILE-072).
  Alert.alert(
    'Your model changed with your plan',
    `${getDisplayName(selectedModel)} is not included in your current plan, so new messages will use ${getDisplayName(fallbackId)}.`,
  );
}

useTierStore.subscribe((state, prevState) => {
  if (state.tier === prevState.tier) return;
  if (state.lastRefreshedAt === null && prevState.lastRefreshedAt !== null) return;
  revalidateSelectedModelForTier(state.tier);
  if (
    state.lastRefreshedAt !== null &&
    useChatAppModeStore.getState().appMode === 'cloud' &&
    !useModelStore.getState().conversationModelShown
  ) {
    useModelStore.getState().restoreNewChatModel();
  }
});
