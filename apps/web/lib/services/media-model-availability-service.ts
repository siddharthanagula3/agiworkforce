import 'server-only';

import type {
  ManagedMediaModelAdmission,
  ManagedMediaModelAdmissionState,
  ManagedMediaModelAvailabilityResponse,
} from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  getModels,
  isExecutableImageModel,
  isExecutableVideoModel,
  modelsCatalog,
  type ModelMetadata,
} from '@agiworkforce/types';
import { getOptionalEnv } from '@shared/utils/env';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { isMediaAssetStoreReady } from '@/lib/server/media-assets';
import { isImageStorageConfigured, isVideoStorageConfigured } from '@/lib/server/media-storage';
import { isVideoJobStoreReady } from '@/lib/server/video-job-store-readiness';
import { isVideoProviderReleaseEnabled } from '@/lib/server/video-provider-release-policy';

type MediaKind = ManagedMediaModelAdmission['kind'];

const GOOGLE_MEDIA_KEY_ENV_NAMES = [
  'GOOGLE_API_KEY',
  'GOOGLE_AI_API_KEY',
  'GEMINI_API_KEY',
] as const;

const IMAGE_API_PROVIDER: Readonly<Record<string, string>> = {
  gemini: 'google',
  imagen: 'google',
  openai: 'openai',
};

const VIDEO_ADAPTER_PROVIDERS = new Set(['google', 'runway', 'open_router']);

export interface MediaModelAvailabilityEvidence {
  /** Injectable for deterministic tests; production reads server env only. */
  getEnv?: (name: string) => string | undefined;
  imageStorageConfigured?: boolean;
  videoStorageConfigured?: boolean;
  imageSchemaConfigured?: boolean;
  videoSchemaConfigured?: boolean;
  checkedAt?: string;
}

function defaultGetEnv(name: string): string | undefined {
  return getOptionalEnv(name);
}

function hasCredential(provider: string, getEnv: (name: string) => string | undefined): boolean {
  if (provider === 'google') {
    return GOOGLE_MEDIA_KEY_ENV_NAMES.some((name) => Boolean(getEnv(name)?.trim()));
  }
  const envName =
    provider === 'openai'
      ? 'OPENAI_API_KEY'
      : provider === 'runway'
        ? 'RUNWAY_API_KEY'
        : provider === 'openrouter'
          ? 'OPENROUTER_API_KEY'
          : null;
  return envName ? Boolean(getEnv(envName)?.trim()) : false;
}

function isCatalogSelectable(model: ModelMetadata, kind: MediaKind): boolean {
  if (kind === 'image') return isExecutableImageModel(model);
  return isExecutableVideoModel(model);
}

function adapterProvider(model: ModelMetadata, kind: MediaKind): string | null {
  if (kind === 'image') {
    return model.imageApi ? (IMAGE_API_PROVIDER[model.imageApi] ?? null) : null;
  }
  if (!VIDEO_ADAPTER_PROVIDERS.has(model.provider)) return null;
  return model.provider === 'open_router' ? 'openrouter' : model.provider;
}

function admissionState(input: {
  provider: string | null;
  storageConfigured: boolean;
  schemaConfigured: boolean;
  getEnv: (name: string) => string | undefined;
}): ManagedMediaModelAdmissionState {
  if (!input.provider) return 'adapter_not_supported';
  if (!input.storageConfigured) return 'storage_not_configured';
  if (!input.schemaConfigured) return 'schema_not_configured';
  if (
    (input.provider === 'google' ||
      input.provider === 'runway' ||
      input.provider === 'openrouter') &&
    !isVideoProviderReleaseEnabled(input.provider)
  ) {
    return 'provider_not_configured';
  }
  if (!hasCredential(input.provider, input.getEnv)) return 'provider_not_configured';
  return 'enabled';
}

/**
 * Resolve the deploy-specific picker contract without exposing any key value.
 * Routes still repeat authorization, entitlement, tuple, and provider checks;
 * this is presentation admission, never a replacement for server enforcement.
 */
export function resolveMediaModelAvailability(
  evidence: MediaModelAvailabilityEvidence = {},
): ManagedMediaModelAvailabilityResponse {
  const getEnv = evidence.getEnv ?? defaultGetEnv;
  const imageStorageConfigured = evidence.imageStorageConfigured ?? isImageStorageConfigured();
  const videoStorageConfigured = evidence.videoStorageConfigured ?? isVideoStorageConfigured();
  // Direct callers must prove the required schema. The production route uses
  // resolveDeploymentMediaModelAvailability below; defaulting true here would
  // let a future caller advertise a path whose first DB operation must fail.
  const imageSchemaConfigured = evidence.imageSchemaConfigured ?? false;
  const videoSchemaConfigured = evidence.videoSchemaConfigured ?? false;
  const models: ManagedMediaModelAdmission[] = [];

  for (const kind of ['image', 'video'] as const) {
    const candidates = getModels({
      modelTypes: [kind],
      requireCapabilities: kind === 'image' ? { imageGen: true } : { videoGen: true },
    }).filter((model) => isCatalogSelectable(model, kind));

    for (const model of candidates) {
      const provider = adapterProvider(model, kind);
      const storageConfigured = kind === 'image' ? imageStorageConfigured : videoStorageConfigured;
      const schemaConfigured = kind === 'image' ? imageSchemaConfigured : videoSchemaConfigured;
      models.push({
        model_id: model.id,
        name: model.name,
        kind,
        provider: provider ?? model.provider,
        state: admissionState({ provider, storageConfigured, schemaConfigured, getEnv }),
      });
    }
  }

  return {
    catalog_version: String(modelsCatalog.version),
    image_storage_configured: imageStorageConfigured,
    video_storage_configured: videoStorageConfigured,
    image_schema_configured: imageSchemaConfigured,
    video_schema_configured: videoSchemaConfigured,
    checked_at: evidence.checkedAt ?? new Date().toISOString(),
    models,
  };
}

/**
 * Resolve image schema here and delegate the complete durable-video proof to
 * the same readiness owner enforced by generation. This prevents picker drift
 * whenever 0105 gains another admission, billing, or lifecycle prerequisite.
 */
export async function resolveDeploymentMediaModelAvailability(
  db: DatabaseAdapter = getNeonDb(),
  evidence: Omit<
    MediaModelAvailabilityEvidence,
    'imageSchemaConfigured' | 'videoSchemaConfigured'
  > = {},
): Promise<ManagedMediaModelAvailabilityResponse> {
  let imageSchemaConfigured: boolean;
  try {
    imageSchemaConfigured = await isMediaAssetStoreReady(db);
  } catch (error) {
    logger.warn({ error }, 'Managed media schema readiness could not be verified');
    throw createError.serviceUnavailable('Managed media availability could not be verified.');
  }

  const videoSchemaConfigured = imageSchemaConfigured && (await isVideoJobStoreReady(db));

  return resolveMediaModelAvailability({
    ...evidence,
    imageSchemaConfigured,
    videoSchemaConfigured,
  });
}
