import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  assertResolvedPublicHostname: vi.fn(async (..._args: unknown[]) => undefined),
  discoverOAuthServerInfo: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  }),
}));
vi.mock('@/lib/egress-policy', () => ({
  assertResolvedPublicHostname: (...args: unknown[]) => mocks.assertResolvedPublicHostname(...args),
}));
vi.mock('@modelcontextprotocol/client', () => ({
  discoverOAuthServerInfo: (...args: unknown[]) => mocks.discoverOAuthServerInfo(...args),
}));

import {
  authModeFromProbe,
  probeRemoteAuthMode,
  resolveAuthModeForRecord,
} from '@/lib/connectors/directory/auth-probe';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

describe('probeRemoteAuthMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertResolvedPublicHostname.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue([]);
  });

  it('reports open when discovery finds no protected-resource metadata', async () => {
    mocks.discoverOAuthServerInfo.mockResolvedValueOnce({});

    await expect(probeRemoteAuthMode('https://open.example.com/mcp')).resolves.toBe('open');
  });

  it('reports oauth-required when discovery finds resource metadata', async () => {
    mocks.discoverOAuthServerInfo.mockResolvedValueOnce({ resourceMetadata: {} });

    await expect(probeRemoteAuthMode('https://protected.example.com/mcp')).resolves.toBe(
      'oauth-required',
    );
  });

  it('reports unresolved when the hostname fails the egress guard, without calling discovery', async () => {
    mocks.assertResolvedPublicHostname.mockRejectedValueOnce(new Error('internal host'));

    await expect(probeRemoteAuthMode('https://169.254.169.254/mcp')).resolves.toBe('unresolved');
    expect(mocks.discoverOAuthServerInfo).not.toHaveBeenCalled();
  });

  it('reuses a cached verdict instead of probing again', async () => {
    mocks.query.mockResolvedValueOnce([
      { value: 'open', stamp: '1', expires_at_ms: String(Date.now() + 60_000), scope: 'public' },
    ]);

    await expect(probeRemoteAuthMode('https://cached.example.com/mcp')).resolves.toBe('open');
    expect(mocks.discoverOAuthServerInfo).not.toHaveBeenCalled();
  });
});

describe('authModeFromProbe', () => {
  it('maps every probe outcome to a directory auth mode', () => {
    expect(authModeFromProbe('open')).toBe('none');
    expect(authModeFromProbe('oauth-required')).toBe('oauth');
    expect(authModeFromProbe('unresolved')).toBe('unknown');
  });
});

describe('resolveAuthModeForRecord', () => {
  const baseRecord: Omit<DirectoryRecord, 'authMode' | 'connectable' | 'remotes'> = {
    id: 'x',
    name: 'x',
    publisher: 'x',
    description: 'd',
    categories: [],
    toolNames: [],
    repositoryUrl: null,
    version: null,
    sourceRegistry: 'mcp-registry',
    badge: 'community',
    iconUrl: null,
    monogram: 'X',
    documentationUrl: null,
    iconSource: 'monogram',
    brandSlug: null,
    authorName: null,
    authorUrl: null,
    websiteUrl: null,
    supportUrl: null,
    privacyPolicyUrl: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertResolvedPublicHostname.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue([]);
  });

  it('leaves an already-resolved record untouched', async () => {
    const record: DirectoryRecord = {
      ...baseRecord,
      authMode: 'api-key',
      connectable: 'api-key-form',
      remotes: [],
    };

    await expect(resolveAuthModeForRecord(record)).resolves.toBe(record);
    expect(mocks.discoverOAuthServerInfo).not.toHaveBeenCalled();
  });

  it('upgrades an unknown record once discovery resolves it', async () => {
    mocks.discoverOAuthServerInfo.mockResolvedValueOnce({});
    const record: DirectoryRecord = {
      ...baseRecord,
      authMode: 'unknown',
      connectable: 'needs-setup',
      remotes: [{ url: 'https://open.example.com/mcp', transport: 'streamable-http' }],
    };

    const resolved = await resolveAuthModeForRecord(record);
    expect(resolved.authMode).toBe('none');
    expect(resolved.connectable).toBe('connect');
  });
});
