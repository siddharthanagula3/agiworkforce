import { Platform } from 'react-native';
import { hasRunnableGgufArtifacts } from '@agiworkforce/local-llm';
import type { OnDeviceModel } from '@agiworkforce/types';

export const SYSTEM_RUNTIME_ONLY = new Set(['apple-foundation-models', 'aicore']);

// A system runtime exists on exactly one OS. Listing the other platform's entry
// reads as leftover cross-platform debris: it can never leave "not available on
// this device yet".
const SYSTEM_RUNTIME_PLATFORM: Record<string, typeof Platform.OS> = {
  'apple-foundation-models': 'ios',
  aicore: 'android',
};

export function isSystemRuntimeOnlyModel(model: OnDeviceModel): boolean {
  return model.supportedRuntimes.every((r) => SYSTEM_RUNTIME_ONLY.has(r));
}

export function isSelectableLocalCatalogModel(model: OnDeviceModel): boolean {
  if (isSystemRuntimeOnlyModel(model)) {
    if (model.fileSizeBytes > 0) return false;
    return model.supportedRuntimes.some(
      (runtime) => SYSTEM_RUNTIME_PLATFORM[runtime] === Platform.OS,
    );
  }
  if (model.fileSizeBytes <= 0) return true;
  if (model.executorchPreset) return true;
  return hasRunnableGgufArtifacts(model);
}
