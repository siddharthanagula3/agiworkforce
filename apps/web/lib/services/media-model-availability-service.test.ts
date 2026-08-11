import { describe, expect, it, vi } from 'vitest';
import { ManagedMediaModelAvailabilityResponseSchema } from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getModelMetadataById, isModelLive } from '@agiworkforce/types';
import {
  resolveDeploymentMediaModelAvailability,
  resolveMediaModelAvailability,
} from './media-model-availability-service';

const CHECKED_AT = '2026-08-09T12:00:00.000Z';

const READY_MEDIA_SCHEMA = {
  ready: true,
} as const;

function envWith(values: Record<string, string>) {
  return (name: string) => values[name];
}

describe('resolveMediaModelAvailability', () => {
  it('enables only live models whose exact provider credential and storage exist', () => {
    const result = resolveMediaModelAvailability({
      checkedAt: CHECKED_AT,
      imageStorageConfigured: true,
      videoStorageConfigured: true,
      imageSchemaConfigured: true,
      videoSchemaConfigured: true,
      getEnv: envWith({ GEMINI_API_KEY: 'google-test-key' }),
    });

    expect(ManagedMediaModelAvailabilityResponseSchema.parse(result)).toEqual(result);
    const google = result.models.filter((model) => model.provider === 'google');
    expect(google.length).toBeGreaterThan(0);
    expect(google.every((model) => model.state === 'enabled')).toBe(true);
    expect(
      result.models
        .filter((model) => model.provider === 'openai')
        .every((model) => model.state === 'provider_not_configured'),
    ).toBe(true);
    expect(
      result.models
        .filter((model) => model.provider === 'runway')
        .every((model) => model.state === 'provider_not_configured'),
    ).toBe(true);
  });

  it('requires the OpenRouter server credential before advertising its catalog video model', () => {
    const withoutKey = resolveMediaModelAvailability({
      checkedAt: CHECKED_AT,
      imageStorageConfigured: true,
      videoStorageConfigured: true,
      imageSchemaConfigured: true,
      videoSchemaConfigured: true,
      getEnv: envWith({ GOOGLE_API_KEY: 'google-test-key' }),
    });
    const withKey = resolveMediaModelAvailability({
      checkedAt: CHECKED_AT,
      imageStorageConfigured: true,
      videoStorageConfigured: true,
      imageSchemaConfigured: true,
      videoSchemaConfigured: true,
      getEnv: envWith({
        GOOGLE_API_KEY: 'google-test-key',
        OPENROUTER_API_KEY: 'openrouter-test-key',
      }),
    });

    const unavailable = withoutKey.models.filter(
      (model) => model.kind === 'video' && model.provider === 'openrouter',
    );
    const available = withKey.models.filter(
      (model) => model.kind === 'video' && model.provider === 'openrouter',
    );
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0]?.state).toBe('provider_not_configured');
    expect(available).toHaveLength(1);
    expect(available[0]?.state).toBe('enabled');
  });

  it('disables every provider when durable media storage is unavailable', () => {
    const result = resolveMediaModelAvailability({
      checkedAt: CHECKED_AT,
      imageStorageConfigured: false,
      videoStorageConfigured: false,
      imageSchemaConfigured: true,
      videoSchemaConfigured: true,
      getEnv: envWith({
        GOOGLE_API_KEY: 'google-test-key',
        OPENAI_API_KEY: 'openai-test-key',
        RUNWAY_API_KEY: 'runway-test-key',
      }),
    });

    expect(result.models.length).toBeGreaterThan(0);
    expect(result.models.every((model) => model.state === 'storage_not_configured')).toBe(true);
  });

  it('never turns a deprecated, preview, or otherwise non-live catalog entry into picker admission', () => {
    const result = resolveMediaModelAvailability({
      checkedAt: CHECKED_AT,
      imageStorageConfigured: true,
      videoStorageConfigured: true,
      imageSchemaConfigured: true,
      videoSchemaConfigured: true,
      getEnv: () => 'configured-test-key',
    });

    for (const admission of result.models) {
      const metadata = getModelMetadataById(admission.model_id);
      expect(metadata).toBeTruthy();
      expect(metadata && isModelLive(metadata)).toBe(true);
      expect(metadata?.deprecated).not.toBe(true);
      expect(metadata?.status).not.toBe('deprecated');
    }
  });

  it.each([
    {
      label: 'public image storage only',
      imageStorageConfigured: true,
      videoStorageConfigured: false,
      enabledKind: 'image',
      disabledKind: 'video',
    },
    {
      label: 'private video storage only',
      imageStorageConfigured: false,
      videoStorageConfigured: true,
      enabledKind: 'video',
      disabledKind: 'image',
    },
  ] as const)(
    'does not let $label satisfy the other media kind',
    ({ imageStorageConfigured, videoStorageConfigured, enabledKind, disabledKind }) => {
      const result = resolveMediaModelAvailability({
        checkedAt: CHECKED_AT,
        imageStorageConfigured,
        videoStorageConfigured,
        imageSchemaConfigured: true,
        videoSchemaConfigured: true,
        getEnv: envWith({
          GOOGLE_API_KEY: 'google-test-key',
          OPENAI_API_KEY: 'openai-test-key',
          OPENROUTER_API_KEY: 'openrouter-test-key',
          RUNWAY_API_KEY: 'runway-test-key',
        }),
      });

      const enabled = result.models.filter((model) => model.kind === enabledKind);
      expect(enabled.length).toBeGreaterThan(0);
      expect(enabled.every((model) => model.state === 'enabled')).toBe(true);
      expect(
        result.models
          .filter((model) => model.kind === disabledKind)
          .every((model) => model.state === 'storage_not_configured'),
      ).toBe(true);
    },
  );

  it('keeps images available while a missing durable-video schema disables every video model', () => {
    const result = resolveMediaModelAvailability({
      checkedAt: CHECKED_AT,
      imageStorageConfigured: true,
      videoStorageConfigured: true,
      imageSchemaConfigured: true,
      videoSchemaConfigured: false,
      getEnv: envWith({ GOOGLE_API_KEY: 'google-test-key' }),
    });

    expect(
      result.models
        .filter((model) => model.kind === 'image' && model.provider === 'google')
        .every((model) => model.state === 'enabled'),
    ).toBe(true);
    const videos = result.models.filter((model) => model.kind === 'video');
    expect(videos.length).toBeGreaterThan(0);
    expect(videos.every((model) => model.state === 'schema_not_configured')).toBe(true);
  });

  it('proves the media table and every essential 0105 transition before admitting video', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([READY_MEDIA_SCHEMA])
      .mockResolvedValueOnce([{ ready: true }]);
    const result = await resolveDeploymentMediaModelAvailability(
      { query } as unknown as DatabaseAdapter,
      {
        checkedAt: CHECKED_AT,
        imageStorageConfigured: true,
        videoStorageConfigured: true,
        getEnv: envWith({ GOOGLE_API_KEY: 'google-test-key' }),
      },
    );

    expect(result.image_schema_configured).toBe(true);
    expect(result.video_schema_configured).toBe(true);
    expect(
      result.models
        .filter((model) => model.kind === 'video' && model.provider === 'google')
        .every((model) => model.state === 'enabled'),
    ).toBe(true);
  });

  it.each([
    { label: 'media asset table', mediaReady: false, videoReady: true },
    { label: 'complete durable-video schema', mediaReady: true, videoReady: false },
  ] as const)(
    'fails video admission closed when $label evidence is missing',
    async ({ mediaReady, videoReady }) => {
      const query = vi
        .fn()
        .mockResolvedValueOnce([{ ready: mediaReady }])
        .mockResolvedValueOnce([{ ready: videoReady }]);

      const result = await resolveDeploymentMediaModelAvailability(
        { query } as unknown as DatabaseAdapter,
        {
          checkedAt: CHECKED_AT,
          imageStorageConfigured: true,
          videoStorageConfigured: true,
          getEnv: envWith({ GOOGLE_API_KEY: 'google-test-key' }),
        },
      );

      const videos = result.models.filter((model) => model.kind === 'video');
      expect(videos.length).toBeGreaterThan(0);
      expect(result.video_schema_configured).toBe(false);
      expect(videos.every((model) => model.state === 'schema_not_configured')).toBe(true);
    },
  );

  it('fails schema admission closed when the readiness query returns no row', async () => {
    const query = vi.fn().mockResolvedValue([]);

    const result = await resolveDeploymentMediaModelAvailability(
      { query } as unknown as DatabaseAdapter,
      {
        checkedAt: CHECKED_AT,
        imageStorageConfigured: true,
        videoStorageConfigured: true,
        getEnv: envWith({ GOOGLE_API_KEY: 'google-test-key' }),
      },
    );

    expect(result.image_schema_configured).toBe(false);
    expect(result.video_schema_configured).toBe(false);
    expect(result.models.every((model) => model.state === 'schema_not_configured')).toBe(true);
  });

  it('returns a service failure instead of guessing when schema readiness cannot be read', async () => {
    const query = vi.fn().mockRejectedValue(new Error('schema lookup unavailable'));

    await expect(
      resolveDeploymentMediaModelAvailability({ query } as unknown as DatabaseAdapter),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
