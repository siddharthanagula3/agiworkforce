import type {
  DeviceCapabilities,
  GenerateOptions,
  GenerateResult,
  LocalRuntimeName,
  LocalRuntimeTier,
} from './types';
import { detectCapabilities } from './capabilities';
import { tier1Generate } from './tier1';
import { tier2Generate } from './tier2';
import { tier3Generate } from './tier3';
import { getDefaultModel, getLiteModeModel, getModelById } from './catalog';
import type { ExecutorchPreset } from '@agiworkforce/types';

// Cached capability snapshot — refreshed on demand or app resume.
let _caps: DeviceCapabilities | null = null;

export async function getCapabilities(): Promise<DeviceCapabilities> {
  if (!_caps) {
    _caps = await detectCapabilities();
  }
  return _caps;
}

export async function refreshCapabilities(): Promise<DeviceCapabilities> {
  _caps = await detectCapabilities();
  return _caps;
}

export async function selectTier(opts: {
  modelPath?: string;
  modelId?: string;
}): Promise<{ tier: LocalRuntimeTier; runtime: LocalRuntimeName }> {
  const caps = await getCapabilities();
  const ref = normalizeModelRef(opts.modelPath, opts.modelId);

  if (caps.thermalThrottled) {
    throw new Error('Device is thermally throttled — inference paused. Try again in a moment.');
  }

  if (
    caps.tier1Available &&
    caps.tier1Runtime &&
    canUseTier1ForModel(ref.modelId, caps.tier1Runtime)
  ) {
    return { tier: 1, runtime: caps.tier1Runtime };
  }

  if (caps.tier2Available && resolvePreset(ref.modelId)) {
    return { tier: 2, runtime: 'executorch' };
  }

  if (ref.modelPath) {
    return { tier: 3, runtime: 'llama_rn' };
  }

  throw new Error(
    'No local runtime is ready. Download a local model first, or join AGI Cloud when it is available.',
  );
}

function resolvePreset(modelId: string | undefined): ExecutorchPreset | null {
  if (!modelId) {
    const def = getDefaultModel();
    return def.executorchPreset ?? null;
  }
  const exact = getModelById(modelId);
  if (exact) return exact.executorchPreset ?? null;

  // Look up by id — check default, then lite
  const def = getDefaultModel();
  if (def.id === modelId) return def.executorchPreset ?? null;
  const lite = getLiteModeModel();
  if (lite?.id === modelId) return lite.executorchPreset ?? null;
  return null;
}

function looksLikeModelPath(ref: string | undefined): boolean {
  if (!ref) return false;
  return (
    ref.startsWith('file:') ||
    ref.startsWith('/') ||
    ref.includes('/') ||
    ref.endsWith('.gguf') ||
    ref.endsWith('.pte') ||
    ref.endsWith('.bin')
  );
}

function normalizeModelRef(
  modelPathOrId: string | undefined,
  explicitModelId?: string,
): { modelId?: string; modelPath?: string } {
  const modelPath = looksLikeModelPath(modelPathOrId) ? modelPathOrId : undefined;
  const modelId = explicitModelId ?? (modelPath ? undefined : modelPathOrId);
  return { modelId, modelPath };
}

function canUseTier1ForModel(
  modelId: string | undefined,
  runtime: Exclude<DeviceCapabilities['tier1Runtime'], null>,
): boolean {
  if (!modelId) return true;

  const model = getModelById(modelId);
  if (!model) return false;

  if (runtime === 'foundation_models') {
    return model.supportedRuntimes.includes('apple-foundation-models');
  }
  return model.supportedRuntimes.includes('aicore');
}

// Top-level generate: selects tier then dispatches to the right adapter.
export async function localGenerate(
  modelPathOrId: string | undefined,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  const caps = await getCapabilities();
  const ref = normalizeModelRef(modelPathOrId, opts.modelId);

  if (caps.thermalThrottled) {
    throw new Error('Device is thermally throttled — inference paused.');
  }

  if (
    caps.tier1Available &&
    caps.tier1Runtime &&
    canUseTier1ForModel(ref.modelId, caps.tier1Runtime)
  ) {
    return tier1Generate(opts);
  }

  let tier2Error: unknown = null;
  const preset = resolvePreset(ref.modelId);

  if (caps.tier2Available && preset) {
    try {
      return await tier2Generate(preset, opts);
    } catch (err) {
      tier2Error = err;
      console.warn('[local-llm] Tier 2 failed, falling back to Tier 3 when possible:', err);
    }
  }

  if (ref.modelPath) {
    return tier3Generate(ref.modelPath, opts);
  }

  if (tier2Error instanceof Error) {
    throw tier2Error;
  }

  if (ref.modelId && !preset) {
    throw new Error(`No runnable local package is configured for model ${ref.modelId}.`);
  }

  throw new Error(
    'No local model is ready. Download a local model first, or join AGI Cloud when it is available.',
  );
}

export type {
  DeviceCapabilities,
  GenerateOptions,
  GenerateResult,
  LocalRuntimeName,
  LocalRuntimeTier,
};
