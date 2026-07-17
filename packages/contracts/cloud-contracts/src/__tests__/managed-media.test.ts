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
    expect(ManagedMediaImageGenerationRequestSchema.parse({ prompt: 'image' })).toMatchObject({
      prompt: 'image',
      size: '1024x1024',
      n: 1,
      quality: 'standard',
    });
    expect(ManagedMediaVideoGenerationRequestSchema.parse({ prompt: 'video' })).toMatchObject({
      prompt: 'video',
      duration_secs: 5,
      resolution: '720p',
    });
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
        provider: 'google_imagen',
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
