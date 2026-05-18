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
import { getDefaultModel, getLiteModeModel } from './catalog';
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
}): Promise<{ tier: LocalRuntimeTier; runtime: LocalRuntimeName }> {
  const caps = await getCapabilities();

  if (caps.thermalThrottled) {
    throw new Error('Device is thermally throttled — inference paused. Try again in a moment.');
  }

  if (caps.tier1Available && caps.tier1Runtime) {
    return { tier: 1, runtime: caps.tier1Runtime };
  }

  if (caps.tier2Available && opts.modelPath) {
    return { tier: 2, runtime: 'executorch' };
  }

  if (opts.modelPath) {
    return { tier: 3, runtime: 'llama_rn' };
  }

  throw new Error(
    'No local runtime available. Download a model first, or add a cloud provider key.',
  );
}

function resolvePreset(modelId: string | undefined): ExecutorchPreset | null {
  if (!modelId) {
    const def = getDefaultModel();
    return def.executorchPreset ?? null;
  }
  // Look up by id — check default, then lite
  const def = getDefaultModel();
  if (def.id === modelId) return def.executorchPreset ?? null;
  const lite = getLiteModeModel();
  if (lite?.id === modelId) return lite.executorchPreset ?? null;
  return null;
}

// Top-level generate: selects tier then dispatches to the right adapter.
export async function localGenerate(
  modelPath: string | undefined,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  const caps = await getCapabilities();

  if (caps.thermalThrottled) {
    throw new Error('Device is thermally throttled — inference paused.');
  }

  if (caps.tier1Available && caps.tier1Runtime) {
    return tier1Generate(opts);
  }

  if (!modelPath) {
    throw new Error('No model path provided for Tier 2/3 inference.');
  }

  if (caps.tier2Available) {
    const preset = resolvePreset(modelPath);
    if (preset) {
      try {
        return await tier2Generate(preset, opts);
      } catch (err) {
        console.warn('[local-llm] Tier 2 failed, falling back to Tier 3:', err);
      }
    } else {
      console.warn('[local-llm] No executorchPreset for model, skipping Tier 2:', modelPath);
    }
  }

  return tier3Generate(modelPath, opts);
}

export type {
  DeviceCapabilities,
  GenerateOptions,
  GenerateResult,
  LocalRuntimeName,
  LocalRuntimeTier,
};
