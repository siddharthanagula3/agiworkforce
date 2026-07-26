import { API_URL } from '../lib/constants';
import {
  getDurableGeneratedImagePath,
  getGeneratedImageUri,
  resolveGeneratedImageUri,
} from '../src/features/image/services/imagegen';

describe('image generation service', () => {
  const durablePath = '/api/files/22222222-2222-4222-8222-222222222222';

  it('recognizes a durable owner-scoped file path from the API', () => {
    expect(getGeneratedImageUri({ url: durablePath })).toBe(durablePath);
    expect(getDurableGeneratedImagePath({ url: durablePath })).toBe(durablePath);
  });

  it('resolves a validated file path only against the configured AGI Cloud origin', () => {
    expect(resolveGeneratedImageUri(durablePath)).toBe(
      `${API_URL}/api/files/22222222-2222-4222-8222-222222222222`,
    );
  });

  it('allows immediate rendering but rejects non-durable media for persistence', () => {
    expect(getGeneratedImageUri({ url: 'https://example.com/image.png' })).toBe(
      'https://example.com/image.png',
    );
    expect(getGeneratedImageUri({ b64_json: 'abc123' })).toBe('data:image/png;base64,abc123');
    expect(getDurableGeneratedImagePath({ url: 'https://example.com/image.png' })).toBeNull();
    expect(getDurableGeneratedImagePath({ url: '/api/files/not-a-uuid' })).toBeNull();
    expect(getDurableGeneratedImagePath({ b64_json: 'abc123' })).toBeNull();
    expect(resolveGeneratedImageUri('https://example.com/image.png')).toBeNull();
  });

  it('returns null when the API response has no renderable image payload', () => {
    expect(getGeneratedImageUri(undefined)).toBeNull();
    expect(getGeneratedImageUri({})).toBeNull();
  });
});
