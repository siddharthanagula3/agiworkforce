import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  providerProxyAuthHeader,
  providerProxyBaseUrl,
  providerProxyDefaultBaseUrl,
  providerProxyHost,
  resolveAppOrigin,
} from '../provider-proxy';

describe('provider proxy constants', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.agiworkforce.test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('names the auth header and default upstream for anthropic', () => {
    expect(providerProxyAuthHeader('anthropic')).toBe('x-api-key');
    expect(providerProxyDefaultBaseUrl('anthropic')).toBe('https://api.anthropic.com');
  });

  it('names the bearer header and default upstream for openai', () => {
    expect(providerProxyAuthHeader('openai')).toBe('authorization');
    expect(providerProxyDefaultBaseUrl('openai')).toBe('https://api.openai.com/v1');
  });

  it('knows nothing about a provider it does not cover', () => {
    expect(providerProxyAuthHeader('google')).toBeUndefined();
    expect(providerProxyDefaultBaseUrl('google')).toBeUndefined();
  });

  it('prefers the explicit proxy origin over the public app url', () => {
    vi.stubEnv('AGI_PROVIDER_PROXY_ORIGIN', 'https://tunnel.agiworkforce.test/');
    expect(resolveAppOrigin()).toBe('https://tunnel.agiworkforce.test');
    expect(providerProxyBaseUrl('sess-1')).toContain('https://tunnel.agiworkforce.test/');
    vi.unstubAllEnvs();
  });

  it('builds the proxy base URL and host from the deployment origin', () => {
    expect(resolveAppOrigin()).toBe('https://app.agiworkforce.test');
    expect(providerProxyBaseUrl('sess-1')).toBe(
      'https://app.agiworkforce.test/api/code/sessions/sess-1/provider-proxy',
    );
    expect(providerProxyHost()).toBe('app.agiworkforce.test');
  });

  it('is null when the deployment origin is not configured', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(resolveAppOrigin()).toBeNull();
    expect(providerProxyBaseUrl('sess-1')).toBeNull();
    expect(providerProxyHost()).toBeNull();
  });

  it('is null when the deployment origin is malformed', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'not a url');
    expect(resolveAppOrigin()).toBeNull();
  });
});
