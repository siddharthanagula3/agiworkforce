import {
  getModelById,
  loadedLocalModel,
  tier2IsPresetDownloaded,
  tier2Release,
} from '@agiworkforce/local-llm';
import type { ExecutorchPreset } from '@agiworkforce/types';
import { removeInstalledModel } from '@/storage/installedModels';
import type { InstalledModel } from '@/storage/types';

export const EXECUTORCH_MANAGER = 'react-native-executorch';

export interface ExecutorchResources {
  deleteResources: (...sources: string[]) => Promise<void>;
  cancelFetching: (...sources: string[]) => Promise<void>;
}

let resourcesOverride: ExecutorchResources | null = null;

export function _setExecutorchResourcesForTesting(resources: ExecutorchResources | null): void {
  resourcesOverride = resources;
}

function resources(): ExecutorchResources {
  if (resourcesOverride) return resourcesOverride;
  // Loaded on demand: the fetcher throws at import when the Expo file API is missing.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ExpoResourceFetcher } = require('react-native-executorch-expo-resource-fetcher') as {
    ExpoResourceFetcher: ExecutorchResources;
  };
  return {
    deleteResources: (...sources) => ExpoResourceFetcher.deleteResources(...sources),
    cancelFetching: (...sources) => ExpoResourceFetcher.cancelFetching(...sources),
  };
}

export function executorchPresetSources(preset: ExecutorchPreset): string[] {
  return [preset.modelSource, preset.tokenizerSource, preset.tokenizerConfigSource];
}

export function executorchPresetForModel(modelId: string): ExecutorchPreset | null {
  return getModelById(modelId)?.executorchPreset ?? null;
}

export function isExecutorchRecord(model: InstalledModel): boolean {
  if (model.runtime !== 'local' || model.format !== 'pte' || model.capabilities === null) {
    return false;
  }
  try {
    const capabilities: unknown = JSON.parse(model.capabilities);
    return (
      !!capabilities &&
      typeof capabilities === 'object' &&
      !Array.isArray(capabilities) &&
      (capabilities as Record<string, unknown>).managedBy === EXECUTORCH_MANAGER
    );
  } catch {
    return false;
  }
}

export function releaseExecutorchPreset(preset: ExecutorchPreset): void {
  const loaded = loadedLocalModel();
  if (loaded?.runtime === 'executorch' && loaded.preset === preset.modelName) tier2Release();
}

export async function deleteExecutorchPresetFiles(preset: ExecutorchPreset): Promise<void> {
  await resources().deleteResources(...executorchPresetSources(preset));
}

export async function cancelExecutorchPresetDownload(preset: ExecutorchPreset): Promise<void> {
  const { cancelFetching } = resources();
  await Promise.all(
    executorchPresetSources(preset).map((source) => cancelFetching(source).catch(() => undefined)),
  );
}

/**
 * Drops installed records whose files are gone, so a cleared directory offers
 * Download again instead of a model that cannot answer.
 */
export async function liveInstalledModels(installed: InstalledModel[]): Promise<InstalledModel[]> {
  const live: InstalledModel[] = [];
  for (const model of installed) {
    const preset = model.format === 'pte' ? executorchPresetForModel(model.id) : null;
    if (!preset) {
      live.push(model);
      continue;
    }
    const present = await tier2IsPresetDownloaded(preset);
    if (present) {
      live.push(model);
      continue;
    }
    await removeInstalledModel(model.id).catch((error: unknown) => {
      console.warn('[executorchModels] Could not drop stale model record:', error);
    });
  }
  return live;
}
