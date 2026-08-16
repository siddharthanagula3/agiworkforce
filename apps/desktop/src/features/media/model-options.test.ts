import { getModelMetadataById, getRoutingSlotModel, normalizeModelId } from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_IMAGE_PROVIDER_ID,
  IMAGE_PROVIDER_OPTIONS,
  VIDEO_DISPLAY_NAME,
  VIDEO_MODEL_ID,
  VIDEO_PROVIDER_ID,
} from './model-options';

describe('desktop media model options', () => {
  it('projects every image option from a canonical catalog model', () => {
    expect(IMAGE_PROVIDER_OPTIONS.length).toBeGreaterThan(0);
    expect(IMAGE_PROVIDER_OPTIONS[0]?.id).toBe(DEFAULT_IMAGE_PROVIDER_ID);

    for (const option of IMAGE_PROVIDER_OPTIONS) {
      const metadata = getModelMetadataById(option.model);
      expect(metadata, option.model).not.toBeNull();
      expect(metadata?.id).toBe(option.model);
      expect(normalizeModelId(option.model)).toBe(option.model);
      expect(metadata?.modelType).toBe('image');
      expect(option.label).toContain(metadata!.name);
    }
  });

  it('keeps provider adapter ids separate from catalog model ids', () => {
    const byAdapter = Object.fromEntries(
      IMAGE_PROVIDER_OPTIONS.map((option) => [option.id, option]),
    );

    expect(getModelMetadataById(byAdapter['google_balanced']!.model)?.imageApi).toBe('gemini');
    if (byAdapter['google_fast']) {
      expect(getModelMetadataById(byAdapter['google_fast'].model)?.imageApi).toBe('gemini');
    }
    expect(getModelMetadataById(byAdapter['openai']!.model)?.imageApi).toBe('openai');
    expect(
      IMAGE_PROVIDER_OPTIONS.some(
        (option) => getModelMetadataById(option.model)?.imageApi === 'stability',
      ),
    ).toBe(false);
  });

  it('derives the video model and label from the canonical routing slot', () => {
    const slotModel = getRoutingSlotModel('video_generation');
    const metadata = getModelMetadataById(slotModel);

    expect(VIDEO_MODEL_ID).toBe(slotModel);
    expect(VIDEO_DISPLAY_NAME).toBe(metadata?.name);
    expect(VIDEO_PROVIDER_ID).toBe(metadata?.provider);
    expect(VIDEO_PROVIDER_ID).not.toBe('veo3');
    expect(metadata?.modelType).toBe('video');
  });
});
