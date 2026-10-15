import { invoke, isTauri } from '../lib/tauri-mock';

export interface AGIResourceLimits {
  cpuPercent?: number;
  memoryMb?: number;
  networkMbps?: number;
  storageMb?: number;
}

export interface AGICoreConfig {
  maxConcurrentTools?: number;
  knowledgeMemoryMb?: number;
  enableLearning?: boolean;
  enableSelfImprovement?: boolean;
  resourceLimits?: AGIResourceLimits;
  maxPlanningDepth?: number;
  enableMultimodal?: boolean;
}

let _agiInitialized = false;

export async function ensureAgiInitialized(config?: AGICoreConfig): Promise<void> {
  if (_agiInitialized) return;
  if (!isTauri) {
    _agiInitialized = true;
    return;
  }
  try {
    await invoke<void>('agi_init', { config: config ?? {} });
    _agiInitialized = true;
  } catch (err) {
    console.warn('[agi] ensureAgiInitialized failed:', err);
    throw err;
  }
}
