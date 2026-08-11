import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { isVideoProviderReleaseEnabled } from './video-provider-release-policy';

describe('managed video provider release policy', () => {
  it('admits durable Google and OpenRouter delivery while fail-closing Runway', () => {
    expect(isVideoProviderReleaseEnabled('google')).toBe(true);
    expect(isVideoProviderReleaseEnabled('openrouter')).toBe(true);
    expect(isVideoProviderReleaseEnabled('runway')).toBe(false);
  });
});
