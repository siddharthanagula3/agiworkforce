import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  __resetConnectorOAuthRegistryCacheForTests,
  buildAuthorizationUrl,
  buildConnectorOAuthStartPath,
  getConnectorOAuthProvider,
  getConnectorOAuthRedirectUri,
  getOAuthConfiguredConnectorIds,
  isAllowedConnectorOAuthRedirectUri,
  isConnectorOAuthSupported,
  sanitizeConnectorReturnPath,
} from '../oauth-registry';

const ENV_KEYS = [
  'CONNECTOR_OAUTH_PROVIDERS_JSON',
  'CONNECTOR_OAUTH_REDIRECT_BASE_URL',
  'NEXT_PUBLIC_APP_URL',
  'CONNECTOR_OAUTH_LINEAR_CLIENT_ID',
  'CONNECTOR_OAUTH_LINEAR_CLIENT_SECRET',
  'CONNECTOR_OAUTH_GOOGLE_CALENDAR_CLIENT_ID',
  'CONNECTOR_OAUTH_GOOGLE_CALENDAR_CLIENT_SECRET',
];

function describeProvider(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    connectorId: 'linear',
    displayName: 'Linear',
    authorizationUrl: 'https://auth.example.com/authorize',
    tokenUrl: 'https://auth.example.com/token',
    mcpUrl: 'https://mcp.example.com/sse',
    scopes: ['read', 'write'],
    ...overrides,
  };
}

function setProviders(...providers: Record<string, unknown>[]): void {
  process.env['CONNECTOR_OAUTH_PROVIDERS_JSON'] = JSON.stringify({ providers });
  __resetConnectorOAuthRegistryCacheForTests();
}

function setCredentials(): void {
  process.env['CONNECTOR_OAUTH_LINEAR_CLIENT_ID'] = 'client-id-value';
  process.env['CONNECTOR_OAUTH_LINEAR_CLIENT_SECRET'] = 'client-secret-value';
}

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = 'https://app.example.com';
  __resetConnectorOAuthRegistryCacheForTests();
});

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  __resetConnectorOAuthRegistryCacheForTests();
});

describe('connector OAuth registry — availability is earned, not assumed', () => {
  it('ships with no providers when the operator has configured nothing', () => {
    expect([...getOAuthConfiguredConnectorIds()]).toEqual([]);
    expect(getConnectorOAuthProvider('linear')).toBeNull();
  });

  it('supports self-service OAuth without treating preregistered providers as configured', () => {
    expect(isConnectorOAuthSupported('airtable')).toBe(true);
    expect(isConnectorOAuthSupported('linear')).toBe(true);
    expect(isConnectorOAuthSupported('dropbox')).toBe(false);
    expect(isConnectorOAuthSupported('unknown-connector')).toBe(false);
  });

  it('does not advertise a described provider until its client credentials exist', () => {
    setProviders(describeProvider());
    expect([...getOAuthConfiguredConnectorIds()]).toEqual([]);

    process.env['CONNECTOR_OAUTH_LINEAR_CLIENT_ID'] = 'client-id-value';
    __resetConnectorOAuthRegistryCacheForTests();
    expect([...getOAuthConfiguredConnectorIds()]).toEqual([]);

    setCredentials();
    __resetConnectorOAuthRegistryCacheForTests();
    expect([...getOAuthConfiguredConnectorIds()]).toEqual(['linear']);
  });

  it('accepts a public client with only a client id', () => {
    setProviders(describeProvider({ tokenAuthMethod: 'none' }));
    process.env['CONNECTOR_OAUTH_LINEAR_CLIENT_ID'] = 'client-id-value';
    __resetConnectorOAuthRegistryCacheForTests();

    expect(getConnectorOAuthProvider('linear')?.clientSecret).toBeNull();
  });

  it('reads credentials from the connectorId-derived env names', () => {
    setProviders(
      describeProvider({ connectorId: 'google-calendar', displayName: 'Google Calendar' }),
    );
    process.env['CONNECTOR_OAUTH_GOOGLE_CALENDAR_CLIENT_ID'] = 'id';
    process.env['CONNECTOR_OAUTH_GOOGLE_CALENDAR_CLIENT_SECRET'] = 'secret';
    __resetConnectorOAuthRegistryCacheForTests();

    expect(getConnectorOAuthProvider('google-calendar')?.clientId).toBe('id');
    expect(isConnectorOAuthSupported('google-calendar')).toBe(true);
  });

  it('yields ZERO providers from a malformed env value rather than a partial set', () => {
    setCredentials();
    process.env['CONNECTOR_OAUTH_PROVIDERS_JSON'] = '{not json';
    __resetConnectorOAuthRegistryCacheForTests();
    expect([...getOAuthConfiguredConnectorIds()]).toEqual([]);

    setProviders(describeProvider(), { connectorId: 'broken' });
    expect([...getOAuthConfiguredConnectorIds()]).toEqual([]);
  });

  it('rejects a non-HTTPS authorization, token, or MCP endpoint', () => {
    setCredentials();
    for (const field of ['authorizationUrl', 'tokenUrl', 'mcpUrl']) {
      setProviders(describeProvider({ [field]: 'http://auth.example.com/x' }));
      expect([...getOAuthConfiguredConnectorIds()]).toEqual([]);
    }
  });

  it('refuses ids reserved by other connector sources', () => {
    setCredentials();
    process.env['CONNECTOR_OAUTH_GITHUB_CLIENT_ID'] = 'id';
    process.env['CONNECTOR_OAUTH_GITHUB_CLIENT_SECRET'] = 'secret';
    setProviders(
      describeProvider({ connectorId: 'github' }),
      describeProvider({ connectorId: 'custom-abc' }),
      describeProvider({ connectorId: 'orgmcp-abc' }),
    );
    expect([...getOAuthConfiguredConnectorIds()]).toEqual([]);
    delete process.env['CONNECTOR_OAUTH_GITHUB_CLIENT_ID'];
    delete process.env['CONNECTOR_OAUTH_GITHUB_CLIENT_SECRET'];
  });

  it('refuses a connectorId that would break the mcp__server__tool parser', () => {
    setCredentials();
    setProviders(describeProvider({ connectorId: 'my_connector' }));
    expect([...getOAuthConfiguredConnectorIds()]).toEqual([]);
  });

  it('skips a disabled entry', () => {
    setCredentials();
    setProviders(describeProvider({ enabled: false }));
    expect([...getOAuthConfiguredConnectorIds()]).toEqual([]);
  });

  it('refuses an operator override of a broker-owned OAuth parameter', () => {
    setCredentials();
    setProviders(describeProvider({ authorizationParams: { redirect_uri: 'https://evil.test' } }));
    expect([...getOAuthConfiguredConnectorIds()]).toEqual([]);
  });
});

describe('connector OAuth registry — redirect URI', () => {
  it('derives the callback from configuration and never from a request', () => {
    expect(getConnectorOAuthRedirectUri()).toBe(
      'https://app.example.com/api/connectors/oauth/callback',
    );
    expect(
      isAllowedConnectorOAuthRedirectUri('https://evil.test/api/connectors/oauth/callback'),
    ).toBe(false);
  });

  it('falls back to the app URL when no dedicated base is set', () => {
    delete process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'];
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://agi.example.com';
    expect(getConnectorOAuthRedirectUri()).toBe(
      'https://agi.example.com/api/connectors/oauth/callback',
    );
  });

  it('reports no providers at all when there is no usable callback origin', () => {
    setCredentials();
    setProviders(describeProvider());
    expect([...getOAuthConfiguredConnectorIds()]).toEqual(['linear']);

    delete process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'];
    expect(getConnectorOAuthRedirectUri()).toBeNull();
    expect([...getOAuthConfiguredConnectorIds()]).toEqual([]);
  });

  it('rejects a non-HTTPS callback origin outside development', () => {
    const previous = process.env.NODE_ENV;
    vi.stubEnv('NODE_ENV', 'production');
    process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = 'http://app.example.com';
    expect(getConnectorOAuthRedirectUri()).toBeNull();
    vi.stubEnv('NODE_ENV', previous ?? 'test');
  });
});

describe('connector OAuth registry — authorization URL', () => {
  beforeEach(() => {
    setCredentials();
    setProviders(describeProvider({ authorizationParams: { prompt: 'consent' } }));
  });

  it('carries PKCE, state, scope, and the allowlisted redirect', () => {
    const provider = getConnectorOAuthProvider('linear');
    expect(provider).not.toBeNull();

    const url = new URL(
      buildAuthorizationUrl({
        provider: provider!,
        redirectUri: 'https://app.example.com/api/connectors/oauth/callback',
        state: 'a'.repeat(64),
        codeChallenge: 'challenge-value',
      }),
    );

    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-id-value');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://app.example.com/api/connectors/oauth/callback',
    );
    expect(url.searchParams.get('state')).toBe('a'.repeat(64));
    expect(url.searchParams.get('scope')).toBe('read write');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-value');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.toString()).not.toContain('client-secret-value');
  });

  it('refuses to build a URL for a redirect the deployment does not issue', () => {
    const provider = getConnectorOAuthProvider('linear')!;
    expect(() =>
      buildAuthorizationUrl({
        provider,
        redirectUri: 'https://evil.test/callback',
        state: 'a'.repeat(64),
        codeChallenge: 'c',
      }),
    ).toThrow(/non-allowlisted redirect/i);
  });
});

describe('sanitizeConnectorReturnPath', () => {
  it('keeps a same-origin path and rejects everything that could leave the origin', () => {
    expect(sanitizeConnectorReturnPath('/settings/connectors')).toBe('/settings/connectors');
    expect(sanitizeConnectorReturnPath('//evil.test')).toBe('/connectors');
    expect(sanitizeConnectorReturnPath('/\\evil.test')).toBe('/connectors');
    expect(sanitizeConnectorReturnPath('https://evil.test')).toBe('/connectors');
    expect(sanitizeConnectorReturnPath(null)).toBe('/connectors');
    expect(sanitizeConnectorReturnPath('/')).toBe('/connectors');
  });

  it('rejects a path the URL parser would collapse into another origin', () => {
    expect(sanitizeConnectorReturnPath('/\t/evil.test')).toBe('/connectors');
    expect(sanitizeConnectorReturnPath('/\n/evil.test')).toBe('/connectors');
    expect(sanitizeConnectorReturnPath('/\r/evil.test')).toBe('/connectors');
    expect(sanitizeConnectorReturnPath('/\t\\evil.test')).toBe('/connectors');
    expect(sanitizeConnectorReturnPath('/\u0000/evil.test')).toBe('/connectors');
    expect(sanitizeConnectorReturnPath('/..//evil.test')).toBe('/connectors');
  });

  it('keeps a legitimate path with a query string and a fragment', () => {
    expect(sanitizeConnectorReturnPath('/settings/connectors?tab=x')).toBe(
      '/settings/connectors?tab=x',
    );
    expect(sanitizeConnectorReturnPath('/settings/connectors?tab=x#panel')).toBe(
      '/settings/connectors?tab=x#panel',
    );
  });

  it('builds a start path that carries only the connector and the return', () => {
    expect(buildConnectorOAuthStartPath('linear', '//evil.test')).toBe(
      '/api/connectors/oauth/start?connectorId=linear&returnPath=%2Fconnectors',
    );
  });
});
