import type {
  DeviceCapabilities,
  GenerateOptions,
  GenerateResult,
  LocalRuntimeName,
  LocalRuntimeTier,
} from './types.js';
import { detectCapabilities } from './capabilities.js';
import { tier1Generate } from './tier1.js';
import { tier2Generate } from './tier2.js';
import { tier3Generate } from './tier3.js';

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
    try {
      return await tier2Generate(modelPath, opts);
    } catch (err) {
      console.warn('[local-llm] Tier 2 failed, falling back to Tier 3:', err);
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
