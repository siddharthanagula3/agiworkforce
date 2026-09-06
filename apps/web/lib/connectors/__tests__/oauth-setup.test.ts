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

import { __resetConnectorOAuthRegistryCacheForTests } from '@/lib/connectors/oauth-registry';
import { describeConnectorSetup, describeDiscoveredConnectorSetup } from '../oauth-setup';

const ENV_KEYS = [
  'CONNECTOR_OAUTH_PROVIDERS_JSON',
  'CONNECTOR_OAUTH_REDIRECT_BASE_URL',
  'NEXT_PUBLIC_APP_URL',
  'CONNECTOR_OAUTH_GMAIL_CLIENT_ID',
  'CONNECTOR_OAUTH_GMAIL_CLIENT_SECRET',
  'CONNECTOR_OAUTH_GOOGLE_DRIVE_CLIENT_ID',
  'CONNECTOR_OAUTH_GOOGLE_DRIVE_CLIENT_SECRET',
  'CONNECTOR_OAUTH_SLACK_CLIENT_ID',
  'CONNECTOR_OAUTH_SLACK_CLIENT_SECRET',
];

function describeProvider(connectorId: string): void {
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
  __resetConnectorOAuthRegistryCacheForTests();
}

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = 'https://app.example.com';
  mocks.missingGithubVars = [];
  __resetConnectorOAuthRegistryCacheForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const key of ENV_KEYS) delete process.env[key];
  __resetConnectorOAuthRegistryCacheForTests();
});

describe('describeConnectorSetup', () => {
  it('names the descriptor and both client env names for an unconfigured first-party OAuth connector', () => {
    const requirement = describeConnectorSetup('gmail', 'Gmail');
    expect(requirement).toMatchObject({
      connectorId: 'gmail',
      kind: 'oauth-client-pair',
      missingEnv: [
        'CONNECTOR_OAUTH_PROVIDERS_JSON',
        'CONNECTOR_OAUTH_GMAIL_CLIENT_ID',
        'CONNECTOR_OAUTH_GMAIL_CLIENT_SECRET',
      ],
    });
    expect(requirement?.message).toBe(
      'Gmail needs CONNECTOR_OAUTH_PROVIDERS_JSON, CONNECTOR_OAUTH_GMAIL_CLIENT_ID and CONNECTOR_OAUTH_GMAIL_CLIENT_SECRET on this deployment.',
    );
  });

  it('narrows to the client pair once the descriptor exists', () => {
    describeProvider('google-drive');
    expect(describeConnectorSetup('google-drive', 'Google Drive')).toMatchObject({
      missingEnv: [
        'CONNECTOR_OAUTH_GOOGLE_DRIVE_CLIENT_ID',
        'CONNECTOR_OAUTH_GOOGLE_DRIVE_CLIENT_SECRET',
      ],
      message:
        'Google Drive needs CONNECTOR_OAUTH_GOOGLE_DRIVE_CLIENT_ID and CONNECTOR_OAUTH_GOOGLE_DRIVE_CLIENT_SECRET on this deployment.',
    });
  });

  it('reports nothing once the pair and descriptor are present', () => {
    describeProvider('slack');
    process.env['CONNECTOR_OAUTH_SLACK_CLIENT_ID'] = 'id';
    process.env['CONNECTOR_OAUTH_SLACK_CLIENT_SECRET'] = 'secret';
    __resetConnectorOAuthRegistryCacheForTests();
    expect(describeConnectorSetup('slack', 'Slack')).toBeNull();
  });

  it('asks only for the public callback origin on a self-service MCP endpoint', () => {
    expect(describeConnectorSetup('notion', 'Notion')).toBeNull();
    delete process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'];
    expect(describeConnectorSetup('notion', 'Notion')).toMatchObject({
      kind: 'oauth-redirect-base',
      missingEnv: ['CONNECTOR_OAUTH_REDIRECT_BASE_URL'],
      message:
        'Notion needs CONNECTOR_OAUTH_REDIRECT_BASE_URL set to a public HTTPS origin on this deployment.',
    });
  });

  it('lists the GitHub App variables that are still unset', () => {
    mocks.missingGithubVars = ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY_BASE64'];
    expect(describeConnectorSetup('github', 'GitHub')).toMatchObject({
      kind: 'github-app',
      missingEnv: ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY_BASE64'],
      message: 'GitHub needs GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_BASE64 on this deployment.',
    });
    mocks.missingGithubVars = [];
    expect(describeConnectorSetup('github', 'GitHub')).toBeNull();
  });

  it('says plainly that a connector without a remote server cannot be connected here', () => {
    expect(describeConnectorSetup('trello', 'Trello')).toMatchObject({
      kind: 'no-remote',
      missingEnv: [],
      message:
        'Trello has no remote MCP server this deployment can reach, so it cannot be connected from the browser.',
    });
  });

  it('treats device-local connectors as needing no cloud setup', () => {
    expect(describeConnectorSetup('local-filesystem')).toBeNull();
  });

  it('names the secret store key when production has none', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(describeConnectorSetup('notion', 'Notion')).toMatchObject({
      kind: 'token-storage',
      missingEnv: ['CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY'],
    });
    expect(describeDiscoveredConnectorSetup('io.github.someone/tool', 'Tool')?.kind).toBe(
      'token-storage',
    );
  });

  it('describes a discovered directory server by its callback origin only', () => {
    expect(describeDiscoveredConnectorSetup('io.github.someone/tool', 'Tool')).toBeNull();
    delete process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'];
    expect(describeDiscoveredConnectorSetup('io.github.someone/tool', 'Tool')?.message).toBe(
      'Tool needs CONNECTOR_OAUTH_REDIRECT_BASE_URL set to a public HTTPS origin on this deployment.',
    );
  });

  it('never leaks a configured value, only names', () => {
    describeProvider('slack');
    process.env['CONNECTOR_OAUTH_SLACK_CLIENT_ID'] = 'super-secret-id';
    __resetConnectorOAuthRegistryCacheForTests();
    const requirement = describeConnectorSetup('slack', 'Slack');
    expect(JSON.stringify(requirement)).not.toContain('super-secret-id');
    expect(requirement?.missingEnv).toEqual(['CONNECTOR_OAUTH_SLACK_CLIENT_SECRET']);
  });
});
