import { describe, expect, it } from 'vitest';
import {
  isTrustedCloudRendererOrigin,
  shouldGrantCloudPermissionCheck,
  shouldGrantCloudPermissionRequest,
} from '../permissionPolicy';

describe('Electron cloud permission policy', () => {
  it('recognizes the cloud app origin', () => {
    expect(isTrustedCloudRendererOrigin('https://agiworkforce.com/chat')).toBe(true);
  });

  it.each([
    'https://accounts.google.com/',
    'https://agiworkforce.com.attacker.test/',
    'agi://cloud/index.html',
    'not a url',
  ])('rejects a non-owned permission origin: %s', (origin) => {
    expect(isTrustedCloudRendererOrigin(origin)).toBe(false);
  });

  it('grants microphone-only media and denies camera or unknown media', () => {
    const requestingUrl = 'https://agiworkforce.com/chat';
    expect(
      shouldGrantCloudPermissionRequest('media', { requestingUrl, mediaTypes: ['audio'] }),
    ).toBe(true);
    expect(
      shouldGrantCloudPermissionRequest('media', { requestingUrl, mediaTypes: ['video'] }),
    ).toBe(false);
    expect(shouldGrantCloudPermissionRequest('media', { requestingUrl })).toBe(false);
  });

  it('applies the same microphone-only rule during permission checks', () => {
    expect(
      shouldGrantCloudPermissionCheck('media', 'https://agiworkforce.com', {
        mediaType: 'audio',
      }),
    ).toBe(true);
    expect(
      shouldGrantCloudPermissionCheck('media', 'https://agiworkforce.com', {
        mediaType: 'video',
      }),
    ).toBe(false);
  });
});
