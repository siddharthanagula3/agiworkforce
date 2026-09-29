import { NativeModules, Platform } from 'react-native';

const SAMPLE_INTERVAL_MS = 1_000;

interface MemoryFootprintModule {
  memoryFootprintMB?: () => Promise<number | null>;
}

function memoryModule(): MemoryFootprintModule | undefined {
  if (Platform.OS === 'ios') return NativeModules.AGIFoundationModels;
  if (Platform.OS === 'android') return NativeModules.AGIAICore;
  return undefined;
}

export async function readMemoryFootprintMB(): Promise<number | null> {
  const read = memoryModule()?.memoryFootprintMB;
  if (!read) return null;
  try {
    const mb = await read();
    return typeof mb === 'number' && Number.isFinite(mb) && mb > 0 ? mb : null;
  } catch {
    return null;
  }
}

export interface PeakMemorySampler {
  stop: () => Promise<number>;
}

export function startPeakMemorySampler(intervalMs = SAMPLE_INTERVAL_MS): PeakMemorySampler {
  let peak = 0;
  const sample = async () => {
    const mb = await readMemoryFootprintMB();
    if (mb !== null && mb > peak) peak = mb;
  };
  void sample();
  const timer = setInterval(() => void sample(), intervalMs);
  return {
    stop: async () => {
      clearInterval(timer);
      await sample();
      return peak;
    },
  };
}
