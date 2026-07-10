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
  getModelById as getCatalogModelById,
  getShippableModels as getCatalogShippableModels,
  hasRunnableGgufArtifacts,
} from '@agiworkforce/local-llm';
import type { OnDeviceModel, PickerModelTier } from '@agiworkforce/types';
import {
  evaluateModelEnvironment,
  getModelMetadataById,
  canAccessModelForSubscriptionTier,
  getAllowedModelsForTier,
  getMinimumRequiredTier,
  normalizeBillingPlanTier,
  normalizeModelId,
  type EnvironmentAvailability,
  type ModelEnvironment,
} from '@agiworkforce/types';
import {
  MODEL_LIST as CLOUD_MODEL_LIST,
  getProviderById as getCloudProviderById,
  type ModelDef as CloudModelDef,
} from '@/lib/models';
import { getProviderProbeModel } from '@agiworkforce/types';

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

export interface AutoModeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: ModelTier;
}

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
 * `canAccessModelForSubscriptionTier` alone rejects every model for tier
 * 'free', but the server's free-trial path accepts economy-list models from
 * free users (apps/web/lib/free-trial-config.ts FREE_TRIAL_MODELS =
 * getAllowedModelsForTier('economy')). Mirror that allowance so the picker
 * never locks a model the server would serve.
 */
export function canAccessCloudModelForTier(modelId: string, subscriptionTier: string): boolean {
  if (canAccessModelForSubscriptionTier(modelId, subscriptionTier)) return true;
  const canonicalModelId = normalizeModelId(modelId) ?? modelId;
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
 * Static model descriptions shown as a subtitle in the picker.
 * Keyed by model id (exact) — purely marketing copy, never used for routing.
 * models.json does not carry per-model description strings today,
 * so we maintain them here as a static lookup.
 *
 * The string keys below are display/marketing identifiers, not routing literals.
 * eslint-disable-next-line is intentional: these are picker labels, not model
 * resolution calls.
 */

const MODEL_DESCRIPTIONS: Record<string, string> = {
  // Local / on-device

  'qwen3-4b-instruct-2507': 'Efficient on-device model for everyday tasks',

  'llama-3.2-1b-instruct-spinquant': 'Lightweight model for quick responses',
  // Apple on-device

  'apple-afm-on-device': 'Built-in Apple Intelligence model',
  // Cloud providers (shown as locked in v1 — informational only)
  // Anthropic
  // eslint-disable-next-line no-restricted-syntax
  'claude-opus-4.8': 'Most capable for ambitious work',
  // eslint-disable-next-line no-restricted-syntax
  'claude-sonnet-4.6': 'Most efficient for everyday tasks',
  // eslint-disable-next-line no-restricted-syntax
  'claude-haiku-4.5': 'Fastest for quick answers',
  // OpenAI
  // eslint-disable-next-line no-restricted-syntax
  'gpt-5.5': 'Most capable managed model',
  // eslint-disable-next-line no-restricted-syntax
  'gpt-5.4-mini': 'Fast and affordable responses',
  // Google
  // eslint-disable-next-line no-restricted-syntax
  'gemini-3.1-pro-preview': 'Most capable multimodal model',
  // eslint-disable-next-line no-restricted-syntax
  'gemini-3.1-flash-lite': 'Fast and efficient multimodal model',
};

const CLOUD_ROUTE_FALLBACK_NAMES: Record<string, string> = {
  openai: 'AGI Cloud',
  anthropic: 'AGI Cloud Advanced',
  google: 'AGI Cloud Multimodal',
  xai: 'AGI Cloud Fast',
  deepseek: 'AGI Cloud Code',
  qwen: 'AGI Cloud Efficient',
  moonshot: 'AGI Cloud Long Context',
};

const FALLBACK_LOCAL_MODEL: OnDeviceModel = {
  id: 'qwen3-4b-instruct-2507',
  displayName: 'AGI Standard',
  family: 'qwen3',
  paramCountB: 4,
  fileSizeBytes: 2_147_483_648,
  supportedRuntimes: ['executorch', 'llama-rn'],
  contextWindow: 262_144,
  capabilities: {
    text: true,
    visionIn: false,
    audioIn: false,
    toolCalls: true,
    structuredOutput: true,
  },
  license: 'Apache-2.0',
  role: 'default',
  shipsInV1: true,
};

/**
 * The catalog includes future local models before all native packages are
 * shippable on Mobile. The picker only shows rows that can actually be used:
 * system-runtime rows when their runtime is active, or downloadable rows with
 * either an ExecuTorch preset (tier 2) or verified llama-rn GGUF artifacts
 * (tier 3, incl. multimodal base+mmproj pairs).
 */
const SYSTEM_RUNTIME_ONLY = new Set(['apple-foundation-models', 'aicore']);

// Backlog: this always excludes system-runtime-only rows rather than showing them
// once native async capability detection confirms the runtime is actually active.
// Making the catalog reactive to that detection is a separate scope item, not done here.
function isSystemRuntimeOnly(model: OnDeviceModel): boolean {
  return model.supportedRuntimes.every((r) => SYSTEM_RUNTIME_ONLY.has(r));
}

/**
 * Exported for unit tests. Note this predicate is applied to SHIPPABLE catalog
 * rows only (`getShippableModels()` already filters `shipsInV1`) — a
 * `shipsInV1:false` row like the qwen3-vl vision pack never reaches it in
 * production listing, regardless of what it returns.
 */
export function isSelectableLocalCatalogModel(model: OnDeviceModel): boolean {
  if (isSystemRuntimeOnly(model)) return false;
  if (model.fileSizeBytes <= 0) return true;
  if (model.executorchPreset) return true;
  try {
    return hasRunnableGgufArtifacts(model);
  } catch {
    // Tests may mock @agiworkforce/local-llm partially; keep the picker stable.
    return false;
  }
}

function safeGetShippableModels(): OnDeviceModel[] {
  try {
    if (typeof getCatalogShippableModels === 'function') {
      const models = getCatalogShippableModels();
      const selectable = models.filter(isSelectableLocalCatalogModel);
      if (Array.isArray(selectable) && selectable.length > 0) return selectable;
    }
  } catch {
    // Tests may mock @agiworkforce/local-llm partially; keep the picker stable.
  }

  try {
    if (typeof getCatalogDefaultModel === 'function') {
      return [getCatalogDefaultModel()];
    }
  } catch {
    // Fall through to direct lookup or static fallback.
  }

  try {
    if (typeof getCatalogModelById === 'function') {
      const model = getCatalogModelById(FALLBACK_LOCAL_MODEL.id);
      if (model) return [model];
    }
  } catch {
    // Fall through to static fallback.
  }

  return [FALLBACK_LOCAL_MODEL];
}

function safeGetDefaultModel(models: OnDeviceModel[]): OnDeviceModel {
  try {
    if (typeof getCatalogDefaultModel === 'function') {
      return getCatalogDefaultModel();
    }
  } catch {
    // Fall through to local list fallback.
  }

  return models.find((model) => model.role === 'default') ?? models[0] ?? FALLBACK_LOCAL_MODEL;
}

const SHIPPABLE_LOCAL_MODELS = safeGetShippableModels();
const DEFAULT_LOCAL_MODEL = safeGetDefaultModel(SHIPPABLE_LOCAL_MODELS);
const MOBILE_CLOUD_PROVIDER_IDS = [
  'openai',
  'anthropic',
  'google',
  'xai',
  'deepseek',
  'qwen',
  'moonshot',
] as const;
const MOBILE_CLOUD_PROVIDER_SET = new Set<string>(MOBILE_CLOUD_PROVIDER_IDS);
const CLOUD_MODEL_SOURCE = Array.isArray(CLOUD_MODEL_LIST)
  ? CLOUD_MODEL_LIST.filter((model) => MOBILE_CLOUD_PROVIDER_SET.has(model.provider))
  : [];
const cloudModelSourceById = new Map<string, CloudModelDef>(
  CLOUD_MODEL_SOURCE.map((model) => [model.id, model]),
);

export const DEFAULT_LOCAL_MODEL_ID = DEFAULT_LOCAL_MODEL.id;

export const AUTO_MODES: AutoModeDef[] = [
  {
    id: 'auto-balanced',
    name: 'Best',
    description: 'Best local model for this device',
    icon: 'Cpu',
    tier: 'balanced',
  },
  {
    id: 'auto-economy',
    name: 'Lite',
    description: 'Small local model when battery matters',
    icon: 'Zap',
    tier: 'economy',
  },
];

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
    description: MODEL_DESCRIPTIONS[model.id],
    fileSizeBytes: model.fileSizeBytes,
    executorchPreset: model.executorchPreset,
    license: model.license,
  };
  // NOTE: OnDeviceModel does not carry requiresEnvironment today — local-runtime
  // gating is unwireable until the local catalog exposes the field (Phase B).
  // Passing `undefined` is a safe no-op for all current on-device models.
  return applyEnvironmentGate(def, undefined);
}

// ---------------------------------------------------------------------------
// Subscription-tier presentation (Free/Basic = capability presets, Pro+ = real
// provider model names).
//
// Free and Basic users pick CAPABILITIES ("Super Fast", "Thinking", "Coder");
// the model-id mapping stays internal. Pro and above see the actual provider
// models with no preset names anywhere. The underlying access set matches the
// server gate exactly (economy list for Free/Basic — canAccessCloudModelForTier).
//
// FIXME(P1): migrate these labels to a catalog-driven capability/label field so
// the model-id keys are not hardcoded here.
// ---------------------------------------------------------------------------

/* eslint-disable no-restricted-syntax -- curated capability-preset map over the economy tier list; explicit model ids are intentional and degrade gracefully (a renamed id simply keeps its real name) */
const CAPABILITY_PRESET_NAMES: Record<string, string> = {
  'gpt-4.1-nano': 'Super Fast', // OpenAI: no reasoning tokens — fastest, cheapest
  'gemini-3.1-flash-lite': 'Super Fast', // Google: cheapest fast chat model
  'gpt-5-nano': 'Thinking', // OpenAI: supports reasoning tokens
  'gpt-5.4-mini': 'Fast', // OpenAI: fast, affordable mini
  'claude-haiku-4.5': 'Fast', // Anthropic: fastest tier
  'deepseek-v4-flash': 'Coder', // DeepSeek: code-focused flash model
  'qwen-3.5-plus': 'Balanced', // Qwen: multimodal all-rounder
  'kimi-k2.6': 'Balanced', // Moonshot: multimodal all-rounder
  'glm-5.2': 'Thinking', // Zhipu: reasoning model
  sonar: 'Search', // Perplexity: search-grounded answers
};

/** Free plan keeps the picker minimal: only these presets appear as available
 *  (OpenAI Super Fast/Thinking + Google Super Fast). Everything else shows as
 *  locked upsell rows. NOTE: the QA spec also calls for a "Google Thinking"
 *  free preset, but the economy tier list has no reasoning-capable Google
 *  model — tracked gap, needs a catalog/tier decision, not a client hack. */
const FREE_TIER_PRESET_MODEL_IDS = new Set(['gpt-4.1-nano', 'gpt-5-nano', 'gemini-3.1-flash-lite']);
/* eslint-enable no-restricted-syntax */

/** True when this subscription tier sees real provider model names (Pro+). */
export function tierShowsRealModelNames(subscriptionTier?: string): boolean {
  const tier = normalizeBillingPlanTier(subscriptionTier);
  return tier === 'pro' || tier === 'max' || tier === 'team' || tier === 'enterprise';
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

  // Free/Basic (and signed-out previews) see capability presets; Pro+ sees
  // real provider model names with no presets anywhere.
  const presetName = tierShowsRealModelNames(subscriptionTier)
    ? undefined
    : CAPABILITY_PRESET_NAMES[model.id];

  const def: ModelDef = {
    id: model.id,
    name: presetName || model.name || CLOUD_ROUTE_FALLBACK_NAMES[model.provider] || 'AGI Cloud',
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
    description: MODEL_DESCRIPTIONS[model.id] ?? `${providerLabel} model in AGI Cloud`,
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
  const probeModelId = getProviderProbeModel(providerId);
  const probeModel = probeModelId ? cloudModelSourceById.get(probeModelId) : undefined;
  if (probeModel?.provider === providerId) return probeModel;
  return firstCloudModelByProvider(providerId);
}

export const LOCAL_MODEL_LIST: ModelDef[] = SHIPPABLE_LOCAL_MODELS.map(toLocalModelDef);

export const LOCKED_CLOUD_MODELS: ModelDef[] = [...MOBILE_CLOUD_PROVIDER_IDS]
  .map(cloudPreviewModelByProvider)
  .filter((model): model is CloudModelDef => Boolean(model))
  .map((model) => toCloudModelDef(model, false));

export const MODEL_LIST: ModelDef[] = [...LOCAL_MODEL_LIST, ...LOCKED_CLOUD_MODELS];
export const DEFAULT_CLOUD_MODEL_ID =
  cloudPreviewModelByProvider('openai')?.id ?? LOCKED_CLOUD_MODELS[0]?.id;

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
  let cloudDefs = Array.from(cloudModelSourceMap.values()).map((model) =>
    toCloudModelDef(model, true, subscriptionTier),
  );
  // Free plan keeps the picker minimal: only the curated presets appear as
  // available; the rest of the economy list is hidden (not shown at all) and
  // premium models stay visible as locked upsell rows.
  if (normalizeBillingPlanTier(subscriptionTier) === 'free') {
    cloudDefs = cloudDefs.filter(
      (def) => def.availability === 'locked' || FREE_TIER_PRESET_MODEL_IDS.has(def.id),
    );
  }
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
  return getModelById(id)?.name ?? id;
}

export function getShortDisplayName(id: string): string {
  const autoMode = autoModeMap.get(id);
  if (autoMode) return autoMode.name;
  // Always show the actual model name — the composer's model chip is the
  // single source of truth for the active model. A generic "AGI Cloud" label
  // here hid the selection and duplicated the mode toggle's Cloud copy.
  const model = getModelByIdForCloudAccess(id, true);
  return model?.name ?? id;
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
