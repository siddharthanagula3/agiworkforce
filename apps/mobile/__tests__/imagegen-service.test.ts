import { getGeneratedImageUri } from '../src/features/image/services/imagegen';

describe('image generation service', () => {
  it('uses hosted image URLs when the API returns a URL', () => {
    expect(getGeneratedImageUri({ url: 'https://example.com/image.png' })).toBe(
      'https://example.com/image.png',
    );
  });

  it('converts base64 image payloads into renderable data URIs', () => {
    expect(getGeneratedImageUri({ b64_json: 'abc123' })).toBe('data:image/png;base64,abc123');
  });

  it('returns null when the API response has no renderable image payload', () => {
    expect(getGeneratedImageUri(undefined)).toBeNull();
    expect(getGeneratedImageUri({})).toBeNull();
  });
});
