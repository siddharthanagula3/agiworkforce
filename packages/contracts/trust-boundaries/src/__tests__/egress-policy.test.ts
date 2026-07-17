import { describe, expect, it } from 'vitest';

import { OUR_CLOUD_HOSTS, isOurCloudHost, matchesCloudHost } from '../egress-policy';

describe('managed-cloud egress host policy', () => {
  it('recognizes canonical managed-cloud apex hosts and their subdomains', () => {
    for (const host of OUR_CLOUD_HOSTS) {
      expect(isOurCloudHost(host)).toBe(true);
      expect(isOurCloudHost(`api.${host}`)).toBe(true);
    }
  });

  it('normalizes casing and a trailing DNS dot', () => {
    expect(isOurCloudHost('API.AGIWORKFORCE.COM.')).toBe(true);
  });

  it('rejects boundary-confusion lookalikes', () => {
    expect(isOurCloudHost('evilagiworkforce.com')).toBe(false);
    expect(isOurCloudHost('agiworkforce.com.evil.example')).toBe(false);
  });

  it('does not classify user-selected provider hosts as AGI managed cloud', () => {
    expect(isOurCloudHost('api.openai.com')).toBe(false);
    expect(isOurCloudHost('api.anthropic.com')).toBe(false);
  });

  it('treats missing hosts as outside the managed-cloud set', () => {
    expect(isOurCloudHost(null)).toBe(false);
    expect(isOurCloudHost(undefined)).toBe(false);
    expect(isOurCloudHost('')).toBe(false);
  });

  it('supports boundary-safe matching against a caller-provided host set', () => {
    expect(matchesCloudHost('api.staging.example.com', ['staging.example.com'])).toBe(true);
    expect(matchesCloudHost('notstaging.example.com', ['staging.example.com'])).toBe(false);
  });
});
