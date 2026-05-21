import { describe, expect, it } from 'vitest';
import { hasInlineRenderer } from '../index';

describe('Inline media renderer registry', () => {
  it('supports canonical and backend media tool aliases', () => {
    expect(hasInlineRenderer('image_generate')).toBe(true);
    expect(hasInlineRenderer('media_generate_image')).toBe(true);
    expect(hasInlineRenderer('video_generate')).toBe(true);
    expect(hasInlineRenderer('media_generate_video')).toBe(true);
  });
});
