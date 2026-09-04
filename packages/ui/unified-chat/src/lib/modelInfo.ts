import {
  getModelMetadataById,
  type ModelAvailability,
  type ModelQualityTier,
} from '@agiworkforce/types';
import type { ModelInfo } from './types';

export interface DiscoveredChatModel {
  id: string;
  name: string;
  provider: string;
  isLocal: boolean;
  isByok: boolean;
  runtimeCapabilities?: RuntimeModelCapabilities;
}

export interface RuntimeModelCapabilities {
  tools: boolean;
  vision: boolean;
  thinking: boolean;
  contextWindow: number;
}

export interface DiscoveredChatModelRecord {
  id: string;
  name: string;
  provider: string;
  available?: boolean;
  runtimeCapabilities?: RuntimeModelCapabilities;
}

function parseRuntimeModelCapabilities(input: unknown): RuntimeModelCapabilities | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const value = input as Record<string, unknown>;
  if (
    typeof value['tools'] !== 'boolean' ||
    typeof value['vision'] !== 'boolean' ||
    typeof value['thinking'] !== 'boolean' ||
    typeof value['contextWindow'] !== 'number' ||
    !Number.isFinite(value['contextWindow']) ||
    value['contextWindow'] < 0
  ) {
    return undefined;
  }
  return {
    tools: value['tools'],
    vision: value['vision'],
    thinking: value['thinking'],
    contextWindow: Math.floor(value['contextWindow']),
  };
}

export function getModelPresentationLabel(modelId: string | null | undefined): string {
  const normalizedModelId = modelId?.trim() ?? '';
  if (!normalizedModelId) return '';

  return getModelMetadataById(normalizedModelId)?.name ?? normalizedModelId;
}

const UNAVAILABLE_MODEL_LABEL = 'Unavailable model';
const FREE_POOL_SUFFIX = ' · via free pool';

/**
 * How the turn was paid for, in the only terms a surface-neutral renderer may
 * hold: a shared zero-cost pool answered instead of the caller's own allowance.
 * Named for the disclosure, not for any one surface's lane vocabulary, the
 * host maps its own routing answer onto this before calling.
 */
export interface ManagedModelPresentation {
  freePool?: boolean;
}

export function getManagedModelPresentationLabel(
  modelId: string | null | undefined,
  presentation?: ManagedModelPresentation,
): string {
  const normalizedModelId = modelId?.trim() ?? '';
  const name = normalizedModelId
    ? (getModelMetadataById(normalizedModelId)?.name ?? UNAVAILABLE_MODEL_LABEL)
    : UNAVAILABLE_MODEL_LABEL;

  return presentation?.freePool === true ? `${name}${FREE_POOL_SUFFIX}` : name;
}

export function parseDiscoveredChatModels(input: unknown): DiscoveredChatModelRecord[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((candidate): DiscoveredChatModelRecord[] => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const record = candidate as Record<string, unknown>;
    const id = typeof record['id'] === 'string' ? record['id'].trim() : '';
    const name = typeof record['name'] === 'string' ? record['name'].trim() : '';
    const provider = typeof record['provider'] === 'string' ? record['provider'].trim() : '';
    const available = record['available'];
    const runtimeCapabilities = parseRuntimeModelCapabilities(record['runtimeCapabilities']);

    if (!id || !name || !provider) return [];
    if (available !== undefined && typeof available !== 'boolean') return [];
    if (record['runtimeCapabilities'] !== undefined && !runtimeCapabilities) return [];

    return [
      {
        id,
        name,
        provider,
        ...(available === undefined ? {} : { available }),
        ...(runtimeCapabilities ? { runtimeCapabilities } : {}),
      },
    ];
  });
}

function toPresentationTier(qualityTier: ModelQualityTier | undefined): ModelInfo['tier'] {
  switch (qualityTier) {
    case 'best':
      return 'flagship';
    case 'fast':
      return 'fast';
    default:
      return 'standard';
  }
}

export function createChatModelInfo(model: DiscoveredChatModel): ModelInfo {
  const metadata = getModelMetadataById(model.id);
  const runtime = model.runtimeCapabilities;
  const availability: ModelAvailability = metadata?.availability ?? 'live';

  return {
    id: metadata?.id ?? model.id,
    name: metadata?.name ?? model.name,
    provider: metadata?.provider ?? model.provider,
    tier: toPresentationTier(metadata?.qualityTier),
    supportsThinking: metadata?.capabilities.thinking ?? runtime?.thinking ?? false,
    supportsVision: metadata?.capabilities.vision ?? runtime?.vision ?? false,
    supportsTools: metadata?.capabilities.tools ?? runtime?.tools ?? false,
    contextWindow: metadata?.contextWindow ?? runtime?.contextWindow ?? 0,
    isLocal: model.isLocal,
    isByok: model.isByok,
    metadataSource: metadata ? 'registry' : runtime ? 'runtime' : 'unknown',
    availability,
    ...(metadata?.unavailableReason ? { unavailableReason: metadata.unavailableReason } : {}),
  };
}

export function isChatModelSelectable(model: ModelInfo): boolean {
  return (model.availability ?? 'live') === 'live';
}
