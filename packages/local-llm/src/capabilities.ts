import { NativeModules, Platform } from 'react-native';
import type { DeviceCapabilities } from './types';

const TIER2_MIN_RAM_MB = 3500;
let lastThermalThrottled = false;

function hasExecutorchRuntime(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-executorch') as {
      LLMModule?: unknown;
    };
    return Boolean(mod.LLMModule);
  } catch {
    return false;
  }
}

export async function detectCapabilities(): Promise<DeviceCapabilities> {
  let tier1Available = false;
  let tier1Runtime: DeviceCapabilities['tier1Runtime'] = null;
  let totalRAMMB = 0;
  let osVersion = '';
  let thermalThrottled = false;

  if (Platform.OS === 'ios') {
    const mod = NativeModules.AGIFoundationModels;
    if (mod) {
      try {
        const caps = await mod.getCapabilities();
        tier1Available = !!caps.available;
        tier1Runtime = tier1Available ? 'foundation_models' : null;
        totalRAMMB = caps.totalRAMMB ?? 0;
        osVersion = caps.osVersion ?? '';
        thermalThrottled = !!caps.thermalThrottled;
      } catch (error) {
        console.warn('[local-llm] iOS capability detection failed:', error);
      }
    }
  } else if (Platform.OS === 'android') {
    const mod = NativeModules.AGIAICore;
    if (mod) {
      try {
        const caps = await mod.getCapabilities();
        tier1Available = !!caps.available;
        tier1Runtime = tier1Available ? 'aicore' : null;
        totalRAMMB = caps.totalRAMMB ?? 0;
        osVersion = caps.osVersion ?? '';
        thermalThrottled = !!caps.thermalThrottled;
      } catch (error) {
        console.warn('[local-llm] Android capability detection failed:', error);
      }
    }
  }

  lastThermalThrottled = thermalThrottled;

  const tier2Available =
    totalRAMMB >= TIER2_MIN_RAM_MB || (totalRAMMB === 0 && hasExecutorchRuntime());
  const tier3Available = true as const;

  return {
    totalRAMMB,
    osVersion,
    thermalThrottled,
    tier1Available,
    tier1Runtime,
    tier2Available,
    tier3Available,
  };
}

export function isThermallyThrottled(): boolean {
  return lastThermalThrottled;
}
