import 'server-only';

import {
  ManagedMediaVideoAspectRatioSchema,
  ManagedMediaVideoDurationSecsSchema,
  ManagedMediaVideoResolutionSchema,
  supportsManagedMediaImageEdit,
  type ManagedMediaModelAdmission,
  type ManagedMediaModelAdmissionState,
  type ManagedMediaModelAvailabilityResponse,
  type ManagedMediaVideoOutputSize,
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
import {
  IMAGE_ASPECT_RATIOS_BY_API,
  maxImagesPerRequest,
} from '@/app/api/media/image/lib/image-generation-provider';
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

type AdmissionShape = Pick<
  ManagedMediaModelAdmission,
  'supports_edit' | 'aspect_ratios' | 'max_images' | 'output_sizes' | 'supports_audio'
>;

function imageShape(model: ModelMetadata): AdmissionShape {
  return {
    supports_edit: supportsManagedMediaImageEdit(model.imageApi),
    ...(model.imageApi
      ? {
          aspect_ratios: [...IMAGE_ASPECT_RATIOS_BY_API[model.imageApi]],
          max_images: maxImagesPerRequest(model.imageApi),
        }
      : {}),
  };
}

function requestableVideoOutputSizes(model: ModelMetadata): ManagedMediaVideoOutputSize[] {
  const video = model.videoGeneration;
  if (!video) return [];
  const pricesByResolution = video.pricing ? undefined : model.videoPerSecondCostByResolution;
  const sizes: ManagedMediaVideoOutputSize[] = [];
  for (const size of video.outputSizes) {
    const resolution = ManagedMediaVideoResolutionSchema.safeParse(size.resolution);
    const aspectRatio = ManagedMediaVideoAspectRatioSchema.safeParse(size.aspectRatio);
    if (!resolution.success || !aspectRatio.success) continue;
    if (pricesByResolution && pricesByResolution[resolution.data] === undefined) continue;
    const durations = video.durationSecs.filter(
      (seconds) =>
        (!size.durationSecs || size.durationSecs.includes(seconds)) &&
        ManagedMediaVideoDurationSecsSchema.safeParse(seconds).success,
    );
    if (durations.length === 0) continue;
    sizes.push({
      resolution: resolution.data,
      aspect_ratio: aspectRatio.data,
      width: size.width,
      height: size.height,
      duration_secs: durations,
    });
  }
  return sizes;
}

function videoShape(model: ModelMetadata): AdmissionShape {
  if (!model.videoGeneration) return {};
  const outputSizes = requestableVideoOutputSizes(model);
  return {
    aspect_ratios: [...new Set(outputSizes.map((size) => size.aspect_ratio))],
    output_sizes: outputSizes,
    supports_audio: model.videoGeneration.supportsAudio,
  };
}

export function resolveMediaModelAvailability(
  evidence: MediaModelAvailabilityEvidence = {},
): ManagedMediaModelAvailabilityResponse {
  const getEnv = evidence.getEnv ?? defaultGetEnv;
  const imageStorageConfigured = evidence.imageStorageConfigured ?? isImageStorageConfigured();
  const videoStorageConfigured = evidence.videoStorageConfigured ?? isVideoStorageConfigured();
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
        ...(kind === 'image' ? imageShape(model) : videoShape(model)),
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
