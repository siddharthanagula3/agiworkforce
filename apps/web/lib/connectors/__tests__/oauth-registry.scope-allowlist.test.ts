import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from '@/lib/logger';

import { CONNECTOR_CAPABILITIES } from '../catalog';
import {
  __resetConnectorOAuthRegistryCacheForTests,
  buildAuthorizationUrl,
  getConnectorOAuthProvider,
} from '../oauth-registry';
import {
  CONNECTOR_OAUTH_SCOPE_CEILINGS,
  SCOPE_REVIEW_PENDING,
  filterConnectorScopes,
  isConnectorScopeCeilingEnforced,
} from '../oauth-scope-allowlist';

const REDIRECT_URI = 'https://app.example.com/api/connectors/oauth/callback';

const ENV_KEYS = [
  'CONNECTOR_OAUTH_PROVIDERS_JSON',
  'CONNECTOR_OAUTH_REDIRECT_BASE_URL',
  'NEXT_PUBLIC_APP_URL',
  'CONNECTOR_OAUTH_LINEAR_CLIENT_ID',
  'CONNECTOR_OAUTH_LINEAR_CLIENT_SECRET',
  'CONNECTOR_OAUTH_GMAIL_CLIENT_ID',
  'CONNECTOR_OAUTH_GMAIL_CLIENT_SECRET',
  'CONNECTOR_OAUTH_GOOGLE_DRIVE_CLIENT_ID',
  'CONNECTOR_OAUTH_GOOGLE_DRIVE_CLIENT_SECRET',
  'CONNECTOR_OAUTH_NOTION_CLIENT_ID',
  'CONNECTOR_OAUTH_NOTION_CLIENT_SECRET',
  'CONNECTOR_OAUTH_AIRTABLE_CLIENT_ID',
  'CONNECTOR_OAUTH_AIRTABLE_CLIENT_SECRET',
];

function envPrefix(connectorId: string): string {
  return `CONNECTOR_OAUTH_${connectorId.toUpperCase().replace(/-/g, '_')}`;
}

function configure(connectorId: string, scopes: readonly string[]): void {
  process.env['CONNECTOR_OAUTH_PROVIDERS_JSON'] = JSON.stringify({
    providers: [
      {
        connectorId,
        authorizationUrl: 'https://auth.example.com/authorize',
        tokenUrl: 'https://auth.example.com/token',
        mcpUrl: 'https://mcp.example.com/sse',
        scopes,
      },
    ],
  });
  process.env[`${envPrefix(connectorId)}_CLIENT_ID`] = 'client-id-value';
  process.env[`${envPrefix(connectorId)}_CLIENT_SECRET`] = 'client-secret-value';
  __resetConnectorOAuthRegistryCacheForTests();
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

describe('connector OAuth scope ceiling, operator descriptors cannot exceed it', () => {
  it('drops a scope above the ceiling and keeps the ones on it', () => {
    configure('linear', ['read', 'write', 'admin']);
    expect(getConnectorOAuthProvider('linear')?.scopes).toEqual(['read', 'write']);
  });

  it('logs the connector and the exact scopes it dropped', () => {
    configure('linear', ['read', 'admin', 'app:mentionable']);
    getConnectorOAuthProvider('linear');
    expect(logger.warn).toHaveBeenCalledWith(
      { connectorId: 'linear', dropped: ['admin'] },
      expect.stringContaining('above the documented ceiling'),
    );
  });

  it('passes an entirely on-ceiling scope set through unchanged and logs nothing', () => {
    const requested = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
    ];
    configure('gmail', requested);
    expect(getConnectorOAuthProvider('gmail')?.scopes).toEqual(requested);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('keeps an empty scope list empty without warning', () => {
    configure('gmail', []);
    expect(getConnectorOAuthProvider('gmail')?.scopes).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('refuses the broad Gmail scopes the desktop client still requests', () => {
    configure('gmail', [
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
    ]);
    expect(getConnectorOAuthProvider('gmail')?.scopes).toEqual([
      'https://www.googleapis.com/auth/gmail.send',
    ]);
  });

  it('refuses the unrestricted Drive scope while keeping drive.file', () => {
    configure('google-drive', [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
    ]);
    expect(getConnectorOAuthProvider('google-drive')?.scopes).toEqual([
      'https://www.googleapis.com/auth/drive.file',
    ]);
  });

  it('requests no scope at all for a provider whose OAuth has no scope parameter', () => {
    configure('notion', ['read_content', 'update_content']);
    const provider = getConnectorOAuthProvider('notion');
    expect(provider?.scopes).toEqual([]);
    expect(
      new URL(
        buildAuthorizationUrl({
          provider: provider!,
          redirectUri: REDIRECT_URI,
          state: 'a'.repeat(64),
          codeChallenge: null,
        }),
      ).searchParams.has('scope'),
    ).toBe(false);
  });

  it('sends only the surviving scopes on the authorization URL', () => {
    configure('linear', ['read', 'admin', 'write']);
    const provider = getConnectorOAuthProvider('linear')!;
    const url = new URL(
      buildAuthorizationUrl({
        provider,
        redirectUri: REDIRECT_URI,
        state: 'a'.repeat(64),
        codeChallenge: 'challenge-value',
      }),
    );
    expect(url.searchParams.get('scope')).toBe('read write');
  });

  it('leaves a connector with no reviewed ceiling untouched rather than failing closed', () => {
    configure('airtable', ['schema.bases:read']);
    expect(getConnectorOAuthProvider('airtable')?.scopes).toEqual(['schema.bases:read']);
  });
});

describe('connector OAuth scope ceiling, the table itself', () => {
  it('covers every oauth2 connector in the catalog', () => {
    const missing = Object.values(CONNECTOR_CAPABILITIES)
      .filter((record) => record.authScheme === 'oauth2')
      .map((record) => record.id)
      .filter((id) => CONNECTOR_OAUTH_SCOPE_CEILINGS[id] === undefined);
    expect(missing).toEqual([]);
  });

  it('marks an unresearched provider as pending instead of leaving it enforced-empty', () => {
    expect(CONNECTOR_OAUTH_SCOPE_CEILINGS['calendly']).toBe(SCOPE_REVIEW_PENDING);
    expect(isConnectorScopeCeilingEnforced('calendly')).toBe(false);
    expect(isConnectorScopeCeilingEnforced('gmail')).toBe(true);
    expect(filterConnectorScopes('calendly', ['anything']).scopes).toEqual(['anything']);
  });

  it('never admits an administrative or unrestricted scope for an enforced connector', () => {
    const forbidden = [
      'admin',
      'full',
      'default',
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/cloud-platform',
      'Files.ReadWrite.All',
      'Sites.FullControl.All',
      'Mail.ReadWrite',
    ];
    for (const [connectorId, ceiling] of Object.entries(CONNECTOR_OAUTH_SCOPE_CEILINGS)) {
      if (ceiling === SCOPE_REVIEW_PENDING) continue;
      const overlap = ceiling.filter((scope) => forbidden.includes(scope));
      expect(overlap, `${connectorId} admits an over-broad scope`).toEqual([]);
    }
  });
});
