/**
 * Local + sign-in-gated Managed Cloud model catalog for Mobile.
 *
 * Active/selectable rows come from @agiworkforce/local-llm. Cloud provider
 * models are included as gated rows and become selectable once the signed-in
 * entitlement proves AGI Cloud access (public alpha — no invite, no waitlist).
 * This service never fetches `/api/models`.
 */

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
  /** Short marketing description shown in the model picker below the name. */
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

/**
 * Subscription-tier gate for cloud models as the SERVER actually enforces it.
 *
 * The shared tier + Mobile runtime selector owns paid access. The server's
 * free-trial path additionally accepts economy-list models from
 * free users (apps/web/lib/free-trial-config.ts FREE_TRIAL_MODELS =
 * getAllowedModelsForTier('economy')). Mirror that allowance so the picker
 * never locks a model the server would serve.
 */
export function canAccessCloudModelForTier(modelId: string, subscriptionTier: string): boolean {
  const canonicalModelId = normalizeModelId(modelId) ?? modelId;
  if (subscriptionTier.toLowerCase() !== 'free') {
    return getCloudModelsForTier(subscriptionTier).some((model) => model.id === canonicalModelId);
  }
  return FREE_TIER_ECONOMY_MODEL_IDS.has(canonicalModelId);
}

// ---------------------------------------------------------------------------
// P3 Phase A: Environment-gating helpers
//
// `environmentAvailability` returns the runtime availability signal for a
// required execution environment. Phase A always returns `{ configured: false }`,
// locking every env-gated model in the picker until Phase B wires the real
// signal:
//   - 'e2b'           → managed-compute beta enabled + reachable (Phase B)
//   - 'local-runtime' → on-device runtime installed + ready (Phase B)
//
// SAFETY: no current model sets `requiresEnvironment`, so Phase A is a
// pure no-op for all live catalog rows.
// ---------------------------------------------------------------------------

/** Phase A stub — Phase B replaces with real env probe. */
export function environmentAvailability(_env: ModelEnvironment): EnvironmentAvailability {
  // Phase B: check managed-compute beta flag for 'e2b';
  //          check installed local runtime for 'local-runtime'.
  return { configured: false };
}

/**
 * Apply environment gating as the final transform on any ModelDef.
 * When `requiresEnvironment` is set and the environment is unavailable,
 * overrides `availability` to 'locked' and sets `lockReason` to the verdict
 * reason from `evaluateModelEnvironment`.
 *
 * Must be called AFTER all other availability assignments so that env-locked
 * models stay locked even when cloud is unlocked.
 *
 * When `requiresEnvironment` is undefined (all current models), returns `def`
 * unchanged — zero cost to existing rows.
 */
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

/** Canonical Auto profiles with Mobile-only icon presentation. */
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
  // NOTE: OnDeviceModel does not carry requiresEnvironment today — local-runtime
  // gating is unwireable until the local catalog exposes the field (Phase B).
  // Passing `undefined` is a safe no-op for all current on-device models.
  return applyEnvironmentGate(def, undefined);
}

function toCloudModelDef(
  model: CloudModelDef,
  cloudUnlocked: boolean,
  subscriptionTier?: string,
): ModelDef {
  const providerLabel = getCloudProviderById(model.provider)?.name ?? model.provider;

  // Two independent gates: signed-in-and-cloud-unlocked (public alpha access),
  // then subscription-tier access to THIS model specifically (e.g. Opus/flagship
  // models require Max). A Pro user is cloud-unlocked but must still see this
  // model as locked with an upgrade reason, not as freely selectable — this is
  // the same catalog gate `canAccessModel` enforces server-side
  // (apps/web/lib/model-tiers.ts), so a model rejected server-side is never
  // shown as usable client-side.
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

  // Apply environment gate LAST so env-locked models remain locked even when
  // cloud is unlocked. CloudModelDef (from getPickerModels/PickerModelView)
  // does not carry requiresEnvironment — look it up from the canonical catalog.
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

/**
 * Tier-aware cloud default, for call sites that auto-select a model on
 * mode-switch / tier-revalidation (never for the user's own explicit pick).
 *
 * The shared registry owns the default for each tier. Mobile only verifies
 * that the returned model is admitted by the `mobile/cloud-chat` runtime
 * profile before exposing it to the app.
 */
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

/**
 * Validate a selection against both the Local/Cloud trust boundary and the
 * user's current Cloud plan. Persisted Mobile state and conversation metadata
 * must use this same predicate as the picker so a downgraded account cannot
 * restore and dispatch a model the UI would correctly show as locked.
 */
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

/**
 * Resolve a model id to the name a user should see.
 *
 * `allModelMap` holds the local models plus ONE preview cloud model per
 * provider (LOCKED_CLOUD_MODELS), not the whole cloud catalog — so looking a
 * cloud id up there missed almost every cloud model and fell through to the
 * raw wire id. The Models screen therefore exposed a catalog key while the
 * composer chip, which goes through getShortDisplayName, showed its name.
 *
 * Consulting the full cloud source first makes both helpers agree. The id
 * remains the last-resort fallback for an id no registry knows.
 */
export function getDisplayName(id: string): string {
  const autoMode = autoModeMap.get(id);
  if (autoMode) return autoMode.name;
  return cloudModelSourceMap.get(id)?.name ?? getModelById(id)?.name ?? id;
}

/**
 * Managed Cloud receipts must resolve through the current cloud catalog.
 * Unknown historical ids describe removed capacity, not dynamic local models.
 */
export function getManagedDisplayName(id: string | null | undefined): string {
  const normalizedId = id?.trim() ?? '';
  if (!normalizedId) return 'Unavailable model';
  const autoMode = autoModeMap.get(normalizedId);
  if (autoMode) return autoMode.name;
  return cloudModelSourceMap.get(normalizedId)?.name ?? 'Unavailable model';
}

/**
 * Shown when a persisted selection matches nothing the catalog knows.
 *
 * This helper feeds user-facing chrome (the composer model chip, the Models
 * settings row, the Add-to-chat sheet). Falling back to the id printed a raw
 * wire value into those surfaces, which is developer output, not a model name.
 * A neutral label is the truthful answer: the app
 * cannot name a model it no longer ships.
 */
export const UNKNOWN_MODEL_LABEL = 'Not set';

export function getShortDisplayName(id: string, subscriptionTier?: string): string {
  const autoMode = autoModeMap.get(id);
  if (autoMode) return autoMode.name;
  // Always show the actual model name — the composer's model chip is the
  // single source of truth for the active model. A generic "AGI Cloud" label
  // here hid the selection and duplicated the mode toggle's Cloud copy.
  //
  // The tier argument remains for source compatibility; tier controls access,
  // never model identity or provenance labels.
  const model = getModelByIdForCloudAccess(id, true, subscriptionTier);
  return model?.name ?? UNKNOWN_MODEL_LABEL;
}

export function getDefaultSelectableModelId(id?: string | null): string {
  if (id && isSelectableModelId(id)) return id;
  return DEFAULT_LOCAL_MODEL_ID;
}

/**
 * Async shape kept for existing consumers/tests. This intentionally returns
 * embedded local/locked metadata only and performs no network request.
 */
export async function fetchModelCatalog(): Promise<ModelDef[]> {
  return MODEL_LIST;
}
