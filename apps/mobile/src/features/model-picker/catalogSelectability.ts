import { hasRunnableGgufArtifacts } from '@agiworkforce/local-llm';
import type { OnDeviceModel } from '@agiworkforce/types';

export const SYSTEM_RUNTIME_ONLY = new Set(['apple-foundation-models', 'aicore']);

export function isSystemRuntimeOnlyModel(model: OnDeviceModel): boolean {
  return model.supportedRuntimes.every((r) => SYSTEM_RUNTIME_ONLY.has(r));
}

export function isSelectableLocalCatalogModel(model: OnDeviceModel): boolean {
  if (isSystemRuntimeOnlyModel(model)) return model.fileSizeBytes <= 0;
  if (model.fileSizeBytes <= 0) return true;
  if (model.executorchPreset) return true;
  return hasRunnableGgufArtifacts(model);
}
