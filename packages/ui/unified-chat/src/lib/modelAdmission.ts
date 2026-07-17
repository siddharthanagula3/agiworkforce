import type { ChatExecutionMode } from '@agiworkforce/types';
import type { ModelInfo } from './types';

const LOCAL_PROVIDER_IDS = new Set(['ollama', 'local', 'lmstudio', 'llamacpp', 'vllm']);

export function isLocalChatModel(model: ModelInfo): boolean {
  return model.isLocal || LOCAL_PROVIDER_IDS.has(model.provider.toLowerCase());
}

/**
 * Product trust admission for a model already discovered by the active host.
 * Registry routing still performs provider/harness/capability admission; this
 * guard prevents a stale UI selection from crossing conversation trust planes.
 */
export function isModelAdmittedForExecutionMode(
  model: ModelInfo,
  executionMode: ChatExecutionMode,
): boolean {
  const local = isLocalChatModel(model);
  switch (executionMode) {
    case 'local_only':
      return local;
    case 'byok':
      return model.isByok && !local;
    case 'cloud_managed':
      return !local && !model.isByok;
  }
}

export function getModelsAdmittedForExecutionMode(
  models: readonly ModelInfo[],
  executionMode: ChatExecutionMode,
): ModelInfo[] {
  return models.filter((model) => isModelAdmittedForExecutionMode(model, executionMode));
}
