import { describe, expect, it } from 'vitest';
import { cloudAppOriginFrom } from '../config';

describe('cloudAppOriginFrom', () => {
  it('keeps a loopback origin for an unpackaged build', () => {
    expect(
      cloudAppOriginFrom({
        packaged: false,
        environmentOrigin: 'http://127.0.0.1:4173',
        argumentOrigin: undefined,
      }),
    ).toBe('http://127.0.0.1:4173');
  });

  it('ignores a packaged env origin', () => {
    expect(
      cloudAppOriginFrom({
        packaged: true,
        environmentOrigin: 'http://127.0.0.1:4173',
        argumentOrigin: undefined,
      }),
    ).toBe('https://agiworkforce.com');
  });

  it('honors an allowlisted explicit argument on a packaged build', () => {
    expect(
      cloudAppOriginFrom({
        packaged: true,
        environmentOrigin: 'https://evil.example',
        argumentOrigin: 'http://127.0.0.1:4173/',
      }),
    ).toBe('http://127.0.0.1:4173');
  });

  it('rejects an origin outside the allowlist', () => {
    expect(
      cloudAppOriginFrom({
        packaged: false,
        environmentOrigin: 'https://evil.example',
        argumentOrigin: undefined,
      }),
    ).toBe('https://agiworkforce.com');
  });
});
