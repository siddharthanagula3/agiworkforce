import { NativeModules, Platform } from 'react-native';
import type { DeviceCapabilities } from './types.js';

const TIER2_MIN_RAM_MB = 3500;

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
      } catch {
        // module unavailable
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
      } catch {
        // module unavailable
      }
    }
  }

  const tier2Available = totalRAMMB >= TIER2_MIN_RAM_MB;
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
  if (Platform.OS === 'ios') {
    return !!NativeModules.AGIFoundationModels?.isThermallyThrottled?.();
  }
  if (Platform.OS === 'android') {
    return !!NativeModules.AGIAICore?.isThermallyThrottled?.();
  }
  return false;
}
