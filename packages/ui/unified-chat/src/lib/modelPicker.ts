import {
  MODEL_FAMILY_REGISTRY,
  PLAN_LABEL,
  getDefaultAutoRoutingProfile,
  getMinimumRequiredTier,
  getModelFamilySlot,
  getModelFamilySlotForModel,
  getModelMetadataById,
  getModelReasoning,
  isAutoModeModelId,
  listCanonicalModels,
  normalizeUIPlanTier,
  type ModelCapabilities,
  type ModelMetadata,
} from '@agiworkforce/types';
import { listProfileModelOrder, resolveTierMaximumProfile } from '@agiworkforce/routing';

export const MODEL_PICKER_PRICE_BAND_SCALE = 4;
export const MODEL_PICKER_RECOMMENDED_LIMIT = 4;
export const MODEL_PICKER_FAVOURITES_LIMIT = 3;

export const MODEL_PICKER_CHAT_MODEL_TYPES = [
  'chat',
  'code',
  'reasoning',
  'multimodal',
  'search',
] as const;

export const MODEL_PICKER_CAPABILITY_KEYS = [
  'vision',
  'thinking',
  'tools',
  'search',
  'codeExecution',
  'imageGen',
  'videoGen',
] as const satisfies readonly (keyof ModelCapabilities)[];

export type ModelPickerCapabilityKey = (typeof MODEL_PICKER_CAPABILITY_KEYS)[number];

export const MODEL_PICKER_GUIDANCE = {
  reasoning: 'For your hardest problems',
  flagship: 'For the most demanding work',
  balanced: 'For everyday work',
  economy: 'For quick answers',
} as const;

export type ModelPickerGuidanceKind = keyof typeof MODEL_PICKER_GUIDANCE;

export interface ModelPickerSourceModel {
  id: string;
  displayName: string;
  providerKey: string;
}

export type ModelPickerLockKind = 'plan' | 'environment' | 'unavailable';

export interface ModelPickerLock {
  kind: ModelPickerLockKind;
  label: string;
}

export interface ModelPickerPriceBand {
  filled: number;
  scale: number;
}

export interface ModelPickerRowModel extends ModelPickerSourceModel {
  guidance: string;
  capabilityKeys: readonly ModelPickerCapabilityKey[];
  priceBand: ModelPickerPriceBand | null;
  lock: ModelPickerLock | null;
  isFavourite: boolean;
  familySlot: string | null;
}

export interface ModelPickerAutoRow {
  id: string;
  label: string;
  guidance: string;
  continuity: string | null;
}

export interface ModelPickerPlanHeader {
  label: string;
  admitsEveryModel: boolean;
}

export interface ModelPickerShortList {
  auto: ModelPickerAutoRow | null;
  recommended: readonly ModelPickerRowModel[];
  favourites: readonly ModelPickerRowModel[];
  favouritesOverflow: number;
  rowsById: ReadonlyMap<string, ModelPickerRowModel>;
  totalCount: number;
  plan: ModelPickerPlanHeader;
}

export interface ModelPickerShortListInput {
  models: readonly ModelPickerSourceModel[];
  planTier: string | null;
  favouriteModelIds: readonly string[];
  conversationModelId: string | null;
  admitsModel: (modelId: string) => boolean;
  lockOverrides?: ReadonlyMap<string, ModelPickerLock>;
  autoGuidance: string;
  autoContinuityGuidance: (displayName: string) => string;
}

function blendedCost(modelId: string): number | null {
  const metadata = getModelMetadataById(modelId);
  if (!metadata) return null;
  const input = metadata.inputCost;
  const output = metadata.outputCost;
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null;
  return input + output;
}

export function resolveModelPriceBands(
  modelIds: readonly string[],
): ReadonlyMap<string, ModelPickerPriceBand> {
  const costs = new Map<string, number>();
  for (const modelId of modelIds) {
    const cost = blendedCost(modelId);
    if (cost === null) continue;
    costs.set(modelId, cost);
  }
  const ladder = [...new Set(costs.values())].sort((left, right) => left - right);
  const bands = new Map<string, ModelPickerPriceBand>();
  if (ladder.length === 0) return bands;
  for (const [modelId, cost] of costs) {
    const rank = ladder.indexOf(cost);
    const filled = Math.min(
      MODEL_PICKER_PRICE_BAND_SCALE,
      1 + Math.floor((rank / ladder.length) * MODEL_PICKER_PRICE_BAND_SCALE),
    );
    bands.set(modelId, { filled, scale: MODEL_PICKER_PRICE_BAND_SCALE });
  }
  return bands;
}

export function listPickerChatModels(): readonly ModelMetadata[] {
  const types = new Set<string>(MODEL_PICKER_CHAT_MODEL_TYPES);
  return listCanonicalModels().filter((model) => types.has(model.modelType));
}

let registryPriceBands: ReadonlyMap<string, ModelPickerPriceBand> | null = null;

export function getModelPriceBand(modelId: string): ModelPickerPriceBand | null {
  registryPriceBands ??= resolveModelPriceBands(listPickerChatModels().map((model) => model.id));
  return registryPriceBands.get(modelId) ?? null;
}

export function resolveModelCapabilityKeys(modelId: string): readonly ModelPickerCapabilityKey[] {
  const capabilities = getModelMetadataById(modelId)?.capabilities;
  if (!capabilities) return [];
  return MODEL_PICKER_CAPABILITY_KEYS.filter((key) => capabilities[key] === true);
}

function familyTierOf(modelId: string): string | null {
  const slot = getModelFamilySlotForModel(modelId);
  return slot ? getModelFamilySlot(slot).tier : null;
}

export function resolveModelGuidanceKind(modelId: string): ModelPickerGuidanceKind {
  const tier = familyTierOf(modelId) ?? getModelMetadataById(modelId)?.qualityTier ?? null;
  const profile =
    tier === 'frontier' || tier === 'best' ? 'flagship' : tier === 'fast' ? 'economy' : 'balanced';
  if (profile === 'flagship') {
    const reasoning = getModelReasoning(modelId);
    if (reasoning.capable && reasoning.control !== 'none') return 'reasoning';
  }
  return profile;
}

export function resolveModelGuidance(modelId: string): string {
  return MODEL_PICKER_GUIDANCE[resolveModelGuidanceKind(modelId)];
}

export function resolvePlanLockLabel(modelId: string): string | null {
  const minimumTier = getMinimumRequiredTier(modelId);
  if (!minimumTier) return null;
  return PLAN_LABEL[minimumTier];
}

function familyActiveModelIds(): ReadonlySet<string> {
  return new Set(Object.values(MODEL_FAMILY_REGISTRY).map((family) => family.activeModelId));
}

function routerOrderIndex(
  order: readonly string[],
  modelId: string,
  familySlot: string | null,
): number {
  const direct = order.indexOf(modelId);
  if (direct >= 0) return direct;
  if (familySlot) {
    for (const [index, candidate] of order.entries()) {
      if (getModelFamilySlotForModel(candidate) === familySlot) return index;
    }
  }
  return order.length;
}

export function buildModelPickerShortList(input: ModelPickerShortListInput): ModelPickerShortList {
  const favourites = new Set(input.favouriteModelIds);
  const overrides = input.lockOverrides ?? new Map<string, ModelPickerLock>();

  const resolveLock = (modelId: string): ModelPickerLock | null | undefined => {
    const override = overrides.get(modelId);
    if (override) return override;
    if (input.admitsModel(modelId)) return null;
    const planLabel = resolvePlanLockLabel(modelId);
    return planLabel ? { kind: 'plan', label: planLabel } : undefined;
  };

  const selectable = input.models.filter(
    (model) => !isAutoModeModelId(model.id) && resolveLock(model.id) !== undefined,
  );

  const toRow = (model: ModelPickerSourceModel): ModelPickerRowModel => ({
    ...model,
    guidance: resolveModelGuidance(model.id),
    capabilityKeys: resolveModelCapabilityKeys(model.id),
    priceBand: getModelPriceBand(model.id),
    lock: resolveLock(model.id) ?? null,
    isFavourite: favourites.has(model.id),
    familySlot: getModelFamilySlotForModel(model.id),
  });

  const rowsById = new Map<string, ModelPickerRowModel>(
    selectable.map((model) => [model.id, toRow(model)]),
  );
  const familyActives = familyActiveModelIds();
  const routerOrder = listProfileModelOrder(resolveTierMaximumProfile(input.planTier));
  const admitted = selectable.filter((model) => rowsById.get(model.id)?.lock == null);
  const familyAdmitted = admitted.filter((model) => familyActives.has(model.id));
  const seenFamilies = new Set<string>();
  const recommended = (familyAdmitted.length > 0 ? familyAdmitted : admitted)
    .map((model) => rowsById.get(model.id)!)
    .filter((row) => {
      const key = row.familySlot ?? row.id;
      if (seenFamilies.has(key)) return false;
      seenFamilies.add(key);
      return true;
    })
    .sort(
      (left, right) =>
        routerOrderIndex(routerOrder, left.id, left.familySlot) -
          routerOrderIndex(routerOrder, right.id, right.familySlot) ||
        left.displayName.localeCompare(right.displayName),
    )
    .slice(0, MODEL_PICKER_RECOMMENDED_LIMIT);

  const favouriteRows = selectable
    .filter((model) => favourites.has(model.id))
    .map((model) => rowsById.get(model.id)!);
  const autoProfile = input.models.some((model) => isAutoModeModelId(model.id))
    ? getDefaultAutoRoutingProfile()
    : null;
  const pinned =
    input.conversationModelId && !isAutoModeModelId(input.conversationModelId)
      ? (selectable.find((model) => model.id === input.conversationModelId) ?? null)
      : null;

  return {
    auto: autoProfile
      ? {
          id: autoProfile.id,
          label: autoProfile.label,
          guidance: input.autoGuidance,
          continuity: pinned ? input.autoContinuityGuidance(pinned.displayName) : null,
        }
      : null,
    recommended,
    favourites: favouriteRows.slice(0, MODEL_PICKER_FAVOURITES_LIMIT),
    favouritesOverflow: Math.max(0, favouriteRows.length - MODEL_PICKER_FAVOURITES_LIMIT),
    rowsById,
    totalCount: selectable.length,
    plan: {
      label: PLAN_LABEL[normalizeUIPlanTier(input.planTier, 'free')],
      admitsEveryModel: selectable.every((model) => input.admitsModel(model.id)),
    },
  };
}
