import { describe, expect, it } from 'vitest';
import type { VideoInputImages } from '@features/media/services/media-api-service';
import { resolveVideoRetryInputs, videoInputKindOf } from './videoRetryInputs';

const firstFrame: VideoInputImages = { kind: 'first_frame', imageBase64: 'AAAA' };
const references: VideoInputImages = { kind: 'reference', imagesBase64: ['AAAA', 'BBBB'] };

describe('video retry input custody', () => {
  it('names the conditioning a request carried and nothing for a prompt-only request', () => {
    expect(videoInputKindOf(firstFrame)).toBe('first_frame');
    expect(videoInputKindOf(references)).toBe('reference');
    expect(videoInputKindOf(undefined)).toBeUndefined();
  });

  it('refuses to repeat a first-frame request after reload dropped the image', () => {
    const result = resolveVideoRetryInputs('first_frame', undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('first-frame image');
  });

  it('refuses to repeat a reference request after reload dropped the images', () => {
    const result = resolveVideoRetryInputs('reference', undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('reference images');
  });

  it('refuses when the retained images are of a different kind than the original', () => {
    expect(resolveVideoRetryInputs('first_frame', references).ok).toBe(false);
    expect(resolveVideoRetryInputs('reference', firstFrame).ok).toBe(false);
  });

  it('replays the retained images unchanged when they match the original kind', () => {
    expect(resolveVideoRetryInputs('first_frame', firstFrame)).toEqual({
      ok: true,
      inputImages: firstFrame,
    });
    expect(resolveVideoRetryInputs('reference', references)).toEqual({
      ok: true,
      inputImages: references,
    });
  });

  it('keeps a prompt-only retry prompt-only', () => {
    expect(resolveVideoRetryInputs(undefined, undefined)).toEqual({
      ok: true,
      inputImages: undefined,
    });
  });
});
