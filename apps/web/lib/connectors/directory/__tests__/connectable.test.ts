import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  missingGithubVars: [] as string[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/github-app', () => ({
  isGitHubAppConfigured: () => mocks.missingGithubVars.length === 0,
  isGitHubInstallationLinkingAvailable: () => mocks.missingGithubVars.length === 0,
  missingGitHubInstallationLinkingVars: () => mocks.missingGithubVars,
}));

import {
  connectableForInternalId,
  connectableFromAuthMode,
} from '@/lib/connectors/directory/connectable';
import { __resetConnectorOAuthRegistryCacheForTests } from '@/lib/connectors/oauth-registry';

const ENV_KEYS = [
  'CONNECTOR_OAUTH_PROVIDERS_JSON',
  'CONNECTOR_OAUTH_REDIRECT_BASE_URL',
  'NEXT_PUBLIC_APP_URL',
  'CONNECTOR_OAUTH_SLACK_CLIENT_ID',
  'CONNECTOR_OAUTH_SLACK_CLIENT_SECRET',
  'CONNECTOR_OAUTH_SHOPIFY_CLIENT_ID',
  'CONNECTOR_OAUTH_SHOPIFY_CLIENT_SECRET',
];

function configureProvider(connectorId: string): void {
  process.env['CONNECTOR_OAUTH_PROVIDERS_JSON'] = JSON.stringify({
    providers: [
      {
        connectorId,
        authorizationUrl: 'https://auth.example.com/authorize',
        tokenUrl: 'https://auth.example.com/token',
        mcpUrl: 'https://mcp.example.com/mcp',
      },
    ],
  });
  const prefix = `CONNECTOR_OAUTH_${connectorId.toUpperCase()}`;
  process.env[`${prefix}_CLIENT_ID`] = 'client-id-value';
  process.env[`${prefix}_CLIENT_SECRET`] = 'client-secret-value';
  __resetConnectorOAuthRegistryCacheForTests();
}

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = 'https://app.example.com';
  mocks.missingGithubVars = [];
  __resetConnectorOAuthRegistryCacheForTests();
});

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  __resetConnectorOAuthRegistryCacheForTests();
});

describe('connectableForInternalId', () => {
  it('routes device-local connectors to Desktop and CLI', () => {
    expect(connectableForInternalId('local-filesystem')).toBe('desktop-and-cli');
  });

  it('connects github only when every GitHub App variable is present', () => {
    expect(connectableForInternalId('github')).toBe('connect');
    mocks.missingGithubVars = ['GITHUB_APP_ID'];
    expect(connectableForInternalId('github')).toBe('needs-setup');
  });

  it('connects a self-service MCP endpoint once a redirect base is configured', () => {
    expect(connectableForInternalId('notion')).toBe('connect');
  });

  it('holds a self-service MCP endpoint at needs-setup without a redirect base', () => {
    delete process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'];
    expect(connectableForInternalId('notion')).toBe('needs-setup');
  });

  it('gates preregistered MCP endpoints on the operator client pair', () => {
    expect(connectableForInternalId('slack')).toBe('needs-setup');
    configureProvider('slack');
    expect(connectableForInternalId('slack')).toBe('connect');
  });

  it('never offers a credential form for a connector with no remote server', () => {
    expect(connectableForInternalId('openai')).toBe('needs-setup');
    expect(connectableForInternalId('trello')).toBe('needs-setup');
  });

  it('gates generic oauth2 catalog connectors without an MCP endpoint on the client pair', () => {
    expect(connectableForInternalId('shopify')).toBe('needs-setup');
    configureProvider('shopify');
    expect(connectableForInternalId('shopify')).toBe('connect');
  });
});

describe('connectableFromAuthMode', () => {
  it('requires a remote to ever connect', () => {
    expect(connectableFromAuthMode('none', false)).toBe('desktop-and-cli');
  });

  it('treats open servers as connectable without any deployment setup', () => {
    delete process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'];
    expect(connectableFromAuthMode('none', true)).toBe('connect');
  });

  it('treats discovered-oauth servers as connectable only with a redirect base', () => {
    expect(connectableFromAuthMode('oauth', true)).toBe('connect');
    delete process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'];
    expect(connectableFromAuthMode('oauth', true)).toBe('needs-setup');
  });

  it('routes api-key auth to the credential form', () => {
    expect(connectableFromAuthMode('api-key', true)).toBe('api-key-form');
  });

  it('offers connect for unknown auth on a remote so the server can probe it', () => {
    expect(connectableFromAuthMode('unknown', true)).toBe('connect');
  });
});
