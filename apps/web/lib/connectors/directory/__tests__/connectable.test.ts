import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  oauthConfiguredIds: new Set<string>(),
  githubAppConfigured: true,
  githubLinkingAvailable: true,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/connectors/oauth-registry', () => ({
  isConnectorOAuthConfigured: (id: string) => mocks.oauthConfiguredIds.has(id),
}));
vi.mock('@/lib/github-app', () => ({
  isGitHubAppConfigured: () => mocks.githubAppConfigured,
  isGitHubInstallationLinkingAvailable: () => mocks.githubLinkingAvailable,
}));

import {
  connectableForInternalId,
  connectableFromAuthMode,
} from '@/lib/connectors/directory/connectable';

describe('connectableForInternalId', () => {
  beforeEach(() => {
    mocks.oauthConfiguredIds = new Set();
    mocks.githubAppConfigured = true;
    mocks.githubLinkingAvailable = true;
  });

  it('routes device-local connectors to Desktop and CLI', () => {
    expect(connectableForInternalId('local-filesystem')).toBe('desktop-and-cli');
  });

  it('connects github only when the app is configured and linking is available', () => {
    expect(connectableForInternalId('github')).toBe('connect');
    mocks.githubAppConfigured = false;
    expect(connectableForInternalId('github')).toBe('needs-setup');
  });

  it('treats self-service MCP endpoints as always connectable', () => {
    expect(connectableForInternalId('notion')).toBe('connect');
  });

  it('gates preregistered MCP endpoints on operator OAuth configuration', () => {
    expect(connectableForInternalId('slack')).toBe('needs-setup');
    mocks.oauthConfiguredIds = new Set(['slack']);
    expect(connectableForInternalId('slack')).toBe('connect');
  });

  it('routes api-key catalog connectors with no MCP endpoint to the credential form', () => {
    expect(connectableForInternalId('openai')).toBe('api-key-form');
  });

  it('gates generic oauth2 catalog connectors without an MCP endpoint on operator configuration', () => {
    expect(connectableForInternalId('shopify')).toBe('needs-setup');
    mocks.oauthConfiguredIds = new Set(['shopify']);
    expect(connectableForInternalId('shopify')).toBe('connect');
  });
});

describe('connectableFromAuthMode', () => {
  it('requires a remote to ever connect', () => {
    expect(connectableFromAuthMode('none', false)).toBe('desktop-and-cli');
  });

  it('treats open and discovered-oauth servers as connectable', () => {
    expect(connectableFromAuthMode('none', true)).toBe('connect');
    expect(connectableFromAuthMode('oauth', true)).toBe('connect');
  });

  it('routes api-key auth to the credential form', () => {
    expect(connectableFromAuthMode('api-key', true)).toBe('api-key-form');
  });

  it('leaves unknown auth needing setup', () => {
    expect(connectableFromAuthMode('unknown', true)).toBe('needs-setup');
  });
});
