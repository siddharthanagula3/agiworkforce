'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ModelAvailability, ModelEnvironment, RoutingTaskType } from '@agiworkforce/types';
import {
  PROVIDER_LABELS,
  getDisplayModels,
  getModelMetadata,
  isAutoModeModelId,
  normalizeModelId,
  type ModelMetadata,
} from '@shared/config/llm';
import { getAutoRoutingProfiles, getModelsForTierAndSurface } from '@agiworkforce/types';

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  providerKey: string;
  description: string;
  /**
   * Mirrors ModelMetadata.requiresEnvironment. Absent on all current models.
   * Populated in buildAvailableModels() so pickers can gate without a separate
   * catalog lookup at render time. Phase A: no model sets this, so all pickers
   * behave identically to before.
   */
  requiresEnvironment?: ModelEnvironment;
  /**
   * Selectability axis (absent ⇒ "live"). `coming_soon` rows are DISPLAY-ONLY:
   * shown grayed in the picker, never selectable/routable. Sourced from the
   * catalog (NOT modelPresets) so announced-but-unprovisioned models can appear
   * without being routable.
   */
  availability?: ModelAvailability;
  /** Reason shown on the coming_soon/unavailable row tooltip. */
  unavailableReason?: string;
  deprecationDate?: string;
}

export type { RoutingTaskType };

type PersistedModelState = {
  selectedModelId: string;
  selectedProvider: string | null;
};

/**
 * AUDIT-FIX CMP-24: extended-thinking state used to live HERE as well as in
 * `@shared/stores/thinking-store` -- two persisted sources of truth for one
 * concept. Worse, `applyModelSelection` unconditionally returned
 * `thinkingEnabled: metadata.capabilities.thinking`, so merely switching models
 * silently RE-ENABLED extended thinking a user had deliberately turned off (a
 * silent latency and spend increase). Nothing outside this file ever read
 * `thinkingEnabled` / `thinkingModeEnabled` / `thinkingBudget`, so the honest
 * reconciliation is to delete them: `useThinkingStore` (enabled + effort) is
 * the single source of truth, and both the composer and the ComposerFooter
 * already read it.
 */
interface ModelState extends PersistedModelState {
  selectedModel: string;
  availableModels: AIModel[];
  loading: boolean;
  setSelectedModelId: (id: string) => void;
  setSelectedModel: (id: string, provider?: string | null) => void;
  selectModel: (id: string, provider?: string | null) => Promise<void>;
  setSelectedProvider: (provider: string | null) => void;
  getSelectedModel: () => AIModel;
  getAvailableModels: () => Promise<AIModel[]>;
}

const CHAT_MODEL_TYPES = new Set(['chat', 'code', 'reasoning', 'multimodal', 'search']);
function describeModel(metadata: ModelMetadata): string {
  const bestFor = metadata.bestFor?.slice(0, 2).join(' · ');
  if (bestFor) {
    return bestFor;
  }
  if (metadata.qualityTier === 'best') {
    return 'Highest capability';
  }
  if (metadata.qualityTier === 'balanced') {
    return 'Balanced quality and speed';
  }
  return 'Fast and cost-efficient';
}

function lifecycleFields(metadata: ModelMetadata): {
  deprecated?: boolean;
  status?: string;
  deprecation_date?: string | null;
} {
  return metadata as unknown as {
    deprecated?: boolean;
    status?: string;
    deprecation_date?: string | null;
  };
}

function isCurrentModel(metadata: ModelMetadata): boolean {
  const lifecycle = lifecycleFields(metadata);
  if (lifecycle.deprecated === true) return false;
  if (lifecycle.status === 'deprecated') return false;
  if (lifecycle.deprecation_date) {
    const retiresAt = Date.parse(lifecycle.deprecation_date);
    if (!Number.isNaN(retiresAt) && retiresAt <= Date.now()) return false;
  }
  return true;
}

function futureDeprecationDate(metadata: ModelMetadata): string | undefined {
  const { deprecation_date } = lifecycleFields(metadata);
  if (!deprecation_date) return undefined;
  const retiresAt = Date.parse(deprecation_date);
  if (Number.isNaN(retiresAt) || retiresAt <= Date.now()) return undefined;
  return deprecation_date;
}

function buildAvailableModels(): AIModel[] {
  const seen = new Set<string>();
  const autoModeEntries = getAutoRoutingProfiles().map((profile) => ({
    id: profile.id,
    name: profile.label,
    provider: PROVIDER_LABELS['managed_cloud'] ?? 'Managed Cloud',
    providerKey: 'managed_cloud',
    description: profile.description,
  }));
  const orderedIds = getModelsForTierAndSurface('max', 'web/cloud-chat', {
    modelTypes: ['chat', 'code', 'reasoning', 'multimodal', 'search'],
  }).map((model) => model.id);

  const manualEntries = orderedIds
    .filter((modelId) => {
      if (seen.has(modelId)) {
        return false;
      }
      seen.add(modelId);
      return true;
    })
    .map((modelId) => getModelMetadata(modelId))
    .filter(
      (metadata): metadata is ModelMetadata =>
        !!metadata && CHAT_MODEL_TYPES.has(metadata.modelType) && isCurrentModel(metadata),
    )
    .map((metadata) => {
      const deprecationDate = futureDeprecationDate(metadata);
      return {
        id: metadata.id,
        name: metadata.name,
        provider: PROVIDER_LABELS[metadata.provider] ?? metadata.provider,
        providerKey: metadata.provider,
        description: describeModel(metadata),
        // Propagate env requirement so pickers can gate without extra catalog lookup.
        // All current models have this absent; Phase B will surface models that set it.
        ...(metadata.requiresEnvironment !== undefined
          ? { requiresEnvironment: metadata.requiresEnvironment }
          : {}),
        // Propagate a scheduled-but-not-yet-passed retirement date so the
        // picker can warn ahead of time (CLR-01 / mqp-08). Absent on every
        // model today (no non-null deprecation_date in the catalog yet), so
        // this is a no-op until the catalog schedules one.
        ...(deprecationDate ? { deprecationDate } : {}),
      };
    });

  // Coming-soon (announced-but-unprovisioned) chat models. These are DELIBERATELY
  // absent from every routable/tier set by the availability invariant, so they
  // are sourced directly from the catalog and
  // rendered as grayed, NON-selectable rows. `getDisplayModels()` includes them;
  // `getSelectableModels()` (live-only) drives what can actually be picked/sent.
  const comingSoonEntries = getDisplayModels()
    .filter(
      (metadata) =>
        metadata.availability === 'coming_soon' &&
        CHAT_MODEL_TYPES.has(metadata.modelType) &&
        !seen.has(metadata.id),
    )
    .map((metadata) => {
      seen.add(metadata.id);
      return {
        id: metadata.id,
        name: metadata.name,
        provider: PROVIDER_LABELS[metadata.provider] ?? metadata.provider,
        providerKey: metadata.provider,
        description: describeModel(metadata),
        availability: 'coming_soon' as ModelAvailability,
        ...(metadata.unavailableReason ? { unavailableReason: metadata.unavailableReason } : {}),
      };
    });

  return [...autoModeEntries, ...manualEntries, ...comingSoonEntries];
}

export const AVAILABLE_MODELS: AIModel[] = buildAvailableModels();

const DEFAULT_MODEL_ID =
  AVAILABLE_MODELS.find((model) => model.id === getAutoRoutingProfiles()[0]?.id)?.id ??
  AVAILABLE_MODELS[0]?.id ??
  'auto';

function resolveProvider(modelId: string, explicitProvider?: string | null): string | null {
  const canonicalModelId = normalizeModelId(modelId) ?? modelId;
  const catalogProvider = isAutoModeModelId(canonicalModelId)
    ? 'managed_cloud'
    : (getModelMetadata(canonicalModelId)?.provider ?? null);
  return explicitProvider === catalogProvider ? explicitProvider : catalogProvider;
}

function isSelectableModel(model: AIModel): boolean {
  return model.availability !== 'coming_soon';
}

/**
 * Resolve any persisted, URL-derived, or caller-supplied value to a model the
 * current catalog actually admits. This runs independently of Zustand's
 * storage version so deleting a model from the catalog cannot leave a
 * same-version browser silently sending its retired ID while the picker shows
 * the visual fallback.
 */
export function resolveSelectableModelId(modelId: string | null | undefined): string {
  const canonicalModelId = modelId ? (normalizeModelId(modelId) ?? modelId) : DEFAULT_MODEL_ID;
  return AVAILABLE_MODELS.some((model) => model.id === canonicalModelId && isSelectableModel(model))
    ? canonicalModelId
    : DEFAULT_MODEL_ID;
}

export interface ModelSubstitution {
  requestedId: string;
  requestedLabel: string;
  resolvedId: string;
  resolvedLabel: string;
}

export function describeModelSubstitution(
  modelId: string | null | undefined,
): ModelSubstitution | null {
  if (!modelId) return null;
  const requestedId = normalizeModelId(modelId) ?? modelId;
  const resolvedId = resolveSelectableModelId(requestedId);
  if (resolvedId === requestedId) return null;
  return {
    requestedId,
    requestedLabel: getModelMetadata(requestedId)?.name ?? requestedId,
    resolvedId,
    resolvedLabel: AVAILABLE_MODELS.find((model) => model.id === resolvedId)?.name ?? resolvedId,
  };
}

/**
 * AUDIT-FIX CMP-24: selecting a model now changes ONLY the model. Extended
 * thinking is the user's choice and lives in `useThinkingStore`; the composer
 * already clears it when the newly selected model cannot reason
 * (`ChatComposerNew`'s capability effect), which is the one direction a model
 * switch is allowed to move it.
 */
function applyModelSelection(
  modelId: string,
  explicitProvider?: string | null,
): Pick<ModelState, 'selectedModelId' | 'selectedModel' | 'selectedProvider'> {
  const canonicalModelId = resolveSelectableModelId(modelId);
  const provider = resolveProvider(canonicalModelId, explicitProvider);

  return {
    selectedModelId: canonicalModelId,
    selectedModel: canonicalModelId,
    selectedProvider: provider,
  };
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      ...applyModelSelection(DEFAULT_MODEL_ID),
      availableModels: AVAILABLE_MODELS,
      loading: false,

      setSelectedModelId: (id) => {
        set((state) => ({
          ...state,
          ...applyModelSelection(id),
        }));
      },

      setSelectedModel: (id, provider) => {
        set((state) => ({
          ...state,
          ...applyModelSelection(id, provider),
        }));
      },

      selectModel: async (id, provider) => {
        set((state) => ({
          ...state,
          ...applyModelSelection(id, provider),
        }));
      },

      setSelectedProvider: (provider) => {
        set({ selectedProvider: provider });
      },

      getSelectedModel: () => {
        const { selectedModelId } = get();
        return (
          AVAILABLE_MODELS.find((model) => model.id === selectedModelId) ?? AVAILABLE_MODELS[0]!
        );
      },

      getAvailableModels: async () => AVAILABLE_MODELS,
    }),
    {
      name: 'agi-model-store',
      // AUDIT-FIX CMP-24: v5 drops the duplicated thinking fields from the
      // persisted payload; `useThinkingStore` owns that state.
      version: 5,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedModelState => ({
        selectedModelId: state.selectedModelId,
        selectedProvider: state.selectedProvider,
      }),
      migrate: (persistedState: unknown) => {
        const state = (persistedState as Partial<PersistedModelState>) ?? {};
        return applyModelSelection(
          state.selectedModelId ?? DEFAULT_MODEL_ID,
          state.selectedProvider,
        );
      },
      // Zustand only calls `migrate` when a stored version differs. Validate in
      // `merge` as well so same-version stale IDs are repaired on every hydrate.
      merge: (persistedState, currentState) => {
        const state = (persistedState as Partial<PersistedModelState>) ?? {};
        return {
          ...currentState,
          ...applyModelSelection(state.selectedModelId ?? DEFAULT_MODEL_ID, state.selectedProvider),
        };
      },
    },
  ),
);
