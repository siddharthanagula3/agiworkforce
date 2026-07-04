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
} from '@agiworkforce/local-llm';
import type { OnDeviceModel, PickerModelTier } from '@agiworkforce/types';
import {
  evaluateModelEnvironment,
  getModelMetadataById,
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
 * an ExecuTorch preset.
 */
const SYSTEM_RUNTIME_ONLY = new Set(['apple-foundation-models', 'aicore']);

// Backlog: this always excludes system-runtime-only rows rather than showing them
// once native async capability detection confirms the runtime is actually active.
// Making the catalog reactive to that detection is a separate scope item, not done here.
function isSystemRuntimeOnly(model: OnDeviceModel): boolean {
  return model.supportedRuntimes.every((r) => SYSTEM_RUNTIME_ONLY.has(r));
}

function isSelectableLocalCatalogModel(model: OnDeviceModel): boolean {
  if (isSystemRuntimeOnly(model)) return false;
  if (model.fileSizeBytes <= 0) return true;
  return Boolean(model.executorchPreset);
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

// Public-facing capability labels for specific cloud models: we surface what the
// model is good for ("Super Fast", "Thinking") instead of the raw model id, while
// the provider logo still identifies who makes it. Scoped to explicit ids so every
// other model keeps its real name until we deliberately extend this mapping.
// FIXME(P1): migrate these labels to a catalog-driven capability/label field so the
// model-id keys are not hardcoded here (mobile cheapest-tier display names).
/* eslint-disable no-restricted-syntax -- curated mobile display-name map; explicit model ids are intentional and degrade gracefully (override simply not applied if an id is renamed) */
const CLOUD_DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  'gpt-4.1-nano': 'Super Fast', // OpenAI: no reasoning tokens — fastest, cheapest
  'gemini-3.1-flash-lite': 'Super Fast', // Google: cheapest fast chat model
  'qwen-flash': 'Super Fast', // Qwen: cheap general-chat (cloud-only; ~403 conv/$1)
  'gpt-5-nano': 'Thinking', // OpenAI: supports reasoning tokens
};
/* eslint-enable no-restricted-syntax */

function toCloudModelDef(model: CloudModelDef, cloudUnlocked: boolean): ModelDef {
  const providerLabel = getCloudProviderById(model.provider)?.name ?? model.provider;

  const def: ModelDef = {
    id: model.id,
    name:
      CLOUD_DISPLAY_NAME_OVERRIDES[model.id] ||
      model.name ||
      CLOUD_ROUTE_FALLBACK_NAMES[model.provider] ||
      'AGI Cloud',
    provider: model.provider,
    providerLabel,
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput,
    supportsVision: model.supportsVision,
    supportsThinking: model.supportsThinking,
    tier: model.tier,
    surface: 'cloud_managed',
    availability: cloudUnlocked ? 'ready' : 'locked',
    runtimeLabel: 'AGI Cloud',
    detailLabel: cloudUnlocked ? `${providerLabel} provider` : 'Sign in required',
    description: `${providerLabel} model in AGI Cloud`,
    lockReason: cloudUnlocked ? undefined : CLOUD_LOCK_REASON,
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
): ModelDef | undefined {
  const cloudModel = cloudModelSourceMap.get(id);
  if (cloudModel) return toCloudModelDef(cloudModel, cloudUnlocked);
  return getModelById(id);
}

export function getModelListForCloudAccess(cloudUnlocked: boolean): ModelDef[] {
  if (!cloudUnlocked) return MODEL_LIST;
  return [
    ...LOCAL_MODEL_LIST,
    ...Array.from(cloudModelSourceMap.values()).map((model) => toCloudModelDef(model, true)),
  ];
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
  const model = getModelByIdForCloudAccess(id, true);
  if (model?.surface === 'cloud_managed') return 'AGI Cloud';
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
