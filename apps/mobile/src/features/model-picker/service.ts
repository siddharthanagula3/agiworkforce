
import {
  getDefaultModel as getCatalogDefaultModel,
  getShippableModels as getCatalogShippableModels,
} from '@agiworkforce/local-llm';
import { isSelectableLocalCatalogModel } from './catalogSelectability';
import type { OnDeviceModel, PickerModelTier } from '@agiworkforce/types';
import {
  evaluateModelEnvironment,
  getDefaultModelFor,
  getModelMetadataById,
  getAllowedModelsForTier,
  getMinimumRequiredTier,
  normalizeBillingPlanTier,
  normalizeModelId,
  type EnvironmentAvailability,
  type ModelEnvironment,
} from '@agiworkforce/types';
import {
  AUTO_MODES as MOBILE_AUTO_MODES,
  DEFAULT_AUTO_MODE_ID as MOBILE_DEFAULT_AUTO_MODE_ID,
  MODEL_LIST as CLOUD_MODEL_LIST,
  getCloudModelsForTier,
  getProviderById as getCloudProviderById,
  type AutoModeDef as MobileAutoModeDef,
  type ModelDef as CloudModelDef,
} from '@/lib/models';

export type ModelTier = PickerModelTier;
export type ModelSurface = 'local' | 'cloud_managed';
export type ModelAvailability = 'ready' | 'download_required' | 'locked';

export interface ModelDef {
  id: string;
  name: string;
  provider: string;
  providerLabel: string;
  contextWindow: number;
  maxOutput: number;
  supportsVision: boolean;
  supportsThinking: boolean;
  tier: ModelTier;
  surface: ModelSurface;
  availability: ModelAvailability;
  runtimeLabel: string;
  detailLabel: string;
  description?: string;
  lockReason?: string;
  fileSizeBytes?: number;
  executorchPreset?: OnDeviceModel['executorchPreset'];
  license?: string;
  isNew?: boolean;
}

export interface ProviderDef {
  id: string;
  name: string;
  icon: string;
}

export type AutoModeDef = MobileAutoModeDef;

const LOCAL_PROVIDER_ID = 'local';
export const CLOUD_LOCK_REASON = 'Sign in to use AGI Cloud chat.';

function tierUpgradeLockReason(modelId: string): string {
  const required = getMinimumRequiredTier(modelId);
  return required === 'max'
    ? 'Upgrade to Max to use this model.'
    : 'Upgrade your plan to use this model.';
}

const FREE_TIER_ECONOMY_MODEL_IDS = new Set(getAllowedModelsForTier('economy'));

export function canAccessCloudModelForTier(modelId: string, subscriptionTier: string): boolean {
  const canonicalModelId = normalizeModelId(modelId) ?? modelId;
  if (subscriptionTier.toLowerCase() !== 'free') {
    return getCloudModelsForTier(subscriptionTier).some((model) => model.id === canonicalModelId);
  }
  return FREE_TIER_ECONOMY_MODEL_IDS.has(canonicalModelId);
}

// SAFETY: no current model sets `requiresEnvironment`, so Phase A is a

export function environmentAvailability(_env: ModelEnvironment): EnvironmentAvailability {
  return { configured: false };
}

export function applyEnvironmentGate(
  def: ModelDef,
  requiresEnvironment: ModelEnvironment | undefined,
): ModelDef {
  if (!requiresEnvironment) return def;
  const verdict = evaluateModelEnvironment(
    requiresEnvironment,
    environmentAvailability(requiresEnvironment),
  );
  if (verdict.selectable) return def;
  return { ...def, availability: 'locked', lockReason: verdict.reason };
}

/**
 * Selectability lives in `./catalogSelectability` so a caller that only needs
 * the predicate (first-run onboarding) does not have to import this module and
 * trigger the catalog evaluation below. Re-exported here because this is where
 * every existing consumer looks for it.
 */
export { isSelectableLocalCatalogModel } from './catalogSelectability';

const SHIPPABLE_LOCAL_MODELS = getCatalogShippableModels().filter(isSelectableLocalCatalogModel);
if (SHIPPABLE_LOCAL_MODELS.length === 0) {
  throw new Error('The local model catalog has no shippable model for Mobile');
}

const catalogDefaultLocalModel = getCatalogDefaultModel();
const DEFAULT_LOCAL_MODEL =
  SHIPPABLE_LOCAL_MODELS.find((model) => model.id === catalogDefaultLocalModel.id) ??
  SHIPPABLE_LOCAL_MODELS.find((model) => model.role === 'default') ??
  SHIPPABLE_LOCAL_MODELS[0]!;
const CLOUD_MODEL_SOURCE = Array.isArray(CLOUD_MODEL_LIST) ? CLOUD_MODEL_LIST : [];
const MOBILE_CLOUD_PROVIDER_IDS = Array.from(
  new Set(CLOUD_MODEL_SOURCE.map((model) => model.provider)),
);
const cloudModelSourceById = new Map<string, CloudModelDef>(
  CLOUD_MODEL_SOURCE.map((model) => [model.id, model]),
);

export const DEFAULT_LOCAL_MODEL_ID = DEFAULT_LOCAL_MODEL.id;

export const AUTO_MODES: AutoModeDef[] = MOBILE_AUTO_MODES;
export const DEFAULT_AUTO_MODE_ID = MOBILE_DEFAULT_AUTO_MODE_ID;

export const PROVIDERS: ProviderDef[] = [
  {
    id: LOCAL_PROVIDER_ID,
    name: 'On device',
    icon: 'Cpu',
  },
  {
    id: 'cloud_managed',
    name: 'AGI Cloud',
    icon: 'Cloud',
  },
];

function tierForLocalModel(model: OnDeviceModel): ModelTier {
  switch (model.role) {
    case 'lite-mode':
      return 'economy';
    case 'premium-vision-pack':
    case 'premium-multimodal-alt':
      return 'premium';
    default:
      return 'balanced';
  }
}

function runtimeLabel(model: OnDeviceModel): string {
  if (model.supportedRuntimes.includes('apple-foundation-models')) return 'Apple on-device';
  if (model.supportedRuntimes.includes('aicore')) return 'Android AICore';
  if (model.supportedRuntimes.includes('executorch')) return 'ExecuTorch';
  return 'llama.rn';
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return 'Built in';
  const gib = bytes / 1024 / 1024 / 1024;
  return `${gib >= 1 ? gib.toFixed(gib >= 10 ? 0 : 1) : '<1'} GB`;
}

function detailForLocalModel(model: OnDeviceModel): string {
  const parts = [runtimeLabel(model), formatSize(model.fileSizeBytes)];
  if (model.capabilities.visionIn) parts.push('Vision');
  if (model.capabilities.structuredOutput) parts.push('Structured');
  return parts.join(' - ');
}

function maxOutputForContext(contextWindow: number): number {
  return Math.min(8192, Math.max(1024, Math.floor(contextWindow / 4)));
}

function toLocalModelDef(model: OnDeviceModel): ModelDef {
  const def: ModelDef = {
    id: model.id,
    name: model.displayName,
    provider: LOCAL_PROVIDER_ID,
    providerLabel: 'On device',
    contextWindow: model.contextWindow,
    maxOutput: maxOutputForContext(model.contextWindow),
    supportsVision: model.capabilities.visionIn,
    supportsThinking: false,
    tier: tierForLocalModel(model),
    surface: 'local',
    availability: model.fileSizeBytes === 0 ? 'ready' : 'download_required',
    runtimeLabel: runtimeLabel(model),
    detailLabel: detailForLocalModel(model),
    description: `${model.displayName} runs on this device`,
    fileSizeBytes: model.fileSizeBytes,
    executorchPreset: model.executorchPreset,
    license: model.license,
  };
  return applyEnvironmentGate(def, undefined);
}

function toCloudModelDef(
  model: CloudModelDef,
  cloudUnlocked: boolean,
  subscriptionTier?: string,
): ModelDef {
  const providerLabel = getCloudProviderById(model.provider)?.name ?? model.provider;

  const tierAccessOk =
    !cloudUnlocked || !subscriptionTier || canAccessCloudModelForTier(model.id, subscriptionTier);
  const availability: ModelAvailability = !cloudUnlocked || !tierAccessOk ? 'locked' : 'ready';
  const lockReason = !cloudUnlocked
    ? CLOUD_LOCK_REASON
    : !tierAccessOk
      ? tierUpgradeLockReason(model.id)
      : undefined;

  const metadata = getModelMetadataById(model.id);
  const bestFor = metadata?.bestFor?.slice(0, 2).join(', ');

  const def: ModelDef = {
    id: model.id,
    name: model.name,
    provider: model.provider,
    providerLabel,
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput,
    supportsVision: model.supportsVision,
    supportsThinking: model.supportsThinking,
    tier: model.tier,
    surface: 'cloud_managed',
    availability,
    runtimeLabel: 'AGI Cloud',
    detailLabel: !cloudUnlocked
      ? 'Sign in required'
      : !tierAccessOk
        ? 'Upgrade required'
        : `${providerLabel} provider`,
    description: bestFor ? `Best for ${bestFor}` : `${model.name} via ${providerLabel}`,
    lockReason,
  };

  const requiresEnvironment = getModelMetadataById(model.id)?.requiresEnvironment;
  return applyEnvironmentGate(def, requiresEnvironment);
}

function firstCloudModelByProvider(providerId: string): CloudModelDef | undefined {
  return CLOUD_MODEL_SOURCE.find((model) => model.provider === providerId);
}

function cloudPreviewModelByProvider(providerId: string): CloudModelDef | undefined {
  return firstCloudModelByProvider(providerId);
}

export const LOCAL_MODEL_LIST: ModelDef[] = SHIPPABLE_LOCAL_MODELS.map(toLocalModelDef);

export const LOCKED_CLOUD_MODELS: ModelDef[] = [...MOBILE_CLOUD_PROVIDER_IDS]
  .map(cloudPreviewModelByProvider)
  .filter((model): model is CloudModelDef => Boolean(model))
  .map((model) => toCloudModelDef(model, false));

export const MODEL_LIST: ModelDef[] = [...LOCAL_MODEL_LIST, ...LOCKED_CLOUD_MODELS];
export const DEFAULT_CLOUD_MODEL_ID = getDefaultModelFor(undefined, 'chat');

export function getDefaultCloudModelIdForTier(subscriptionTier?: string): string | undefined {
  const modelId = getDefaultModelFor(subscriptionTier, 'chat');
  return cloudModelSourceMap.has(modelId) ? modelId : DEFAULT_CLOUD_MODEL_ID;
}

const localModelMap = new Map<string, ModelDef>(LOCAL_MODEL_LIST.map((model) => [model.id, model]));
const cloudModelSourceMap = cloudModelSourceById;
const allModelMap = new Map<string, ModelDef>(MODEL_LIST.map((model) => [model.id, model]));
const providerMap = new Map<string, ProviderDef>(
  PROVIDERS.map((provider) => [provider.id, provider]),
);
const autoModeMap = new Map<string, AutoModeDef>(AUTO_MODES.map((mode) => [mode.id, mode]));

export function getModelById(id: string): ModelDef | undefined {
  return allModelMap.get(id);
}

export function getSelectableModelById(id: string): ModelDef | undefined {
  return localModelMap.get(id);
}

export function isCloudManagedModelId(id: string): boolean {
  return cloudModelSourceMap.has(id);
}

export function isSelectableModelId(id: string): boolean {
  return autoModeMap.has(id) || localModelMap.has(id);
}

export function isSelectableModelIdForCloudAccess(id: string, cloudUnlocked: boolean): boolean {
  return isSelectableModelId(id) || (cloudUnlocked && isCloudManagedModelId(id));
}

export function isSelectableModelIdForAccess(
  id: string,
  cloudUnlocked: boolean,
  subscriptionTier: string,
): boolean {
  if (isSelectableModelId(id)) return true;
  return (
    cloudUnlocked && isCloudManagedModelId(id) && canAccessCloudModelForTier(id, subscriptionTier)
  );
}

export function getAutoModeById(id: string): AutoModeDef | undefined {
  return autoModeMap.get(id);
}

export function getModelByIdForCloudAccess(
  id: string,
  cloudUnlocked: boolean,
  subscriptionTier?: string,
): ModelDef | undefined {
  const cloudModel = cloudModelSourceMap.get(id);
  if (cloudModel) return toCloudModelDef(cloudModel, cloudUnlocked, subscriptionTier);
  return getModelById(id);
}

export function getModelListForCloudAccess(
  cloudUnlocked: boolean,
  subscriptionTier?: string,
): ModelDef[] {
  if (!cloudUnlocked) return MODEL_LIST;
  const cloudDefs = Array.from(cloudModelSourceMap.values()).map((model) =>
    toCloudModelDef(model, true, subscriptionTier),
  );
  return [...LOCAL_MODEL_LIST, ...cloudDefs];
}

export function getModelsByProvider(providerId: string): ModelDef[] {
  return MODEL_LIST.filter((model) => model.provider === providerId);
}

export function getProviderById(id: string): ProviderDef | undefined {
  return providerMap.get(id);
}

export function isAutoMode(id: string): boolean {
  return autoModeMap.has(id);
}

export function getDisplayName(id: string): string {
  const autoMode = autoModeMap.get(id);
  if (autoMode) return autoMode.name;
  return cloudModelSourceMap.get(id)?.name ?? getModelById(id)?.name ?? id;
}

export function getManagedDisplayName(id: string | null | undefined): string {
  const normalizedId = id?.trim() ?? '';
  if (!normalizedId) return 'Unavailable model';
  const autoMode = autoModeMap.get(normalizedId);
  if (autoMode) return autoMode.name;
  return cloudModelSourceMap.get(normalizedId)?.name ?? 'Unavailable model';
}

export const UNKNOWN_MODEL_LABEL = 'Not set';

export function getShortDisplayName(id: string, subscriptionTier?: string): string {
  const autoMode = autoModeMap.get(id);
  if (autoMode) return autoMode.name;
  const model = getModelByIdForCloudAccess(id, true, subscriptionTier);
  return model?.name ?? UNKNOWN_MODEL_LABEL;
}

export function getDefaultSelectableModelId(id?: string | null): string {
  if (id && isSelectableModelId(id)) return id;
  return DEFAULT_LOCAL_MODEL_ID;
}

export async function fetchModelCatalog(): Promise<ModelDef[]> {
  return MODEL_LIST;
}
