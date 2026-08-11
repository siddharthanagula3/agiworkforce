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
}

export interface DiscoveredChatModelRecord {
  id: string;
  name: string;
  provider: string;
  available?: boolean;
}

/**
 * Resolve the user-facing label for model provenance without leaking a
 * catalog transport identifier. Unknown Local/BYOK identifiers remain
 * visible verbatim because the host runtime is their only authority.
 */
export function getModelPresentationLabel(modelId: string | null | undefined): string {
  const normalizedModelId = modelId?.trim() ?? '';
  if (!normalizedModelId) return '';

  return getModelMetadataById(normalizedModelId)?.name ?? normalizedModelId;
}

/**
 * Resolve model provenance for Managed Cloud receipts. Managed execution may
 * only use catalog models, so an unknown historical id is unavailable rather
 * than a dynamic Local/BYOK model that should be exposed verbatim.
 */
export function getManagedModelPresentationLabel(modelId: string | null | undefined): string {
  const normalizedModelId = modelId?.trim() ?? '';
  if (!normalizedModelId) return 'Unavailable model';

  return getModelMetadataById(normalizedModelId)?.name ?? 'Unavailable model';
}

/** Validate an IPC/API model-discovery payload before it reaches routing UI. */
export function parseDiscoveredChatModels(input: unknown): DiscoveredChatModelRecord[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((candidate): DiscoveredChatModelRecord[] => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const record = candidate as Record<string, unknown>;
    const id = typeof record['id'] === 'string' ? record['id'].trim() : '';
    const name = typeof record['name'] === 'string' ? record['name'].trim() : '';
    const provider = typeof record['provider'] === 'string' ? record['provider'].trim() : '';
    const available = record['available'];

    if (!id || !name || !provider) return [];
    if (available !== undefined && typeof available !== 'boolean') return [];

    return [{ id, name, provider, ...(available === undefined ? {} : { available }) }];
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

/**
 * Convert a host-discovered model into the shared chat selector DTO.
 *
 * Canonical model knowledge always comes from `@agiworkforce/types` (generated
 * from the model registry). Host discovery owns only reachability and trust
 * placement. An unknown dynamic Local/BYOK model fails capability display
 * closed until its runtime can report verified metadata.
 */
export function createChatModelInfo(model: DiscoveredChatModel): ModelInfo {
  const metadata = getModelMetadataById(model.id);
  const availability: ModelAvailability = metadata?.availability ?? 'live';

  return {
    id: metadata?.id ?? model.id,
    name: metadata?.name ?? model.name,
    provider: metadata?.provider ?? model.provider,
    tier: toPresentationTier(metadata?.qualityTier),
    supportsThinking: metadata?.capabilities.thinking ?? false,
    supportsVision: metadata?.capabilities.vision ?? false,
    supportsTools: metadata?.capabilities.tools ?? false,
    contextWindow: metadata?.contextWindow ?? 0,
    isLocal: model.isLocal,
    isByok: model.isByok,
    metadataSource: metadata ? 'registry' : 'unknown',
    availability,
    ...(metadata?.unavailableReason ? { unavailableReason: metadata.unavailableReason } : {}),
  };
}

export function isChatModelSelectable(model: ModelInfo): boolean {
  return (model.availability ?? 'live') === 'live';
}
