import { getModelMetadata } from '../constants/llm';
import type { ModelMetadata } from '../constants/llm';
import type { CustomModelConfig } from '../types/customModel';
import type { Provider } from '../types/provider';

export type CapabilityResolutionSource =
  | 'model-metadata'
  | 'custom-model'
  | 'ollama-runtime'
  | 'auto-unresolved'
  | 'unknown';

export interface ResolvedCapabilities {
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsThinking: boolean;
  contextLength: number;
  toolMode: 'native' | 'prompt_injection' | 'none';
  computerUse: boolean;
  search: boolean;
  codeExecution: boolean;
  imageGen: boolean;
  agentic: boolean;
  source: CapabilityResolutionSource;
}

export interface ModelCapabilitiesDto {
  tools: boolean;
  vision: boolean;
  computerUse: boolean;
  search: boolean;
  codeExecution: boolean;
  imageGen: boolean;
  agentic: boolean;
}

export function isAutoModel(modelId: string | null | undefined): boolean {
  return modelId === 'auto' || Boolean(modelId?.startsWith('auto-'));
}

export function normalizeAutoMode(
  modelId: string | null | undefined,
): 'auto-economy' | 'auto-balanced' | 'auto-premium' | undefined {
  if (!modelId) return undefined;
  if (modelId === 'auto') return 'auto-balanced';
  if (modelId === 'auto-economy' || modelId === 'auto-balanced' || modelId === 'auto-premium') {
    return modelId;
  }
  return undefined;
}

function fromModelMetadata(metadata: ModelMetadata): ResolvedCapabilities {
  return {
    supportsVision: metadata.capabilities.vision,
    supportsTools: metadata.capabilities.tools,
    supportsStreaming: metadata.capabilities.streaming,
    supportsThinking: metadata.capabilities.thinking,
    contextLength: metadata.contextWindow,
    toolMode: metadata.capabilities.tools ? 'native' : 'none',
    computerUse: metadata.capabilities.computerUse,
    search: metadata.capabilities.search,
    codeExecution: metadata.capabilities.codeExecution,
    imageGen: metadata.capabilities.imageGen,
    agentic: metadata.capabilities.agentic,
    source: 'model-metadata',
  };
}

function fromCustomModel(config: CustomModelConfig): ResolvedCapabilities {
  return {
    supportsVision: config.supportsVision,
    supportsTools: config.supportsTools,
    supportsStreaming: config.supportsStreaming,
    supportsThinking: false,
    contextLength: config.contextWindow,
    toolMode: config.supportsTools ? 'native' : 'none',
    computerUse: false,
    search: false,
    codeExecution: false,
    imageGen: false,
    agentic: config.supportsTools,
    source: 'custom-model',
  };
}

export function resolveKnownModelCapabilities(
  modelId: string | null | undefined,
  provider: Provider | null | undefined,
  customModels: CustomModelConfig[] = [],
): ResolvedCapabilities | null {
  if (!modelId || !provider) {
    return null;
  }

  if (isAutoModel(modelId)) {
    return null;
  }

  const metadata = getModelMetadata(modelId);
  if (metadata) {
    return fromModelMetadata(metadata);
  }

  const customModel = customModels.find((candidate) => {
    return candidate.id === modelId || candidate.modelId === modelId;
  });
  if (customModel) {
    return fromCustomModel(customModel);
  }

  if (provider === 'ollama') {
    return null;
  }

  return null;
}

export function toModelCapabilitiesDto(
  capabilities: ResolvedCapabilities | null | undefined,
): ModelCapabilitiesDto | undefined {
  if (!capabilities) {
    return undefined;
  }

  return {
    tools: capabilities.supportsTools,
    vision: capabilities.supportsVision,
    computerUse: capabilities.computerUse,
    search: capabilities.search,
    codeExecution: capabilities.codeExecution,
    imageGen: capabilities.imageGen,
    agentic: capabilities.agentic,
  };
}
