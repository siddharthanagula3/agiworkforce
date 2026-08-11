import { describe, expect, it } from 'vitest';
import golden from '../__fixtures__/managed-media-requests.golden.json';
import {
  ManagedMediaImageGenerationRequestSchema,
  ManagedMediaVideoGenerationRequestSchema,
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
});
