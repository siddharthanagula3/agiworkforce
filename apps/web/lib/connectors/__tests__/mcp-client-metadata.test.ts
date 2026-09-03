// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resolveClientMetadataOrigin,
  resolveClientMetadataUrl,
  resolveClientRedirectUri,
} from '../mcp-client-metadata';

const LOCAL_BASE_URL = 'http://localhost:3100';
const PROD_BASE_URL = 'https://app.example.test';

beforeEach(() => {
  delete process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'];
  delete process.env['NEXT_PUBLIC_APP_URL'];
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'];
  delete process.env['NEXT_PUBLIC_APP_URL'];
});

describe('mcp-client-metadata origin resolution', () => {
  it('keeps the CIMD client metadata URL HTTPS-only on a local dev base URL', () => {
    process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = LOCAL_BASE_URL;
    expect(resolveClientMetadataOrigin()).toBeNull();
    expect(resolveClientMetadataUrl()).toBeNull();
  });

  it('resolves a redirect URI for a local dev base URL outside production', () => {
    process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = LOCAL_BASE_URL;
    expect(resolveClientRedirectUri()).toBe(`${LOCAL_BASE_URL}/api/connectors/oauth/callback`);
  });

  it('refuses a local dev base URL in production', () => {
    process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = LOCAL_BASE_URL;
    vi.stubEnv('NODE_ENV', 'production');
    expect(resolveClientRedirectUri()).toBeNull();
    expect(resolveClientMetadataUrl()).toBeNull();
  });

  it('resolves both the metadata URL and redirect URI on a public HTTPS base URL', () => {
    process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = PROD_BASE_URL;
    expect(resolveClientMetadataOrigin()).toBe(PROD_BASE_URL);
    expect(resolveClientRedirectUri()).toBe(`${PROD_BASE_URL}/api/connectors/oauth/callback`);
    expect(resolveClientMetadataUrl()).not.toBeNull();
  });

  it('falls back to NEXT_PUBLIC_APP_URL when no redirect base URL is set', () => {
    process.env['NEXT_PUBLIC_APP_URL'] = PROD_BASE_URL;
    expect(resolveClientRedirectUri()).toBe(`${PROD_BASE_URL}/api/connectors/oauth/callback`);
  });

  it('refuses a non-local plain HTTP base URL', () => {
    process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = 'http://example.test';
    expect(resolveClientRedirectUri()).toBeNull();
  });
});
