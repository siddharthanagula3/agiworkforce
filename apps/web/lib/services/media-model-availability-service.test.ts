import { describe, expect, it } from 'vitest';
import {
  ManagedMediaModelAvailabilityResponseSchema,
  supportsManagedMediaImageEdit,
} from '@agiworkforce/cloud-contracts';
import { getModelMetadataById, isModelLive } from '@agiworkforce/types';
import { resolveMediaModelAvailability } from './media-model-availability-service';

const CHECKED_AT = '2026-08-09T12:00:00.000Z';

function envWith(values: Record<string, string>) {
  return (name: string) => values[name];
}

describe('resolveMediaModelAvailability', () => {
  it('enables only live models whose exact provider credential and storage exist', () => {
    const result = resolveMediaModelAvailability({
      checkedAt: CHECKED_AT,
      imageStorageConfigured: true,
      videoStorageConfigured: true,
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
      getEnv: envWith({ GOOGLE_API_KEY: 'google-test-key' }),
    });
    const withKey = resolveMediaModelAvailability({
      checkedAt: CHECKED_AT,
      imageStorageConfigured: true,
      videoStorageConfigured: true,
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
});

describe('image edit support', () => {
  it('publishes it per image model, so a composer asks the catalog and not a provider name', () => {
    const result = resolveMediaModelAvailability({
      checkedAt: CHECKED_AT,
      imageStorageConfigured: true,
      videoStorageConfigured: true,
      getEnv: envWith({ GEMINI_API_KEY: 'google-test-key', OPENAI_API_KEY: 'openai-test-key' }),
    });

    const images = result.models.filter((model) => model.kind === 'image');
    expect(images.length).toBeGreaterThan(0);
    for (const model of images) {
      const metadata = getModelMetadataById(model.model_id);
      expect(model.supports_edit).toBe(supportsManagedMediaImageEdit(metadata?.imageApi));
    }
    expect(images.some((model) => model.supports_edit === true)).toBe(true);
  });

  it('says nothing about editing for a video model', () => {
    const result = resolveMediaModelAvailability({
      checkedAt: CHECKED_AT,
      imageStorageConfigured: true,
      videoStorageConfigured: true,
      getEnv: envWith({ GEMINI_API_KEY: 'google-test-key' }),
    });

    for (const model of result.models.filter((entry) => entry.kind === 'video')) {
      expect(model.supports_edit).toBeUndefined();
    }
  });
});
