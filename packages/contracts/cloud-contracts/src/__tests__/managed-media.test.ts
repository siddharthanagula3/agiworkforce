import { describe, expect, it } from 'vitest';
import golden from '../__fixtures__/managed-media-requests.golden.json';
import {
  MANAGED_MEDIA_MAX_VIDEO_INPUT_IMAGES,
  ManagedMediaImageGenerationRequestSchema,
  ManagedMediaVideoGenerationRequestSchema,
  managedMediaVideoInputImageLimit,
  refineManagedMediaVideoImageInputs,
} from '../managed-media';

describe('managed media cloud request contracts', () => {
  it('accepts the canonical cross-language golden requests', () => {
    expect(ManagedMediaImageGenerationRequestSchema.parse(golden.image)).toEqual(golden.image);
    expect(ManagedMediaVideoGenerationRequestSchema.parse(golden.video)).toEqual(golden.video);
  });

  it('defaults optional image and video fields at the server boundary', () => {
    const image = ManagedMediaImageGenerationRequestSchema.parse({ prompt: 'image' });
    expect(image).toMatchObject({
      prompt: 'image',
      size: '1024x1024',
      n: 1,
      quality: 'standard',
    });
    expect(image).not.toHaveProperty('aspect_ratio');
    expect(ManagedMediaVideoGenerationRequestSchema.parse({ prompt: 'video' })).toMatchObject({
      prompt: 'video',
      duration_secs: 4,
      resolution: '720p',
    });
  });

  it.each(['3:4', '4:3'] as const)('preserves exact image aspect_ratio %s', (aspectRatio) => {
    expect(
      ManagedMediaImageGenerationRequestSchema.parse({
        prompt: 'image',
        aspect_ratio: aspectRatio,
      }).aspect_ratio,
    ).toBe(aspectRatio);
  });

  it('accepts only UUID-shaped Web conversation provenance', () => {
    const conversationId = '0190a000-0000-7000-8000-000000000091';
    expect(
      ManagedMediaImageGenerationRequestSchema.parse({
        prompt: 'image',
        conversation_id: conversationId,
      }).conversation_id,
    ).toBe(conversationId);
    expect(
      ManagedMediaImageGenerationRequestSchema.safeParse({
        prompt: 'image',
        conversation_id: 'not-a-conversation-id',
      }).success,
    ).toBe(false);
  });

  it('rejects an invented image aspect ratio at the trust boundary', () => {
    const result = ManagedMediaImageGenerationRequestSchema.safeParse({
      prompt: 'image',
      aspect_ratio: '7:5',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['aspect_ratio']);
    }
  });

  it('preserves catalog-selectable video shape and audio controls', () => {
    expect(
      ManagedMediaVideoGenerationRequestSchema.parse({
        prompt: 'video',
        provider: 'openrouter',
        duration_secs: 30,
        resolution: '480p',
        aspect_ratio: '21:9',
        generate_audio: false,
      }),
    ).toMatchObject({
      duration_secs: 30,
      resolution: '480p',
      aspect_ratio: '21:9',
      generate_audio: false,
    });
  });

  it('carries a video candidate count in the same envelope image already had', () => {
    expect(ManagedMediaVideoGenerationRequestSchema.parse({ prompt: 'video', n: 4 }).n).toBe(4);
    // Absent means one candidate; the field is not defaulted, so a client that
    // never sends it keeps producing the exact request body it always did.
    expect(ManagedMediaVideoGenerationRequestSchema.parse({ prompt: 'video' })).not.toHaveProperty(
      'n',
    );
    expect(
      ManagedMediaVideoGenerationRequestSchema.safeParse({ prompt: 'video', n: 5 }).success,
    ).toBe(false);
    expect(
      ManagedMediaVideoGenerationRequestSchema.safeParse({ prompt: 'video', n: 0 }).success,
    ).toBe(false);
    expect(
      ManagedMediaVideoGenerationRequestSchema.safeParse({ prompt: 'video', n: 1.5 }).success,
    ).toBe(false);
  });

  it('lets an image caller ask for the durable job handle instead of the images', () => {
    expect(
      ManagedMediaImageGenerationRequestSchema.parse({ prompt: 'image', async: true }).async,
    ).toBe(true);
    expect(ManagedMediaImageGenerationRequestSchema.parse({ prompt: 'image' })).not.toHaveProperty(
      'async',
    );
    expect(
      ManagedMediaImageGenerationRequestSchema.safeParse({ prompt: 'image', async: 'yes' }).success,
    ).toBe(false);
  });

  it('rejects duration and aspect values outside the broad video wire envelope', () => {
    expect(
      ManagedMediaVideoGenerationRequestSchema.safeParse({
        prompt: 'video',
        duration_secs: 31,
      }).success,
    ).toBe(false);
    expect(
      ManagedMediaVideoGenerationRequestSchema.safeParse({
        prompt: 'video',
        aspect_ratio: 'unsupported-aspect',
      }).success,
    ).toBe(false);
  });

  it('rejects null optional fields so clients must omit absent values', () => {
    expect(
      ManagedMediaImageGenerationRequestSchema.safeParse({ prompt: 'image', model: null }).success,
    ).toBe(false);
    expect(
      ManagedMediaVideoGenerationRequestSchema.safeParse({ prompt: 'video', model: null }).success,
    ).toBe(false);
  });

  it('rejects desktop presentation aliases at the cloud boundary', () => {
    expect(
      ManagedMediaImageGenerationRequestSchema.safeParse({
        prompt: 'image',
        provider: 'fixture-ui-provider',
        size: 'large',
        quality: 'premium',
      }).success,
    ).toBe(false);
    expect(
      ManagedMediaVideoGenerationRequestSchema.safeParse({
        prompt: 'video',
        provider: 'veo3',
      }).success,
    ).toBe(false);
  });

  it('rejects unknown fields instead of silently accepting client-server drift', () => {
    expect(
      ManagedMediaImageGenerationRequestSchema.safeParse({ prompt: 'image', plan: 'enterprise' })
        .success,
    ).toBe(false);
    expect(
      ManagedMediaVideoGenerationRequestSchema.safeParse({ prompt: 'video', style: 'cinematic' })
        .success,
    ).toBe(false);
  });

  it('carries a first frame or reference images on a video request, never both', () => {
    const image = { b64_json: 'aGVsbG8=' };
    const schema = ManagedMediaVideoGenerationRequestSchema.superRefine(
      refineManagedMediaVideoImageInputs,
    );
    expect(schema.safeParse({ prompt: 'v', first_frame_image: image }).success).toBe(true);
    expect(schema.safeParse({ prompt: 'v', reference_images: [image, image] }).success).toBe(true);
    expect(
      schema.safeParse({ prompt: 'v', first_frame_image: image, reference_images: [image] })
        .success,
    ).toBe(false);
    expect(schema.safeParse({ prompt: 'v', reference_images: [] }).success).toBe(false);
    expect(
      schema.safeParse({
        prompt: 'v',
        reference_images: Array.from(
          { length: MANAGED_MEDIA_MAX_VIDEO_INPUT_IMAGES + 1 },
          () => image,
        ),
      }).success,
    ).toBe(false);
  });

  it('lets a video model take input images only on catalog evidence and a supporting adapter', () => {
    const imageVideoModel = {
      modelType: 'video',
      inputModalities: ['text', 'image'],
      imageInput: { maxImagesPerRequest: 9 },
    };
    expect(managedMediaVideoInputImageLimit('openrouter', imageVideoModel)).toBe(
      MANAGED_MEDIA_MAX_VIDEO_INPUT_IMAGES,
    );
    expect(
      managedMediaVideoInputImageLimit('openrouter', {
        ...imageVideoModel,
        imageInput: { maxImagesPerRequest: 2 },
      }),
    ).toBe(2);
    expect(managedMediaVideoInputImageLimit('google', imageVideoModel)).toBe(0);
    expect(
      managedMediaVideoInputImageLimit('openrouter', { ...imageVideoModel, imageInput: undefined }),
    ).toBe(0);
    expect(
      managedMediaVideoInputImageLimit('openrouter', {
        ...imageVideoModel,
        inputModalities: ['text'],
      }),
    ).toBe(0);
    expect(
      managedMediaVideoInputImageLimit('openrouter', { ...imageVideoModel, modelType: 'image' }),
    ).toBe(0);
  });
});
